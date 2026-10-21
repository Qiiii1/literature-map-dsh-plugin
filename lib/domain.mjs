import { AppError, array, clone, hash, key, text } from './util.mjs';

const quoteKey = value => String(value).normalize('NFKC').replace(/-\s+/g, '').replace(/\s/g, '').toLowerCase();
const unique = (values, get = v => v.id) => [...new Map(values.map(v => [get(v), v])).values()];
export const blankGraph = () => ({ nodes: [], edges: [], clusters: [], startingPoints: [], libraryRevision: 0 });

export function evidenceFor(input, paper, allowed = paper.passages) {
  return array(input, '原文证据', 10).map(item => {
    let passage = allowed.find(p => p.id === item.passageId);
    const quote = text(item.quote, '引文', 1000);
    let locatorCorrected = false;
    if (passage && !quoteKey(passage.text).includes(quoteKey(quote))) {
      const matches = allowed.filter(p => quoteKey(p.text).includes(quoteKey(quote)));
      // Models sometimes cite an adjacent chunk ID. Repair only an exact quote
      // with an unambiguous page in the same supplied paper/version.
      if (matches.length && new Set(matches.map(p => p.page)).size === 1) { passage = matches[0]; locatorCorrected = true; }
    }
    if (!passage || quoteKey(quote).length < 18 || !quoteKey(passage.text).includes(quoteKey(quote))) throw new AppError('AI 返回的引文无法在指定片段中核验，未采用本次结果', 422);
    return { id: `ev-${hash(`${passage.id}:${quoteKey(quote)}`).slice(0, 20)}`, passageId: passage.id, paperId: paper.id, paperTitle: paper.title, sourceHash: paper.sourceHash, page: passage.page, availability: paper.availability, quote, ...(locatorCorrected ? { locatorCorrected: true, suggestedPassageId: item.passageId } : {}) };
  });
}

export function validateExtraction(raw, paper, provided = paper.passages) {
  const keys = new Set(), warnings = [];
  const reject = (scope, label, reason) => { warnings.push({ scope, label, reason }); return []; };
  const evidence = (items, scope, label) => {
    try { return evidenceFor(items, paper, provided); }
    catch (e) { if (e.status !== 422) throw e; reject(scope, label, e.message); return null; }
  };
  const candidates = array(raw.concepts, '概念', 18);
  const concepts = candidates.flatMap(item => {
    const k = text(item.key, '概念标识', 80), label = text(item.label, '概念名称', 60);
    if (keys.has(k)) throw new AppError('AI 返回了重复概念标识', 422);
    const refs = evidence(item.evidence, 'concept', label);
    if (refs === null) return [];
    if (!refs.length) return reject('concept', label, '概念缺少原文依据');
    keys.add(k);
    return [{ key: k, label, aliases: array(item.aliases ?? [], '同义词', 8).map(v => text(v, '同义词', 120)), evidence: refs }];
  });
  if (candidates.length && !concepts.length) throw new AppError('所有候选概念均未通过原文核验，保留此前结果', 422);
  const relations = array(raw.relations, '关系', 24).flatMap(item => {
    const label = text(item.label, '关系描述', 140);
    if (!keys.has(item.from) || !keys.has(item.to) || item.from === item.to) return reject('relation', label, '关系引用了无效或未通过核验的概念');
    if (!['empirical', 'theoretical', 'discussion'].includes(item.category)) return reject('relation', label, '关系缺少论述类型');
    const refs = evidence(item.evidence, 'relation', label);
    if (refs === null) return [];
    if (!refs.length) return reject('relation', label, '论文关系缺少证据');
    return [{ from: item.from, to: item.to, label, category: item.category, context: text(item.context, '适用语境', 1200), evidence: refs }];
  });
  return { summary: text(raw.summary, '论文摘要说明', 1600), concepts, relations, warnings, coverage: { used: provided.length, total: paper.passages.length } };
}

export function buildGraph(papers, libraryRevision) {
  const nodes = new Map(), edges = [];
  for (const paper of papers) {
    if (!paper.extraction || paper.extraction.sourceHash !== paper.sourceHash) continue;
    const local = new Map();
    for (const concept of paper.extraction.concepts) {
      const id = `concept-${hash(key(concept.label)).slice(0, 16)}`;
      local.set(concept.key, id);
      const existing = nodes.get(id);
      if (existing) {
        existing.evidence = unique([...existing.evidence, ...concept.evidence]);
        existing.aliases = [...new Set([...existing.aliases, ...concept.aliases])];
      } else nodes.set(id, { id, label: concept.label, aliases: concept.aliases, evidence: concept.evidence });
    }
    for (const relation of paper.extraction.relations) {
      edges.push({ ...relation, from: local.get(relation.from), to: local.get(relation.to), id: `relation-${hash(`${paper.id}:${paper.sourceHash}:${relation.from}:${relation.to}:${relation.label}`).slice(0, 18)}`, kind: 'supported' });
    }
  }
  return { nodes: [...nodes.values()], edges, clusters: [], startingPoints: [], libraryRevision, rejectedCount: papers.reduce((n, p) => n + (p.extraction?.warnings?.length ?? 0), 0) };
}

export function mergeNodes(graph, ids, label) {
  const selected = ids.map(id => graph.nodes.find(n => n.id === id));
  if (ids.length < 2 || new Set(ids).size !== ids.length || selected.some(n => !n)) throw new AppError('请选择至少两个有效概念');
  const target = selected[0];
  target.aliases = [...new Set([...selected.flatMap(n => [n.label, ...n.aliases]), ...target.aliases])];
  target.label = text(label ?? target.label, '合并后的名称', 60);
  target.evidence = unique(selected.flatMap(n => n.evidence));
  graph.nodes = graph.nodes.filter(n => !ids.slice(1).includes(n.id));
  for (const edge of graph.edges) {
    if (ids.includes(edge.from)) edge.from = target.id;
    if (ids.includes(edge.to)) edge.to = target.id;
  }
  graph.edges = graph.edges.filter(e => e.from !== e.to);
  for (const cluster of graph.clusters) cluster.conceptIds = [...new Set(cluster.conceptIds.map(id => ids.includes(id) ? target.id : id))];
  graph.startingPoints = unique(graph.startingPoints.map(v => ({ ...v, conceptId: ids.includes(v.conceptId) ? target.id : v.conceptId })), v => v.conceptId);
  return target.id;
}

export function synthesizeGraph(base, raw) {
  const graph = clone(base), remap = new Map(graph.nodes.map(n => [n.id, n.id]));
  const resolveId = id => { let current = remap.get(id); while (current && remap.get(current) !== current) current = remap.get(current); return current; };
  for (const merge of array(raw.merges ?? [], '概念合并', 60)) {
    const ids = [...new Set(array(merge.conceptIds, '合并概念', 30).map(resolveId))];
    const target = mergeNodes(graph, ids, merge.label);
    for (const id of ids) remap.set(id, target);
  }
  const assigned = new Set();
  graph.clusters = array(raw.clusters, '概念分组', 12).map((c, i) => {
    const conceptIds = [...new Set(array(c.conceptIds, '组内概念', 250).map(resolveId))];
    if (conceptIds.some(id => !id)) throw new AppError('分组引用了不存在的概念', 422);
    const fresh = conceptIds.filter(id => !assigned.has(id)); fresh.forEach(id => assigned.add(id));
    return { id: `cluster-${i}`, label: text(c.label, '分组名称', 60), conceptIds: fresh };
  }).filter(c => c.conceptIds.length);
  const other = graph.nodes.filter(n => !assigned.has(n.id)).map(n => n.id);
  if (other.length) graph.clusters.push({ id: 'cluster-other', label: '其他概念', conceptIds: other });
  for (const cluster of graph.clusters) for (const id of cluster.conceptIds) graph.nodes.find(n => n.id === id).clusterId = cluster.id;
  for (const item of array(raw.hypotheses ?? [], '潜在连接', 8)) {
    const from = resolveId(item.from), to = resolveId(item.to);
    if (!from || !to || from === to) throw new AppError('潜在连接引用了无效概念', 422);
    const label = text(item.label, '连接名称', 140);
    graph.edges.push({ id: `hypothesis-${hash(`${from}:${to}:${label}`).slice(0, 18)}`, from, to, label, kind: 'hypothesis', context: text(item.rationale, '推理依据', 1600), evidence: unique(graph.nodes.filter(n => [from, to].includes(n.id)).flatMap(n => n.evidence)).slice(0, 8) });
  }
  graph.startingPoints = array(raw.startingPoints ?? [], '探索起点', 6).map(s => {
    const conceptId = resolveId(s.conceptId);
    if (!conceptId) throw new AppError('探索起点无效', 422);
    return { conceptId, reason: text(s.reason, '推荐原因', 800) };
  });
  return graph;
}

export function applyGraphEdit(graph, op) {
  if (op.type === 'rename') {
    const node = graph.nodes.find(n => n.id === op.nodeId);
    if (!node) throw new AppError('目标概念已变化，请复核修改');
    node.aliases = [...new Set([...node.aliases, node.label])];
    node.label = text(op.label, '概念名称', 60); node.userEdited = true;
  } else if (op.type === 'merge') {
    const id = mergeNodes(graph, array(op.nodeIds, '合并概念', 20), op.label);
    graph.nodes.find(n => n.id === id).userEdited = true;
  } else if (op.type === 'removeEdge') {
    if (!graph.edges.some(e => e.id === op.edgeId)) throw new AppError('目标关系已变化，请复核修改');
    graph.edges = graph.edges.filter(e => e.id !== op.edgeId);
  } else throw new AppError('不支持的地图修改');
  return graph;
}

export function replayEdits(base, edits) {
  const graph = clone(base), conflicts = [];
  for (const edit of edits.filter(e => !e.undoneAt)) {
    try { applyGraphEdit(graph, edit.op); }
    catch { conflicts.push(edit.id); }
  }
  graph.editConflicts = conflicts;
  return graph;
}

export function branchGraph(graph, ids) {
  const selected = new Set(ids);
  return { ...clone(graph), nodes: graph.nodes.filter(n => selected.has(n.id)), edges: graph.edges.filter(e => selected.has(e.from) && selected.has(e.to)), clusters: graph.clusters.map(c => ({ ...c, conceptIds: c.conceptIds.filter(id => selected.has(id)) })).filter(c => c.conceptIds.length), startingPoints: graph.startingPoints.filter(s => selected.has(s.conceptId)) };
}

export function validateConnections(raw, branchA, branchB) {
  const evidence = graph => unique([...graph.nodes.flatMap(n => n.evidence), ...graph.edges.flatMap(e => e.evidence)]);
  const ea = evidence(branchA.graph), eb = evidence(branchB.graph);
  return { explanation: text(raw.explanation, '分析说明', 2000), cards: array(raw.cards, '结合点', 5).map(c => {
    const select = (ids, source) => array(ids, '证据引用', 8).map(id => {
      const found = source.find(e => e.id === id);
      if (!found) throw new AppError('结合点引用的证据不属于对应方向，未采用结果', 422);
      return found;
    });
    const evidenceA = select(c.evidenceA, ea), evidenceB = select(c.evidenceB, eb);
    if (!evidenceA.length || !evidenceB.length) throw new AppError('结合点必须有两个方向的论文依据', 422);
    return { id: `connection-${hash(`${branchA.id}:${branchB.id}:${c.title}`).slice(0, 18)}`, title: text(c.title, '结合点标题', 150), mechanism: text(c.mechanism, '连接机制', 2500), inference: text(c.inference, '推断过程', 2500), gap: text(c.gap, '待验证之处', 2000), question: text(c.question, '候选问题', 1200), evidenceA, evidenceB, kind: 'hypothesis', saved: false };
  }) };
}

export function graphContext(graph) {
  return { nodes: graph.nodes.map(({ id, label, aliases, evidence }) => ({ id, label, aliases, evidence })), edges: graph.edges.map(({ id, from, to, label, kind, context, category, evidence }) => ({ id, from, to, label, kind, context, ...(category ? { category } : {}), evidence })) };
}
