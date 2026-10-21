import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService } from '../lib/service.mjs';
import { createStore } from '../lib/store.mjs';
import { validateExtraction, buildGraph } from '../lib/domain.mjs';
import { paper, extraction } from './fixtures.mjs';

async function setup(t, generate) {
  const dir = await mkdtemp(join(tmpdir(), 'literature-test-'));
  const service = await createService({ file: join(dir, 'library.json'), generator: { selection: () => ({ provider: 'test', model: 'fixture' }), generate } });
  service.testFile = join(dir, 'library.json');
  t.after(async () => { await service.close(); await rm(dir, { recursive: true, force: true }); });
  const p = paper(); p.extraction = { ...validateExtraction(extraction(p), p), sourceHash: p.sourceHash, promptVersion: 1 };
  await service.store.update(s => { s.papers = [p]; s.libraryRevision = 1; s.baseGraph = { ...buildGraph([p], 1), version: 1 }; s.graph = structuredClone(s.baseGraph); });
  return service;
}
async function settled(service) { for (let i = 0; i < 150; i++) { if (!service.tasks.active()) return service.store.read(); await new Promise(r => setTimeout(r, 10)); } throw new Error('task did not settle'); }

test('failed model request preserves the last valid graph and records the exact input', async t => {
  const service = await setup(t, async () => { throw new Error('provider disconnected'); });
  const before = service.store.read().graph;
  await service.analyze(); const after = await settled(service);
  assert.deepEqual(after.graph, before); assert.equal(after.runs.at(-1).status, 'failed'); assert.ok(after.runs.at(-1).calls[0].input.material.nodes.length);
});
test('rename, regenerate, undo and reopen preserve user intent and storage', async t => {
  const service = await setup(t, async ({ input }) => JSON.stringify({ clusters: [{ label: '主题', conceptIds: input.material.nodes.map(n => n.id) }], merges: [], hypotheses: [], startingPoints: [] }));
  const id = service.store.read().graph.nodes[0].id;
  await service.edit({ version: 1, op: { type: 'rename', nodeId: id, label: '用户自定义' } });
  await assert.rejects(service.edit({ version: 1, op: { type: 'rename', nodeId: id, label: '陈旧修改' } }), /地图已变化/);
  await service.analyze(); let state = await settled(service);
  assert.equal(state.graph.nodes[0].label, '用户自定义');
  await service.undo({ version: state.graph.version }); state = service.store.read();
  assert.equal(state.graph.nodes[0].label, '设计物'); assert.ok(state.edits[0].undoneAt);
  const reopened = await createStore(service.testFile);
  assert.deepEqual(reopened.read().graph, state.graph);
  const view = await service.state(); assert.equal(view.papers[0].passages, undefined); assert.equal(view.runs.at(-1).calls, undefined);
});
test('a branch always sees the whole map, an empty result is allowed, online search is opt-in', async t => {
  const seen = [];
  const service = await setup(t, async ({ input }) => { seen.push(input.material); return JSON.stringify({ conceptIds: [], explanation: '没有匹配，不能强行关联' }); });
  await service.branch({ query: '库外概念', label: '方向 A' }); let state = await settled(service);
  await service.branch({ query: '另一库外概念', label: '方向 B' }); state = await settled(service);
  assert.equal(seen[0].map.nodes.length, 3); assert.equal(seen[1].map.nodes.length, 3); assert.equal(state.branches[0].graph.nodes.length, 0);
  await assert.rejects(service.compare({ a: state.branches[0].id, b: state.branches[1].id }), /没有匹配材料/);
});
test('cancelled output cannot overwrite an existing map', async t => {
  const service = await setup(t, async ({ signal }) => { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); return '{}'; });
  const before = service.store.read().graph; const { runId } = await service.analyze();
  await new Promise(r => setTimeout(r, 20)); service.tasks.cancel(runId); const after = await settled(service);
  assert.equal(after.runs.at(-1).status, 'cancelled'); assert.deepEqual(after.graph, before);
});
