import test from 'node:test';
import assert from 'node:assert/strict';
import { dshGenerator, paperMaterial } from '../lib/ai.mjs';

test('dsh bridge uses configured route, streams text, sends an abort signal and rejects provider errors', async () => {
  let options;
  const llm = { async *stream(input) { options = input; yield { type: 'text-delta', text: '{"ok":true}' }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  const ctx = { get: name => name === 'llm' ? llm : { currentSelection: () => ({ provider: 'configured', model: 'model-a' }) } };
  const generator = dshGenerator(ctx), controller = new AbortController();
  const output = await generator.generate({ system: 'system', input: { instruction: 'test' }, signal: controller.signal });
  assert.equal(output, '{"ok":true}'); assert.equal(options.provider, 'configured'); assert.equal(options.messages[0].source.kind, 'system-prompt'); assert.ok(options.signal instanceof AbortSignal);
  llm.stream = async function* () { yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH' } } }; };
  await assert.rejects(generator.generate({ system: 'system', input: {}, signal: controller.signal }), /模型未连接/);
});
test('long document sampling stays within budget and covers distributed pages', () => {
  const passages = Array.from({ length: 100 }, (_, page) => ({ id: `${page}`, page, text: 'x'.repeat(1900) }));
  const result = paperMaterial({ passages }, 20000);
  assert.ok(result.reduce((n, p) => n + p.text.length, 0) <= 20000);
  assert.ok(result[0].page < 5); assert.ok(result.at(-1).page >= 90);
});
test('structured extraction uses supported off mode while comparisons use low; explicit selection is honored', async () => {
  const requests = [];
  const llm = { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'off' }, { id: 'low' }, { id: 'high' }] } }), async *stream(input) { requests.push(input); yield { type: 'text-delta', text: '{}' }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  let explicit;
  const generator = dshGenerator({ get: name => name === 'llm' ? llm : { currentSelection: () => ({ provider: 'test', model: 'test', ...(explicit ? { reasoningEffort: explicit } : {}) }) } });
  const signal = new AbortController().signal;
  await generator.generate({ system: '', input: { instruction: '阅读一篇论文。' }, signal });
  await generator.generate({ system: '', input: { instruction: '比较两个研究方向' }, signal });
  explicit = 'high'; await generator.generate({ system: '', input: { instruction: '阅读一篇论文。' }, signal });
  assert.deepEqual(requests.map(r => r.reasoningEffort), ['off', 'low', 'high']);
  assert.deepEqual(requests.map(r => r.maxTokens), [12000, 24000, 24000]);
});
