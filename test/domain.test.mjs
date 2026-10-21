import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExtraction, buildGraph, synthesizeGraph, replayEdits, validateConnections, mergeNodes } from '../lib/domain.mjs';
import { paper, extraction } from './fixtures.mjs';
function graph() { const p = paper(); p.extraction = { ...validateExtraction(extraction(p), p), sourceHash: p.sourceHash }; return buildGraph([p], 1); }

test('fabricated quotation and cross-paper reference cannot become a supported relationship', () => {
  const p = paper(), raw = extraction(p);
  raw.relations[0].evidence[0].quote = 'This is an invented finding that never appeared in the provided material.';
  assert.equal(validateExtraction(raw, p).relations.length, 0);
  assert.equal(validateExtraction(raw, p).warnings.length, 1);
  raw.relations[0].evidence[0] = { passageId: 'another-paper:1', quote: p.passages[0].text };
  assert.equal(validateExtraction(raw, p).relations.length, 0);
});
test('a wrong chunk ID is corrected only by an exact quote on one unambiguous page in the same paper', () => {
  const p = paper(), raw = extraction(p);
  p.passages.push({ ...p.passages[0], id: 'same-paper-other-chunk', page: 2, text: 'This paragraph contains no matching quotation and serves as another supplied chunk.' });
  raw.relations[0].evidence[0].passageId = 'same-paper-other-chunk';
  const result = validateExtraction(raw, p);
  assert.equal(result.relations[0].evidence[0].page, 1); assert.equal(result.relations[0].evidence[0].locatorCorrected, true);
  p.passages.push({ ...p.passages[0], id: 'ambiguous-other-page', page: 3 });
  assert.equal(validateExtraction(raw, p).relations.length, 0);
});
test('evidence preserves file version and PDF page, hypotheses stay hypotheses after merging', () => {
  const g = graph(), [a, b, c] = g.nodes;
  const result = synthesizeGraph(g, { clusters: [{ label: '测试', conceptIds: g.nodes.map(n => n.id) }], hypotheses: [{ from: a.id, to: c.id, label: '未验证连接', rationale: '仅是假设，不能宣称原文证明。' }], startingPoints: [] });
  assert.equal(result.edges[0].evidence[0].page, 1); assert.equal(result.edges[0].evidence[0].sourceHash, 'hash-paper-test');
  mergeNodes(result, [a.id, b.id], '新名称');
  assert.equal(result.edges.find(e => e.label === '未验证连接').kind, 'hypothesis');
  assert.equal(result.nodes.find(n => n.id === a.id).evidence.length, 1);
});
test('user edits replay on a new map and a missing target is exposed as conflict', () => {
  const base = graph(), id = base.nodes[0].id;
  const result = replayEdits(base, [{ id: 'ok', op: { type: 'rename', nodeId: id, label: '用户名称' } }, { id: 'conflict', op: { type: 'removeEdge', edgeId: 'missing' } }]);
  assert.equal(result.nodes[0].label, '用户名称'); assert.deepEqual(result.editConflicts, ['conflict']); assert.notEqual(base.nodes[0].label, '用户名称');
});
test('connection references must come from the appropriate branch', () => {
  const g = graph(), a = { id: 'a', graph: g }, b = { id: 'b', graph: { ...g, nodes: [g.nodes[2]], edges: [] } };
  const card = { title: '测试', mechanism: '连接机制', inference: '属于推断', gap: '需要验证', question: '如何研究？', evidenceA: [g.nodes[0].evidence[0].id], evidenceB: [g.nodes[0].evidence[0].id] };
  assert.throws(() => validateConnections({ explanation: '测试', cards: [card] }, a, b), /不属于对应方向/);
  assert.deepEqual(validateConnections({ explanation: '证据不足', cards: [] }, a, b).cards, []);
});
