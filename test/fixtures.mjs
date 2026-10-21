export const passageText = 'Design artefacts can facilitate communication across disciplines. Different participants may interpret the same artefact in different ways. Designers externalize and cluster ideas while developing concepts.';
export function paper(id = 'paper-test') {
  return { id, title: 'Test research material', sourceHash: `hash-${id}`, status: 'ready', availability: 'fulltext', passages: [{ id: `${id}:1`, paperId: id, sourceHash: `hash-${id}`, page: 1, text: passageText }] };
}
export function extraction(p) {
  const ev = quote => [{ passageId: p.passages[0].id, quote }];
  return { summary: '用于测试证据定位的合成材料。', concepts: [{ key: 'artefacts', label: '设计物', aliases: ['design artefacts'], evidence: ev('Design artefacts can facilitate communication across disciplines.') }, { key: 'communication', label: '跨专业沟通', aliases: ['communication'], evidence: ev('Design artefacts can facilitate communication across disciplines.') }, { key: 'ideas', label: '创意管理', aliases: ['idea management'], evidence: ev('Designers externalize and cluster ideas while developing concepts.') }], relations: [{ from: 'artefacts', to: 'communication', label: '设计物支持跨专业沟通', category: 'discussion', context: '仅用于验证的合成句，不是论文结论。', evidence: ev('Design artefacts can facilitate communication across disciplines.') }] };
}
