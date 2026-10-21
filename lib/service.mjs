import { resolve, basename } from 'node:path';
import { createStore } from './store.mjs';
import { scanFolder, parsePdf, verifiedPdf } from './pdf.mjs';
import { createTasks, extractionPrompt, synthesisPrompt, branchPrompt, comparePrompt, paperMaterial } from './ai.mjs';
import { validateExtraction, buildGraph, synthesizeGraph, replayEdits, applyGraphEdit, branchGraph, validateConnections, graphContext } from './domain.mjs';
import { crossrefSearch, deduplicatePapers } from './search.mjs';
import { AppError, text, array, uid, now, hash, key, clone } from './util.mjs';

const PROMPT_VERSION = 1;

export async function createService({ file, generator, picker, search = crossrefSearch }) {
  const store = await createStore(file), tasks = createTasks(store, generator);
  function idle() { if (tasks.active()) throw new AppError('任务运行中，请等待完成或先取消', 409); }
  function graphVersion(s, version) { if (s.graph.version !== version) throw new AppError('地图已变化，请刷新后重试', 409); }
  function assertFresh(s) { if (!s.graph.nodes.length) throw new AppError('请先生成论文地图'); if (s.graph.libraryRevision !== s.libraryRevision) throw new AppError('论文库有更新，请先重新生成地图', 409); }

  async function extract(paper, task) {
    if (paper.extraction?.sourceHash === paper.sourceHash && paper.extraction.promptVersion === PROMPT_VERSION) return paper.extraction;
    const passages = paperMaterial(paper);
    const result = await task.ask(extractionPrompt, { title: paper.title, availability: paper.availability, passages }, raw => validateExtraction(raw, paper, passages));
    const extraction = { ...result, sourceHash: paper.sourceHash, promptVersion: PROMPT_VERSION };
    await store.update(s => { const current = s.papers.find(p => p.id === paper.id); if (current?.sourceHash === paper.sourceHash) { current.extraction = extraction; current.summary = result.summary; } });
    return extraction;
  }

  async function analyze(task, progressStart = 0) {
    const initial = store.read(), papers = initial.papers.filter(p => p.status === 'ready' && p.passages.length);
    if (!papers.length) throw new AppError('没有可分析的正文或摘要，请先导入带文字层的 PDF');
    for (let i = 0; i < papers.length; i++) {
      await task.progress(progressStart + (1 - progressStart) * i / (papers.length + 2), `阅读论文 ${i + 1}/${papers.length}：${papers[i].title}`);
      await extract(papers[i], task);
    }
    const after = store.read(), base = buildGraph(after.papers, initial.libraryRevision);
    if (!base.nodes.length) throw new AppError('未提取到有原文支持的概念，上一份地图已保留', 422);
    await task.progress(0.9, '整理同义词、概念分组和探索起点');
    const graph = await task.ask(synthesisPrompt, graphContext(base), raw => synthesizeGraph(base, raw));
    task.signal.throwIfAborted();
    await store.update(s => {
      task.signal.throwIfAborted();
      if (s.libraryRevision !== initial.libraryRevision) throw new AppError('分析期间论文库发生变化，请重试', 409);
      graph.version = (s.graph.version ?? 0) + 1; graph.createdAt = now();
      s.baseGraph = graph; s.graph = replayEdits(graph, s.edits);
    });
    return { concepts: graph.nodes.length, relations: graph.edges.length };
  }

  const service = {
    store, tasks,
    async state() {
      const s = store.read();
      let model = null, modelError = '';
      try { model = generator.selection(); } catch (e) { modelError = e.message; }
      return { ...s, papers: s.papers.map(({ passages, extraction, ...p }) => ({ ...p, passageCount: passages.length, analyzed: Boolean(extraction?.sourceHash === p.sourceHash), coverage: extraction?.coverage ?? null, qualityWarnings: extraction?.warnings ?? [] })), baseGraph: undefined, edits: s.edits.map(({ op, id, actor, createdAt, undoneAt }) => ({ op, id, actor, createdAt, undoneAt })), runs: s.runs.slice(-16).map(({ calls, ...run }) => ({ ...run, callCount: calls.length })), model, modelError, busy: tasks.active(), stale: s.graph.libraryRevision !== s.libraryRevision };
    },
    async pick() { if (!picker) throw new AppError('当前宿主没有目录选择器，请粘贴文件夹路径'); const path = await picker(); return { path }; },
    async import(input) {
      idle();
      let paths, root;
      if (input.folder) { const scanned = await scanFolder(text(input.folder, '文件夹路径', 4000)); paths = scanned.paths; root = scanned.root; }
      else paths = array(input.paths, 'PDF 路径', 200).map(p => resolve(text(p, 'PDF 路径', 4000)));
      if (!paths.length) throw new AppError('文件夹内没有 PDF');
      return tasks.start('import', async task => {
        let imported = 0, skipped = 0, failed = 0;
        if (root) await store.update(s => { if (!s.folders.includes(root)) s.folders.push(root); });
        for (let i = 0; i < paths.length; i++) {
          await task.progress(i / paths.length, `解析 ${i + 1}/${paths.length}：${basename(paths[i])}`);
          try {
            const paper = await parsePdf(paths[i]);
            task.signal.throwIfAborted();
            await store.update(s => {
              const existing = s.papers.find(p => p.path === paper.path);
              if (existing?.sourceHash === paper.sourceHash) { existing.status = 'ready'; existing.title = paper.title; existing.mtimeMs = paper.mtimeMs; delete existing.error; skipped++; return; }
              if (s.papers.some(p => p.sourceHash === paper.sourceHash && p.path !== paper.path)) { skipped++; return; }
              paper.importedAt = existing?.importedAt ?? now(); paper.updatedAt = now();
              if (existing) s.papers[s.papers.indexOf(existing)] = paper; else s.papers.push(paper);
              s.libraryRevision++; imported++;
            });
          } catch (e) {
            if (task.signal.aborted) throw e;
            failed++;
            await store.update(s => {
              const p = s.papers.find(p => p.path === paths[i]);
              if (p) { p.status = 'error'; p.error = e.message; s.libraryRevision++; }
              else s.papers.push({ id: `paper-${hash(paths[i]).slice(0, 16)}`, path: paths[i], title: basename(paths[i]), status: 'error', error: e.message, passages: [], availability: 'fulltext' });
            });
          }
        }
        return { imported, skipped, failed };
      }, false);
    },
    async refresh() {
      idle();
      const s = store.read(), paths = new Set(s.papers.filter(p => p.path).map(p => p.path));
      for (const folder of s.folders) {
        try { (await scanFolder(folder)).paths.forEach(p => paths.add(p)); }
        catch { /* Existing files still report their individual parse errors. */ }
      }
      return service.import({ paths: [...paths] });
    },
    async analyze() { idle(); return tasks.start('analyze', task => analyze(task)); },
    async branch(input) {
      idle(); const s = store.read(); assertFresh(s);
      const query = text(input.query, '探索方向', 1200), label = text(input.label || query, '方向名称', 80);
      return tasks.start('branch', async task => {
        await task.progress(0.1, `深化方向：${label}`);
        const result = await task.ask(branchPrompt, { query, map: graphContext(s.graph) }, raw => {
          const ids = [...new Set(array(raw.conceptIds, '概念选择', 250))];
          if (ids.some(id => !s.graph.nodes.some(n => n.id === id))) throw new AppError('方向选择包含不存在的概念', 422);
          return { ids, explanation: text(raw.explanation, '方向说明', 2000) };
        });
        const branch = { id: uid(), label, query, explanation: result.explanation, graph: branchGraph(s.graph, result.ids), libraryRevision: s.libraryRevision, graphVersion: s.graph.version, createdAt: now() };
        task.signal.throwIfAborted();
        await store.update(current => { graphVersion(current, s.graph.version); current.branches.push(branch); });
        return { branchId: branch.id, concepts: result.ids.length };
      });
    },
    async compare(input) {
      idle(); const s = store.read(); assertFresh(s);
      const a = s.branches.find(b => b.id === input.a), b = s.branches.find(b => b.id === input.b);
      if (!a || !b || a.id === b.id) throw new AppError('请选择两个不同方向');
      if ([a, b].some(v => v.libraryRevision !== s.libraryRevision || v.graphVersion !== s.graph.version)) throw new AppError('方向依据的地图已更新，请重建方向后比较', 409);
      if (!a.graph.nodes.length || !b.graph.nodes.length) throw new AppError('至少一个方向没有匹配材料，请换一个方向');
      const context = text(input.context || '未提供项目条件，请只提出初步候选问题', '项目条件', 3000);
      return tasks.start('compare', async task => {
        await task.progress(0.15, '比较两个方向的证据与连接机制');
        const result = await task.ask(comparePrompt, { context, branchA: { label: a.label, query: a.query, ...graphContext(a.graph) }, branchB: { label: b.label, query: b.query, ...graphContext(b.graph) } }, raw => validateConnections(raw, a, b));
        const comparison = { id: uid(), a: a.id, b: b.id, labelA: a.label, labelB: b.label, context, ...result, libraryRevision: s.libraryRevision, graphVersion: s.graph.version, createdAt: now() };
        task.signal.throwIfAborted();
        await store.update(current => current.connections.push(comparison));
        return { comparisonId: comparison.id, cards: result.cards.length };
      });
    },
    async edit(input, actor = 'user') {
      idle();
      await store.update(s => {
        graphVersion(s, input.version);
        applyGraphEdit(clone(s.graph), input.op);
        s.edits.push({ id: uid(), op: clone(input.op), actor, createdAt: now() });
        s.graph = replayEdits(s.baseGraph, s.edits); s.graph.version = input.version + 1;
      });
      return { updated: true };
    },
    async undo(input) {
      idle();
      await store.update(s => {
        graphVersion(s, input.version);
        const edit = s.edits.findLast(e => !e.undoneAt);
        if (!edit) throw new AppError('没有可撤销的修改');
        edit.undoneAt = now(); s.graph = replayEdits(s.baseGraph, s.edits); s.graph.version = input.version + 1;
      });
      return { updated: true };
    },
    async conversation(input) {
      idle(); const s = store.read(); assertFresh(s);
      const instruction = text(input.instruction, '地图修改要求', 2000);
      return tasks.start('edit', async task => {
        const op = await task.ask('根据用户明确的地图修改要求，返回 {op:{type:"rename",nodeId,label}} 或 {op:{type:"merge",nodeIds:[],label}} 或 {op:{type:"removeEdge",edgeId}}；不清楚时返回 {op:null,explanation}。只允许这三种操作，不修改证据、不新增论文结论，ID 来自地图。', { instruction, graph: graphContext(s.graph) }, raw => {
          if (!raw.op) throw new AppError(raw.explanation || '请说明要修改的概念或关系', 422);
          applyGraphEdit(clone(s.graph), raw.op); return raw.op;
        });
        task.signal.throwIfAborted();
        await store.update(current => {
          graphVersion(current, s.graph.version); current.edits.push({ id: uid(), op, actor: 'conversation', createdAt: now(), instruction });
          current.graph = replayEdits(current.baseGraph, current.edits); current.graph.version = s.graph.version + 1;
        });
        return { updated: true };
      });
    },
    async saveCard(input) {
      await store.update(s => {
        const comparison = s.connections.find(c => c.id === input.comparisonId), card = comparison?.cards.find(c => c.id === input.cardId);
        if (!card) throw new AppError('结合点不存在', 404);
        card.saved = input.saved === true;
      });
      return { updated: true };
    },
    async supplement(input) {
      idle(); const query = text(input.query, '论文检索词', 500);
      return tasks.start('supplement', async task => {
        await task.progress(0.05, '正在检索 Crossref 论文元数据');
        const candidates = deduplicatePapers(await search(query, task.signal), store.read().papers);
        if (!candidates.length) return { added: 0, message: '没有找到未入库的候选论文' };
        const chosen = await task.ask('从候选论文中选择与检索目标直接相关的 0–3 篇，返回 {selected:[{id,reason}]}。仅依据题录或摘要判断相关性，不能假装阅读全文。不要为凑数选择。', { query, candidates: candidates.map(({ passages, ...p }) => ({ ...p, abstract: passages[0]?.text ?? null })) }, raw => array(raw.selected, '相关论文', 3).map(item => {
          const p = candidates.find(p => p.id === item.id);
          if (!p) throw new AppError('检索筛选引用了不存在的论文', 422);
          return { ...p, relevance: text(item.reason, '选择理由', 1200), importedAt: now(), isNew: true };
        }));
        task.signal.throwIfAborted();
        await store.update(s => { const fresh = deduplicatePapers(chosen, s.papers); s.papers.push(...fresh); if (fresh.length) s.libraryRevision++; });
        if (chosen.length && store.read().papers.some(p => p.status === 'ready' && p.passages.length)) await analyze(task, 0.2);
        return { added: chosen.length, abstracts: chosen.filter(p => p.passages.length).length, metadataOnly: chosen.filter(p => !p.passages.length).length };
      });
    },
    async passages(id) {
      const p = store.read().papers.find(p => p.id === id);
      if (!p) throw new AppError('论文不存在', 404);
      return { paperId: p.id, title: p.title, passages: p.passages };
    },
    async find(query) {
      const q = key(text(query, '关键词', 500));
      return store.read().papers.flatMap(p => p.passages.filter(passage => key(passage.text).includes(q)).map(passage => ({ paperId: p.id, title: p.title, passage }))).slice(0, 30);
    },
    async pdf(id) { return verifiedPdf(store.read().papers.find(p => p.id === id)); },
    async exported() { const s = store.read(); return { schema: s.schema, exportedAt: now(), graph: s.graph, branches: s.branches, connections: s.connections, edits: s.edits }; },
    close: () => tasks.close(),
  };
  return service;
}
