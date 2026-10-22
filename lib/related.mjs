import { AppError, array, text, key } from './util.mjs';

export const relatedPlanPrompt = `围绕一张研究灵感制定论文检索词。返回 {queries:[],explanation}，1–3 组简洁检索词，每组不超过 300 字符。优先使用学术英文词及同义词，分别覆盖直接相似问题、相邻场景、可借鉴方法；不要把整段问题直接翻译拼接。保留用户研究对象与两个方向的连接机制。不要编造论文，也不要声称已经完成检索。`;
export const relatedComparePrompt = `对照研究灵感和候选论文材料，筛选并解释相似与差异。返回 {summary,results:[{id,kind,similarity,difference,takeaway,uncertainty,evidence:[{passageId,quote}]}]}，最多 6 篇，允许空结果。kind 只能 direct / adjacent / method，分别是直接相似、相邻研究、方法参考。只使用候选中的 id。每篇至少一条 20–400 字符逐字引文，必须来自该候选的 passages，不得拼接、翻译或省略。仅比较提供的全文片段或摘要，缺少细节时明确待阅读全文，不能声称全文没有讨论某事。similarity 解释相似点，difference 解释材料中可见的差异及不确定范围，takeaway 建议如何调整灵感或借鉴方法，uncertainty 说明需进一步阅读确认的内容。不要把关键词共现当作直接相似。不得给出创新性评分、保证研究空白或宣称领域没人做过。summary 概述本次范围内的检索发现。`;

export function queriesFrom(value) {
  const queries = [...new Set(array(value, '检索词', 3).map(q => text(q, '检索词', 300)))];
  if (!queries.length) throw new AppError('请至少填写一组检索词');
  return queries;
}

export function findLibraryPaper(candidate, papers) {
  return papers.find(p => p.id === candidate.id || (p.doi && candidate.doi && p.doi.toLowerCase() === candidate.doi.toLowerCase()) || key(p.title) === key(candidate.title));
}

function termsFor(queries) {
  const terms = new Set();
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'how', 'does', 'research', 'study', 'using']);
  for (const word of queries.join(' ').toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\p{Script=Han}]+/gu) || []) {
    if (/\p{Script=Han}/u.test(word)) { for (let i = 0; i < word.length - 1; i++) terms.add(word.slice(i, i + 2)); }
    else if (!stop.has(word)) terms.add(word);
  }
  return [...terms].slice(0, 100);
}

export function localCandidates(papers, queries, card) {
  const terms = termsFor(queries), cited = new Set([...(card.evidenceA || []), ...(card.evidenceB || [])].map(e => e.paperId));
  return papers.filter(p => p.status === 'ready').map(p => {
    const title = (p.title || '').toLowerCase();
    const body = p.passages.map(v => v.text).join(' ').toLowerCase();
    const score = terms.reduce((n, term) => n + (title.includes(term) ? 5 : 0) + (body.includes(term) ? 1 : 0), 0) + (cited.has(p.id) ? 2 : 0);
    return { paper: p, score };
  }).filter(v => v.score > 0).sort((a, b) => b.score - a.score).slice(0, 10).map(({ paper }) => ({ ...paper, origin: 'local', usedByIdea: cited.has(paper.id) }));
}

export function candidateMaterial(paper, queries) {
  const terms = termsFor(queries);
  const passages = paper.passages.map((p, index) => ({ p, index, score: terms.filter(term => p.text.toLowerCase().includes(term)).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, paper.availability === 'abstract' ? 1 : 3)
    .map(({ p }) => ({ ...p, text: p.text.slice(0, paper.availability === 'abstract' ? 6000 : 2400) }));
  return { id: paper.id, title: paper.title, authors: paper.authors || '', year: paper.year || null, availability: paper.availability, origin: paper.origin, usedByIdea: !!paper.usedByIdea, passages };
}

export function paperInfo(paper) {
  return { id: paper.id, title: paper.title, authors: paper.authors || '', year: paper.year || null, doi: paper.doi || '', url: paper.url || '', availability: paper.availability, origin: paper.origin, usedByIdea: !!paper.usedByIdea, sourceHash: paper.sourceHash };
}

export function validateRelated(raw, candidates, materials) {
  const seen = new Set();
  const results = array(raw.results, '相似研究', 6).map(item => {
    const paper = candidates.find(p => p.id === item.id), material = materials.find(p => p.id === item.id);
    if (!paper || !material?.passages.length || seen.has(item.id)) throw new AppError('相似研究引用了不存在、重复或仅题录的候选论文', 422);
    if (!['direct', 'adjacent', 'method'].includes(item.kind)) throw new AppError('相似研究类型不正确', 422);
    seen.add(item.id);
    const evidence = array(item.evidence, '相似研究引文', 3).map(ev => {
      const passage = material.passages.find(p => p.id === ev.passageId), quote = text(ev.quote, '原文引文', 400);
      if (quote.length < 20 || !passage || !passage.text.includes(quote)) throw new AppError('相似研究引文无法在提供的论文材料中核验，上一份结果已保留', 422);
      return { passageId: passage.id, quote, page: passage.page ?? null, paperId: paper.id, sourceHash: paper.sourceHash };
    });
    if (!evidence.length) throw new AppError('相似研究需要可定位的材料依据', 422);
    return { ...paperInfo(paper), kind: item.kind, similarity: text(item.similarity, '相似点', 1800), difference: text(item.difference, '差异', 1800), takeaway: text(item.takeaway, '对灵感的启发', 1800), uncertainty: text(item.uncertainty, '待阅读确认', 1800), evidence };
  });
  return { summary: text(raw.summary, '检索发现', 2500), results };
}
