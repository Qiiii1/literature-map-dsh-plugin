// DEVELOPMENT ONLY: offline adapter, excluded from the distributable package.
// It uses synthetic text only and never makes external requests.
export const name = 'literature-test-fixture';
export const inject = ['llm'];
export function apply(ctx) {
  const adapter = {
    providerInfo: id => ({ id, name: 'Offline test fixture' }),
    providerRetryPolicy: () => undefined,
    imageRequestPricing: () => undefined,
    listModels: async provider => [{ provider, id: 'fixture-test-only', name: 'Fixture test only' }],
    resolveModel: async (provider, model) => ({ provider, id: model, name: model, contextWindow: 200000 }),
    async prepareCall(provider, model) { return { model: await this.resolveModel(provider, model), stream: options => this.stream(options) }; },
    async *stream(options) {
      const input = JSON.parse(options.messages.findLast(m => m.role === 'user').content[0].text), m = input.material;
      let value;
      if (input.instruction.startsWith('整理文献概念地图')) {
        value = { merges: [], clusters: [{ label: '界面测试 · 协作', conceptIds: m.nodes.filter(n => n.label !== '创意管理').map(n => n.id) }, { label: '界面测试 · 创意', conceptIds: m.nodes.filter(n => n.label === '创意管理').map(n => n.id) }], hypotheses: [{ from: m.nodes[0].id, to: m.nodes[2].id, label: '离线测试：两个方向的潜在连接', rationale: '这是合成测试数据，仅用于验证 UI 和协议，没有调用 AI。' }], startingPoints: [{ conceptId: m.nodes[0].id, reason: '离线测试起点，用于验证点击联动。' }] };
      } else if (input.instruction.startsWith('按用户的方向')) {
        const nodes = /创意/.test(m.query) ? m.map.nodes.filter(n => /创意/.test(n.label)) : m.map.nodes.filter(n => !/创意/.test(n.label));
        value = { conceptIds: nodes.map(n => n.id), explanation: '离线合成测试：验证分支独立选取与保存。' };
      } else if (input.instruction.startsWith('比较两个研究方向')) {
        value = { explanation: '离线合成测试，不是 AI 研究建议。', cards: [{ title: '离线测试：创意外化与跨专业理解', mechanism: '测试用连接机制，用来验证卡片和两侧证据联动。', inference: '纯粹是合成测试，没有产生真实研究结论。', gap: '真实研究推断需要配置模型后重新分析。', question: '如何验证两个方向的结合点能回到对应原文？', evidenceA: [m.branchA.nodes[0].evidence[0].id], evidenceB: [m.branchB.nodes[0].evidence[0].id] }] };
      } else if (input.instruction.startsWith('围绕一张研究灵感')) {
        value = { queries: ['boundary objects co-design', 'design artefacts idea management'], explanation: '离线界面测试：验证可编辑检索词，不是模型生成的研究建议。' };
      } else if (input.instruction.startsWith('对照研究灵感和候选论文材料')) {
        value = { summary: '离线协议测试：以下只验证界面、检索接口和引文匹配；没有调用真实模型，文字不构成论文内容判断。', results: m.candidates.slice(0, 4).map((p, i) => ({ id: p.id, kind: ['direct', 'adjacent', 'method'][i % 3], similarity: '离线测试占位说明：验证相似点区域的呈现。', difference: '离线测试占位说明：实际差异需配置模型并阅读论文确认。', takeaway: '离线测试占位说明：这里将展示对当前灵感的启发。', uncertainty: '离线测试不判断论文内容。请用真实模型重新检索、核对摘要或全文。', evidence: [{ passageId: p.passages[0].id, quote: p.passages[0].text.slice(0, 100) }] })) };
      } else if (input.instruction.startsWith('根据用户明确的地图修改要求')) {
        value = { op: { type: 'rename', nodeId: m.graph.nodes[0].id, label: '对话修改测试' } };
      } else throw new Error('Unsupported offline test prompt');
      yield { type: 'block-start', index: 0, block: { type: 'text' } };
      yield { type: 'text-delta', index: 0, text: JSON.stringify(value) };
      yield { type: 'block-end', index: 0 };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  ctx.effect(() => ctx.llm.registerAdapter(['literature-fixture'], adapter));
}
