import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService } from '../lib/service.mjs';
import { createStore, emptyState } from '../lib/store.mjs';
import { paper } from './fixtures.mjs';
import { queriesFrom } from '../lib/related.mjs';

const query = 'design artefacts idea management';
function remote(id, availability = 'abstract') {
  const p = paper(id);
  return { ...p, title: `Research record ${id}`, doi: `10.1000/${id}`, url: `https://doi.org/10.1000/${id}`, availability, passages: availability === 'metadata' ? [] : p.passages };
}
function compared(input) {
  return { summary: '仅在本次提供的材料内比较，不能判断领域新颖性。', results: input.material.candidates.slice(0, 3).map(p => ({ id: p.id, kind: p.origin === 'local' ? 'direct' : 'method', similarity: '材料都提到设计物与沟通。', difference: '具体项目场景是否相同仍需阅读全文。', takeaway: '可据此细化团队沟通的研究问题。', uncertainty: '需要确认研究对象和方法。', evidence: [{ passageId: p.passages[0].id, quote: p.passages[0].text.slice(0, 80) }] })) };
}
async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'lit-related-')), calls = [], searches = [];
  const generator = { selection: () => ({ provider: 'test', model: 'fixture' }), generate: async request => {
    calls.push(request.input);
    if (options.generate) return options.generate(request);
    return JSON.stringify(request.input.instruction.startsWith('围绕一张研究灵感') ? { queries: [query], explanation: '按研究问题与方法拆分检索词。' } : compared(request.input));
  } };
  const service = await createService({ file: join(dir, 'library.json'), generator, search: async (q, signal) => { searches.push(q); return options.search ? options.search(q, signal) : [remote('external-abstract'), remote('external-metadata', 'metadata')]; } });
  t.after(async () => { await service.close(); await rm(dir, { recursive: true, force: true }); });
  await service.store.update(s => {
    s.papers = options.noLocal ? [] : [paper('local-paper')];
    s.libraryRevision = 1; s.graph.version = 7; s.graph.libraryRevision = 1;
    s.connections.push({ id: 'comparison', labelA: '跨专业沟通', labelB: '创意管理', context: '已有团队项目', cards: [{ id: 'idea', title: '设计物如何衔接沟通与创意整理', question: '如何支持跨专业团队管理创意？', mechanism: '外化想法作为协作材料', gap: '团队使用机制待研究', evidenceA: [], evidenceB: [] }] });
  });
  return { service, calls, searches, file: join(dir, 'library.json'), input: { comparisonId: 'comparison', cardId: 'idea', queries: [query] } };
}
async function settled(service) {
  for (let i = 0; i < 250; i++) { if (!service.tasks.active()) return service.store.read(); await new Promise(r => setTimeout(r, 10)); }
  throw new Error('Task did not finish');
}

test('plan, search preview, selected import and reopen retain provenance without silently rebuilding the map', async t => {
  const { service, input, calls, searches, file } = await setup(t);
  await service.relatedPlan(input); let s = await settled(service);
  assert.deepEqual(s.runs.at(-1).result.queries, [query]); assert.equal(searches.length, 0);
  const before = structuredClone(s.graph);
  await service.relatedSearch(input); s = await settled(service);
  assert.equal(s.runs.at(-1).status, 'succeeded'); assert.deepEqual(searches, [query]);
  assert.equal(s.papers.length, 1); assert.equal(s.libraryRevision, 1); assert.deepEqual(s.graph, before);
  const entry = s.relatedSearches[0]; assert.equal(entry.results.length, 2); assert.equal(entry.leads.length, 1);
  assert.ok(entry.results.every(p => p.evidence[0].quote.length >= 20));
  assert.equal(entry.results.find(p => p.origin === 'external').availability, 'abstract');
  assert.ok(calls.at(-1).material.candidates.every(p => p.availability !== 'metadata'));
  const view = await service.state(); assert.equal(view.relatedSearches[0].candidates, undefined);
  await assert.rejects(service.relatedAdd({ searchId: entry.id, paperIds: ['fabricated-id'] }), /不在这次检索结果/);
  const modelCalls = calls.length;
  await service.relatedAdd({ searchId: entry.id, paperIds: ['external-abstract'] }); s = await settled(service);
  assert.equal(calls.length, modelCalls); assert.equal(s.papers.length, 2); assert.equal(s.libraryRevision, 2); assert.deepEqual(s.graph, before);
  assert.ok(!s.papers.some(p => p.id === 'external-metadata'));
  assert.equal((await service.state()).relatedSearches[0].results.find(p => p.id === 'external-abstract').inLibrary, true);
  await service.relatedAdd({ searchId: entry.id, paperIds: ['external-abstract'] }); s = await settled(service);
  assert.equal(s.runs.at(-1).result.added, 0); assert.equal(s.libraryRevision, 2);
  const reopened = await createStore(file); assert.equal(reopened.read().relatedSearches[0].id, entry.id);
  assert.equal((await service.exported()).relatedSearches[0].candidates, undefined);
});

test('a fabricated quotation cannot replace earlier search results', async t => {
  let forge = false;
  const { service, input } = await setup(t, { generate: async ({ input }) => {
    const value = compared(input);
    if (forge) value.results[0].evidence[0].quote = 'This fabricated quote does not occur in the supplied material.';
    return JSON.stringify(value);
  } });
  await service.relatedSearch(input); let s = await settled(service); const before = s.relatedSearches;
  forge = true; await service.relatedSearch(input); s = await settled(service);
  assert.equal(s.runs.at(-1).status, 'failed'); assert.match(s.runs.at(-1).error, /无法.*核验/); assert.deepEqual(s.relatedSearches, before);
});

test('metadata-only records are reading leads, never content comparisons, and require explicit import', async t => {
  const { service, input, calls } = await setup(t, { noLocal: true, search: async () => [remote('metadata', 'metadata')] });
  await service.relatedSearch(input); let s = await settled(service);
  assert.equal(calls.length, 0); assert.equal(s.relatedSearches[0].results.length, 0); assert.equal(s.relatedSearches[0].leads.length, 1); assert.equal(s.papers.length, 0);
  await service.relatedAdd({ searchId: s.relatedSearches[0].id, paperIds: ['metadata'] }); s = await settled(service);
  assert.equal(s.papers[0].availability, 'metadata'); assert.equal(s.papers[0].passages.length, 0);
});

test('partial Crossref failures preserve usable local results and explicit coverage warnings', async t => {
  const { service, input } = await setup(t, { search: async q => { if (q === 'failed query') throw new Error('network unavailable'); return []; } });
  await service.relatedSearch({ ...input, queries: [query, 'failed query'] }); const s = await settled(service), entry = s.relatedSearches[0];
  assert.equal(s.runs.at(-1).status, 'succeeded'); assert.equal(entry.results.length, 1);
  assert.equal(entry.sources[1].status, 'failed'); assert.equal(entry.scope.external, 0);
});

test('cancelled searches and unavailable networks never create misleading empty search histories', async t => {
  const { service, input } = await setup(t, { noLocal: true, search: async (_, signal) => { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); return [remote('cancelled')]; } });
  const { runId } = await service.relatedSearch(input); await new Promise(r => setTimeout(r, 25)); service.tasks.cancel(runId);
  const s = await settled(service); assert.equal(s.runs.at(-1).status, 'cancelled'); assert.equal(s.relatedSearches.length, 0);
  const other = await setup(t, { noLocal: true, search: async () => { throw new Error('network unavailable'); } });
  await other.service.relatedSearch(other.input); const failed = await settled(other.service);
  assert.equal(failed.runs.at(-1).status, 'failed'); assert.equal(failed.relatedSearches.length, 0);
});

test('old libraries migrate without losing maps; invalid or excessive queries never start network requests', async t => {
  const { service, file, input, searches } = await setup(t);
  await assert.rejects(service.relatedSearch({ ...input, queries: [] }), /至少/);
  assert.throws(() => queriesFrom(['a', 'b', 'c', 'd']), /格式/); assert.equal(searches.length, 0);
  const old = emptyState(); delete old.relatedSearches; old.graph.version = 4;
  await writeFile(file, JSON.stringify(old)); const reopened = await createStore(file);
  assert.deepEqual(reopened.read().relatedSearches, []); assert.equal(reopened.read().graph.version, 4);
});
