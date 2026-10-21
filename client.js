window.__ModuleLoader__.load({
  id: 'literature-map-dsh-plugin',
  factory(require) {
    const R = require('react'), h = R.createElement;
    const colors = ['#526bc4', '#388477', '#ba8049', '#8e6bad', '#517d98', '#9f6a77', '#748151'];
    const categories = { empirical: '实证发现', theoretical: '理论论述', discussion: '作者讨论' };
    const availability = { fulltext: '全文', abstract: '仅摘要', metadata: '仅题录' };
    const runLabels = { import: '导入论文', analyze: '生成地图', branch: '深化方向', compare: '寻找结合点', edit: '调整地图', supplement: '补充论文' };
    const researchText = value => String(value ?? '').replace(/\bbranchA\b/gi, '方向 A').replace(/\bbranchB\b/gi, '方向 B').replace(/\binference\b/g, '推断').replace(/\bgap\b/g, '缺口');
    async function api(path, body) {
      const response = await fetch(`/api/literature-map${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || '操作失败'); return value;
    }
    function Icon({ name = 'map', size = 18 }) {
      const paths = { map: 'M5 5h4v4H5zM15 3h4v4h-4zM14 15h5v5h-5zM7 14v5M9 7l6-2M9 9l6 6M5 17h4', plus: 'M12 5v14M5 12h14', search: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12M15 15l5 5', book: 'M4 4h7v16H4zM13 4h7v16h-7', arrow: 'M5 12h14M13 6l6 6-6 6', close: 'M6 6l12 12M6 18L18 6', branch: 'M6 4v12a4 4 0 0 0 8 0V8M3 4h6M11 8h6', spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z', check: 'M5 12l4 4L19 6', undo: 'M8 5L3 10l5 5M3 10h11a6 6 0 0 1 0 12', save: 'M6 3h12v18l-6-4-6 4z', refresh: 'M19 7a8 8 0 1 0 1 8M19 3v5h-5', file: 'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6', link: 'M9 8l3-3a4 4 0 0 1 6 6l-3 3M15 16l-3 3a4 4 0 0 1-6-6l3-3M8 16l8-8', edit: 'M4 16L16 4l4 4L8 20H4zM14 6l4 4', folder: 'M3 6h7l2 3h9v11H3z' };
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] || paths.map }));
    }
    function Button({ icon, primary, quiet, small, children, ...props }) {
      return h('button', { type: 'button', ...props, className: `lm-button ${primary ? 'lm-primary' : ''} ${quiet ? 'lm-quiet' : ''} ${small ? 'lm-small' : ''} ${props.className || ''}` }, icon && h(Icon, { name: icon, size: small ? 14 : 16 }), children);
    }
    function Modal({ title, onClose, children }) {
      R.useEffect(() => { const close = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, []);
      return h('div', { className: 'lm-overlay', onClick: e => { if (e.target === e.currentTarget) onClose(); } }, h('section', { className: 'lm-modal', role: 'dialog', 'aria-modal': true, 'aria-label': title }, h('header', null, h('h2', null, title), h(Button, { quiet: true, icon: 'close', onClick: onClose, 'aria-label': '关闭' })), children));
    }
    function Field({ label, help, ...props }) { return h('label', { className: 'lm-field' }, h('span', null, label), props.rows ? h('textarea', props) : h('input', props), help && h('small', null, help)); }
    function Empty({ title, children, icon = 'search' }) { return h('div', { className: 'lm-empty' }, h('div', { className: 'lm-empty-icon' }, h(Icon, { name: icon, size: 28 })), h('h3', null, title), h('p', null, children)); }
    function Loading({ title = '正在加载文献地图…', note }) { return h('div', { className: 'lm-loading', role: 'status', 'aria-live': 'polite' }, h('div', { className: 'lm-spinner lm-spinner-lg' }), h('h3', null, title), note && h('p', null, note)); }
    function BridgePreview({ bridge, onClose, onOpen }) {
      return h('section', { className: 'lm-bridge-preview', role: 'dialog', 'aria-label': '结合点预览' },
        h('header', null, h('div', { className: 'lm-bridge-preview-head' }, h('span', { className: 'lm-bridge-preview-kicker' }, h(Icon, { name: 'link', size: 12 }), bridge.label), h('strong', null, researchText(bridge.labelA) + ' × ' + researchText(bridge.labelB))), h(Button, { small: true, quiet: true, icon: 'close', onClick: onClose, 'aria-label': '关闭结合点预览' })),
        bridge.cardsPreview.length ? h('ul', { className: 'lm-bridge-preview-list' }, ...bridge.cardsPreview.map(card => h('li', { key: card.id }, h('h4', null, researchText(card.title)), h('p', null, researchText(card.question)), card.saved && h('span', { className: 'lm-tag' }, '已保存')))) : h('p', { className: 'lm-muted' }, '这个结合点还没有形成灵感卡片。'),
        h('footer', null, h('span', null, bridge.cards + ' 条灵感 · 金色虚线'), h(Button, { small: true, primary: true, icon: 'arrow', onClick: onOpen }, '查看完整结合点')));
    }
    function evidenceUnique(items) { return [...new Map(items.map(e => [e.id, e])).values()]; }
    function Evidence({ items, papers }) {
      if (!items.length) return h('p', { className: 'lm-muted' }, '这里还没有可定位的原文证据。');
      return h('div', { className: 'lm-evidence-list' }, ...evidenceUnique(items).map((ev, i) => {
        const paper = papers.find(p => p.id === ev.paperId), changed = paper?.sourceHash !== ev.sourceHash;
        return h('article', { className: 'lm-evidence', key: ev.id }, h('div', { className: 'lm-evidence-top' }, h('span', null, String(i + 1).padStart(2, '0')), h('span', null, ev.page ? `PDF 第 ${ev.page} 页` : '摘要')), h('blockquote', null, ev.quote), h('p', { className: 'lm-source-title' }, ev.paperTitle), h('div', { className: 'lm-evidence-footer' }, h('span', { className: 'lm-tag' }, availability[ev.availability] || '原文'), changed ? h('span', { className: 'lm-warning-text' }, '来源有更新') : paper?.path ? h('a', { href: `/api/literature-map/papers/${paper.id}/pdf#page=${ev.page || 1}`, target: '_blank', rel: 'noreferrer' }, '打开原文 ↗') : paper?.url && h('a', { href: paper.url, target: '_blank', rel: 'noreferrer' }, '查看论文 ↗')));
      }));
    }
    function MapCanvas({ graph, selected, setSelected, search, expanded, zoom, setZoom, bridges = [], onBridge, activeBridge, onBackground, resetToken }) {
      const degree = new Map(graph.nodes.map(n => [n.id, 0]));
      graph.edges.forEach(e => { degree.set(e.from, (degree.get(e.from) || 0) + 1); degree.set(e.to, (degree.get(e.to) || 0) + 1); });
      const ranked = [...graph.nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
      const wanted = new Set((expanded ? ranked : ranked.slice(0, 42)).map(n => n.id));
      if (selected?.type === 'node') wanted.add(selected.id);
      bridges.forEach(bridge => { wanted.add(bridge.from); wanted.add(bridge.to); });
      const visibleNodes = graph.nodes.filter(n => wanted.has(n.id) && (!search || [n.label, ...n.aliases].join(' ').toLowerCase().includes(search.toLowerCase())));
      const visible = new Set(visibleNodes.map(n => n.id)), positions = new Map();
      const viewportRef = R.useRef(null);
      const [viewWidth, setViewWidth] = R.useState(0);
      const sourceGroups = graph.clusters.length ? graph.clusters : [{ id: 'all', label: '论文概念', conceptIds: graph.nodes.map(n => n.id) }];
      const groups = sourceGroups.map((c, i) => ({ ...c, color: colors[i % colors.length], nodes: visibleNodes.filter(n => c.conceptIds.includes(n.id)) })).filter(c => c.nodes.length);
      const columns = Math.max(1, Math.min(3, groups.length, viewWidth ? Math.round((viewWidth - 30) / 330) : 3));
      const rows = []; let y = 50;
      for (let i = 0; i < groups.length; i += columns) {
        const row = groups.slice(i, i + columns), height = Math.max(...row.map(c => Math.ceil(c.nodes.length / 2) * 65 + 65));
        row.forEach((c, j) => { c.x = 30 + j * 330; c.y = y; c.height = height; c.nodes.forEach((n, k) => positions.set(n.id, { x: c.x + 80 + (k % 2) * 145, y: y + 75 + Math.floor(k / 2) * 65, color: c.color })); });
        rows.push(row); y += height + 60;
      }
      const related = new Set(selected?.type === 'node' ? graph.edges.filter(e => e.from === selected.id || e.to === selected.id).flatMap(e => [e.from, e.to]) : []);
      const contentWidth = 30 + (columns - 1) * 330 + 305 + 30;
      const fit = viewWidth ? Math.min(1.3, viewWidth / contentWidth) : 1;
      const height = Math.max(660, y), svgChildren = [];
      for (const group of groups) svgChildren.push(h('g', { key: group.id }, h('rect', { x: group.x, y: group.y, width: 305, height: group.height, rx: 20, fill: group.color, fillOpacity: 0.035, stroke: group.color, strokeOpacity: 0.13, strokeDasharray: '4 6' }), h('text', { x: group.x + 20, y: group.y + 29, fontSize: 12, fontWeight: 600, fill: group.color }, `${group.label} · ${group.nodes.length}`)));
      for (const edge of graph.edges.filter(e => visible.has(e.from) && visible.has(e.to))) {
        const a = positions.get(edge.from), b = positions.get(edge.to), active = selected?.id === edge.id || (selected?.type === 'node' && [edge.from, edge.to].includes(selected.id));
        if (!a || !b) continue;
        const d = `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 + 22} ${(a.y + b.y) / 2 - 32} ${b.x} ${b.y}`;
        svgChildren.push(h('g', { key: edge.id, onClick: () => setSelected({ type: 'edge', id: edge.id }), className: 'lm-graph-edge', role: 'button', tabIndex: 0, 'aria-label': `${edge.label}，${edge.kind === 'hypothesis' ? 'AI 假设' : '论文关系'}`, onKeyDown: e => { if (e.key === 'Enter') setSelected({ type: 'edge', id: edge.id }); } }, h('path', { d, fill: 'none', stroke: active ? '#5569b3' : '#a7afb9', strokeWidth: active ? 2 : 1, opacity: active ? 0.8 : 0.22, strokeDasharray: edge.kind === 'hypothesis' ? '5 6' : undefined }), h('path', { d, stroke: 'transparent', strokeWidth: 12, fill: 'none' })));
      }
      const visibleBridges = bridges.map(bridge => ({ ...bridge, a: positions.get(bridge.from), b: positions.get(bridge.to) })).filter(bridge => bridge.a && bridge.b);
      for (const bridge of visibleBridges) {
        const a = bridge.a, b = bridge.b, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, active = bridge.id === activeBridge, d = 'M ' + a.x + ' ' + a.y + ' Q ' + (mx + 40) + ' ' + (my - 90) + ' ' + b.x + ' ' + b.y;
        const title = bridge.label + (bridge.cards ? ' · ' + bridge.cards + ' 灵感' : '');
        svgChildren.push(h('g', { key: 'bridge-' + bridge.id, className: 'lm-bridge' + (active ? ' lm-bridge-active' : ''), role: 'button', tabIndex: 0, 'aria-label': title, onClick: event => { event.stopPropagation(); onBridge?.(bridge.id); }, onKeyDown: event => { if (event.key === 'Enter') onBridge?.(bridge.id); } },
          h('path', { d, fill: 'none', stroke: active ? '#c98f3c' : '#d8a75c', strokeWidth: active ? 2.8 : 2, strokeDasharray: '2 7', strokeLinecap: 'round', opacity: active ? 1 : 0.9 }),
          h('path', { d, stroke: 'transparent', strokeWidth: 14, fill: 'none' }),
          h('g', { transform: 'translate(' + (mx + 40) + ',' + (my - 90) + ')' }, h('rect', { x: -64, y: -12, width: 128, height: 24, rx: 12, fill: active ? '#fff1d9' : '#fffaf1', stroke: active ? '#d8a75c' : '#e8d3ae' }), h('text', { x: 0, y: 4, textAnchor: 'middle', fontSize: 10, fontWeight: 600, fill: '#a8762f' }, title))));
      }
      for (const node of visibleNodes) {
        const p = positions.get(node.id); if (!p) continue;
        const active = selected?.id === node.id, dim = selected?.type === 'node' && !related.has(node.id) && !active;
        svgChildren.push(h('g', { key: node.id, transform: `translate(${p.x},${p.y})`, role: 'button', tabIndex: 0, className: 'lm-graph-node', 'aria-label': node.label, onClick: () => setSelected({ type: 'node', id: node.id }), onKeyDown: e => { if (e.key === 'Enter') setSelected({ type: 'node', id: node.id }); }, opacity: dim ? 0.5 : 1 }, h('title', null, `${node.label} · ${new Set(node.evidence.map(e => e.paperId)).size} 篇论文`), h('rect', { x: -65, y: -22, width: 130, height: 44, rx: 12, fill: active ? p.color : '#fff', stroke: p.color, strokeOpacity: active ? 1 : 0.25, strokeWidth: active ? 2 : 1 }), h('circle', { cx: -50, cy: 0, r: 3, fill: active ? '#fff' : p.color }), h('text', { x: -39, y: 4, fontSize: 11, fontWeight: active ? 600 : 450, fill: active ? '#fff' : '#303c48' }, node.label.length > 9 ? `${node.label.slice(0, 8)}…` : node.label)));
      }
      const [pan, setPan] = R.useState({ x: 0, y: 0 }), [dragging, setDragging] = R.useState(false);
      const dragState = R.useRef(null), dragMoved = R.useRef(false), wheelRef = R.useRef(null), wheelFrame = R.useRef(0), wheelDelta = R.useRef(0);
      const zoomFactor = fit * zoom;
      const clampPan = (x, y, factor = zoomFactor) => {
        const element = viewportRef.current, viewWidthNow = element?.clientWidth || 0, viewHeight = element?.clientHeight || 0, width = contentWidth * factor, mapHeight = height * factor;
        return { x: width <= viewWidthNow ? (viewWidthNow - width) / 2 : Math.min(0, Math.max(viewWidthNow - width, x)), y: mapHeight <= viewHeight ? 0 : Math.min(0, Math.max(viewHeight - mapHeight, y)) };
      };
      R.useEffect(() => {
        const element = viewportRef.current; if (!element) return;
        const update = () => { if (element.clientWidth > 0) setViewWidth(element.clientWidth); };
        update();
        const observer = new ResizeObserver(update); observer.observe(element);
        return () => observer.disconnect();
      }, []);
      R.useEffect(() => { setPan({ x: 0, y: 0 }); }, [search, expanded, graph?.version, graph?.nodes.length, resetToken]);
      const startDrag = event => { if (event.button !== 0) return; if (event.target.closest?.('.lm-graph-node, .lm-graph-edge, .lm-bridge')) return; dragState.current = { x: event.clientX, y: event.clientY, pan }; dragMoved.current = false; setDragging(true); };
      const moveDrag = event => { if (!dragState.current) return; const dx = event.clientX - dragState.current.x, dy = event.clientY - dragState.current.y; if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved.current = true; setPan(clampPan(dragState.current.pan.x + dx, dragState.current.pan.y + dy)); };
      const endDrag = () => { dragState.current = null; setDragging(false); };
      const backgroundClick = event => { const moved = dragMoved.current; dragMoved.current = false; if (!moved && !event.target.closest?.('.lm-graph-node, .lm-graph-edge, .lm-bridge')) onBackground?.(); };
      wheelRef.current = event => {
        event.preventDefault();
        wheelDelta.current += event.deltaY;
        const clientX = event.clientX, clientY = event.clientY;
        if (wheelFrame.current) return;
        wheelFrame.current = requestAnimationFrame(() => {
          wheelFrame.current = 0;
          const delta = wheelDelta.current; wheelDelta.current = 0;
          if (!delta) return;
          const element = viewportRef.current, rect = element?.getBoundingClientRect(); if (!rect) return;
          const magnitude = Math.min(0.15, Math.abs(delta) / 900);
          const next = Math.min(3, Math.max(0.4, zoom * (delta < 0 ? 1 + magnitude : 1 / (1 + magnitude))));
          if (Math.abs(next - zoom) < 0.0005) return;
          const px = clientX - rect.left, py = clientY - rect.top, ratio = next / zoom, factor = fit * next;
          setPan(clampPan(px - (px - pan.x) * ratio, py - (py - pan.y) * ratio, factor)); setZoom(next);
        });
      };
      R.useEffect(() => {
        const element = viewportRef.current; if (!element) return;
        const listener = event => wheelRef.current?.(event);
        element.addEventListener('wheel', listener, { passive: false });
        return () => { element.removeEventListener('wheel', listener); if (wheelFrame.current) cancelAnimationFrame(wheelFrame.current); };
      }, []);
      const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
      return h('div', { ref: viewportRef, className: 'lm-map-viewport' + (dragging ? ' lm-dragging' : ''), onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerLeave: endDrag, onClick: backgroundClick, onDoubleClick: resetView, 'aria-label': '关键词关系地图' },
        visibleNodes.length ? h('div', { className: 'lm-map-stage', style: { transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoomFactor + ')' } }, h('svg', { className: 'lm-map-svg', width: contentWidth, height, viewBox: '0 0 ' + contentWidth + ' ' + height }, ...svgChildren)) : h('div', { className: 'lm-map-stage lm-map-stage-empty' }, h(Empty, { title: '没有匹配的关键词' }, '试试同义词，或清空搜索。')),
        h('span', { className: 'lm-map-hint', 'aria-hidden': true }, '拖动平移 · 滚轮缩放 · 双击复位'));
    }

    function App() {
      const [state, setState] = R.useState(null), [error, setError] = R.useState(''), [toast, setToast] = R.useState('');
      const [tab, setTab] = R.useState('map'), [branchId, setBranchId] = R.useState(''), [selected, setSelected] = R.useState(null), [modal, setModal] = R.useState(null);
      const [busy, setBusy] = R.useState(false), [search, setSearch] = R.useState(''), [expanded, setExpanded] = R.useState(false), [zoom, setZoom] = R.useState(1);
      const [instruction, setInstruction] = R.useState(''), [dismissedRun, setDismissedRun] = R.useState(''), [activeComparison, setActiveComparison] = R.useState(''), [mapReset, setMapReset] = R.useState(0), [bridgePreview, setBridgePreview] = R.useState('');
      const refresh = async () => setState(await api('/state'));
      R.useEffect(() => { let mounted = true; const poll = async () => { try { const next = await api('/state'); if (mounted) setState(next); } catch (e) { if (mounted) setError(e.message); } }; poll(); const timer = setInterval(poll, 1800); return () => { mounted = false; clearInterval(timer); }; }, []);
      R.useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timer); }, [toast]);
      R.useEffect(() => { if (tab !== 'connections' || !activeComparison) return; const target = document.getElementById('lm-comparison-' + activeComparison); target?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [tab, activeComparison]);
      const run = async (path, input, message) => { setBusy(true); setError(''); try { const result = await api(path, input); await refresh(); if (message) setToast(message); return result; } catch (e) { setError(e.message); throw e; } finally { setBusy(false); } };
      const action = (path, input, message) => run(path, input, message).catch(() => {});
      const open = (type, data = {}) => { setError(''); setModal({ type, ...data }); };
      const loading = busy || state?.busy;
      const graph = tab === 'map' && branchId ? state?.branches.find(b => b.id === branchId)?.graph || state?.graph : state?.graph;
      const chosenBranch = state?.branches.find(b => b.id === branchId);
      const node = selected?.type === 'node' && graph?.nodes.find(n => n.id === selected.id);
      const edge = selected?.type === 'edge' && graph?.edges.find(e => e.id === selected.id);
      const paper = selected?.type === 'paper' && state?.papers.find(p => p.id === selected.id);
      const latest = state?.runs.at(-1), activeRun = state?.runs.findLast(r => r.status === 'running');
      const failedRun = latest && ['failed', 'cancelled', 'interrupted'].includes(latest.status) && dismissedRun !== latest.id ? latest : null;
      const editable = !branchId && !loading;
      const relatedEdges = node ? graph.edges.filter(e => e.from === node.id || e.to === node.id) : [];
      const ready = state?.papers.filter(p => p.status === 'ready').length || 0;
      const bridgeList = state && !branchId ? state.connections.map((comparison, index) => {
        const pick = branch => {
          if (!branch?.graph?.nodes?.length) return null;
          const degree = new Map(branch.graph.nodes.map(concept => [concept.id, 0]));
          (branch.graph.edges || []).forEach(edge => { if (degree.has(edge.from)) degree.set(edge.from, degree.get(edge.from) + 1); if (degree.has(edge.to)) degree.set(edge.to, degree.get(edge.to) + 1); });
          return [...branch.graph.nodes].sort((left, right) => (degree.get(right.id) || 0) - (degree.get(left.id) || 0))[0].id;
        };
        const from = pick(state.branches.find(branch => branch.id === comparison.a)), to = pick(state.branches.find(branch => branch.id === comparison.b));
        const cards = comparison.cards || [];
        return from && to && from !== to ? { id: comparison.id, from, to, label: '结合点 ' + (index + 1), labelA: comparison.labelA, labelB: comparison.labelB, cards: cards.length, cardsPreview: cards.slice(0, 3).map(card => ({ id: card.id, title: card.title, question: card.question, saved: !!card.saved })) } : null;
      }).filter(Boolean) : [];
      const bridgeDetail = bridgeList.find(bridge => bridge.id === bridgePreview) || null;
      const closeModal = () => setModal(null);
      const submitted = fn => async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await fn(values); closeModal(); } catch {} };

      let dialog;
      if (modal) {
        let body, title;
        const footer = label => h('div', { className: 'lm-modal-footer' }, h(Button, { onClick: closeModal }, '取消'), h(Button, { primary: true, type: 'submit', disabled: loading }, label));
        if (modal.type === 'import') {
          title = '导入本地论文';
          body = h('form', { onSubmit: submitted(async values => { const paths = values.paths.trim().split('\n').map(p => p.trim()).filter(Boolean); await run('/import', paths.every(p => /\.pdf$/i.test(p)) ? { paths } : { folder: values.paths.trim() }); }) }, h('p', { className: 'lm-muted' }, '选择一个论文文件夹，或粘贴 PDF 路径。原始文件保持原样。'), h(Button, { icon: 'folder', onClick: async () => { try { const value = await run('/pick', {}); if (value.path) setModal({ type: 'import', path: value.path }); else setToast('可在下方粘贴文件夹路径。'); } catch {} } }, '选择文件夹'), h(Field, { label: '文件夹或 PDF 路径', name: 'paths', key: modal.path, defaultValue: modal.path || '', required: true, rows: 4, placeholder: '/Users/…/论文库', help: '多个 PDF 路径请逐行填写。支持文字型 PDF，扫描件暂需先做 OCR。' }), footer('导入论文'));
        } else if (modal.type === 'branch') {
          title = '深化一个研究方向';
          body = h('form', { onSubmit: submitted(async values => { await run('/branch', values); setTab('branches'); }) }, h(Field, { label: '方向名称', name: 'label', defaultValue: node?.label || '', maxLength: 80, placeholder: '例如：跨专业沟通' }), h(Field, { label: '你想进一步探索什么？', name: 'query', required: true, rows: 4, defaultValue: node?.label || '', placeholder: '例如：创意管理工具如何帮助跨专业团队理解彼此的想法？', help: '每个方向都从整个论文库独立筛选。' }), footer('建立探索方向'));
        } else if (modal.type === 'compare') {
          title = '寻找两个方向的结合点';
          body = h('form', { onSubmit: submitted(async values => { await run('/compare', values); setTab('connections'); }) }, ...['a', 'b'].map((name, i) => h('label', { key: name, className: 'lm-field' }, h('span', null, `方向 ${name.toUpperCase()}`), h('select', { name, defaultValue: state.branches[i]?.id, required: true }, ...state.branches.map(b => h('option', { key: b.id, value: b.id }, b.label))))), h(Field, { label: '你的项目条件（可选）', name: 'context', rows: 3, placeholder: '兴趣、已有项目、可用时间，以及希望采用的研究方法…' }), footer('寻找结合点'));
        } else if (modal.type === 'rename') {
          title = '重命名关键词';
          body = h('form', { onSubmit: submitted(values => run('/edit', { version: state.graph.version, op: { type: 'rename', nodeId: node.id, label: values.label } })) }, h(Field, { label: '关键词名称', name: 'label', required: true, maxLength: 60, defaultValue: node.label }), footer('保存名称'));
        } else if (modal.type === 'merge') {
          title = '合并同义概念';
          body = h('form', { onSubmit: submitted(values => run('/edit', { version: state.graph.version, op: { type: 'merge', nodeIds: [node.id, values.other], label: values.label } })) }, h('label', { className: 'lm-field' }, h('span', null, `将「${node.label}」与以下概念合并`), h('select', { name: 'other', required: true }, ...state.graph.nodes.filter(n => n.id !== node.id).map(n => h('option', { key: n.id, value: n.id }, n.label)))), h(Field, { label: '合并后的名称', name: 'label', required: true, maxLength: 60, defaultValue: node.label }), h('p', { className: 'lm-muted' }, '原有名称保留为同义词，论文依据会一起保留。'), footer('合并概念'));
        } else if (modal.type === 'supplement') {
          title = '补充相关论文';
          body = h('form', { onSubmit: submitted(values => run('/supplement', values)) }, h(Field, { label: '检索词', name: 'query', required: true, defaultValue: node?.aliases[0] || node?.label || '', placeholder: '例如：boundary objects interdisciplinary design' }), h('p', { className: 'lm-muted' }, '检索 Crossref 后，AI 筛选最多 3 篇相关论文。可用摘要自动参与分析；只有题录的论文将标明材料不足。'), footer('检索并补充'));
        }
        dialog = h(Modal, { title, onClose: closeModal }, error && h('p', { className: 'lm-modal-error', role: 'alert' }, error), body);
      }

      let center;
      if (!state) center = h(Loading, { title: '正在打开文献地图…', note: '读取本机论文库与地图，请稍候…' });
      else if (tab === 'map' && chosenBranch && !graph?.nodes.length) center = h('div', { className: 'lm-welcome' }, h(Empty, { title: '这个方向暂未匹配到材料' }, chosenBranch.explanation), h(Button, { onClick: () => { setBranchId(''); setSelected(null); } }, '返回论文库总览'));
      else if (tab === 'map' && !graph?.nodes.length) center = h('div', { className: 'lm-welcome' }, h('div', { className: 'lm-orbit', 'aria-hidden': true }, h('span', { className: 'lm-orbit-line' }), h('i', null, '概念'), h('i', null, '原文'), h('i', null, '灵感'), h('strong', null, h(Icon, { name: 'map', size: 30 }))), h('h2', null, '从你的论文库，', h('br'), '发现下一个问题。'), h('p', { className: 'lm-welcome-copy' }, ready ? `${ready} 篇论文已准备好。生成地图，看看它们之间有哪些值得探索的联系。` : '把分散的论文整理成概念地图，让每一个连接都能回到原文。'), h(Button, { primary: true, icon: ready ? 'spark' : 'plus', disabled: loading, onClick: () => ready ? action('/analyze', {}) : open('import') }, ready ? '生成关键词地图' : '导入你的论文'), h('div', { className: 'lm-welcome-steps' }, ...['读懂论文库', '深化两个方向', '发现结合点'].map((v, i) => h('span', { key: v }, h('b', null, `0${i + 1}`), v))));
      else if (tab === 'map') center = h('div', { className: 'lm-map-wrap' }, chosenBranch && h('div', { className: 'lm-branch-note' }, h('strong', null, chosenBranch.label), h('span', null, chosenBranch.explanation), h(Button, { small: true, quiet: true, onClick: () => { setBranchId(''); setSelected(null); } }, '返回总览')), h(MapCanvas, { graph, selected, setSelected, search, expanded, zoom, setZoom, bridges: bridgeList, activeBridge: bridgePreview, onBridge: id => { setBridgePreview(id); setSelected(null); }, onBackground: () => setBridgePreview(''), resetToken: mapReset }), bridgeDetail && h(BridgePreview, { bridge: bridgeDetail, onClose: () => setBridgePreview(''), onOpen: () => { setTab('connections'); setActiveComparison(bridgeDetail.id); setBridgePreview(''); setSelected(null); } }), h('div', { className: 'lm-map-bottom' }, h('div', { className: 'lm-legend' }, h('span', null, h('i', { className: 'lm-line' }), '论文关系'), h('span', null, h('i', { className: 'lm-line lm-dashed' }), 'AI 假设'), bridgeList.length > 0 && h('span', null, h('i', { className: 'lm-line lm-bridge-line' }), '结合点 ' + bridgeList.length)), h('div', { className: 'lm-map-controls' }, h(Button, { small: true, quiet: true, onClick: () => setExpanded(!expanded) }, expanded ? '收起次要概念' : `展开全部 ${graph.nodes.length} 个概念`), h(Button, { small: true, quiet: true, onClick: () => setZoom(Math.max(0.4, zoom - 0.2)), 'aria-label': '缩小地图' }, '−'), h('span', null, `${Math.round(zoom * 100)}%`), h(Button, { small: true, quiet: true, onClick: () => setZoom(Math.min(3, zoom + 0.2)), 'aria-label': '放大地图' }, '+'), h(Button, { small: true, quiet: true, onClick: () => { setZoom(1); setMapReset(value => value + 1); }, 'aria-label': '重置地图视角' }, '重置'))));
      else if (tab === 'branches') center = h('div', { className: 'lm-content-scroll' }, h('div', { className: 'lm-page-title' }, h('div', null, h('h2', null, '探索方向'), h('p', null, '从同一份论文库，分别向感兴趣的问题深入。')), h(Button, { primary: true, icon: 'plus', disabled: loading || !state.graph.nodes.length, onClick: () => open('branch') }, '新建方向')), !state.branches.length ? h(Empty, { title: '先选择一个值得深入的方向', icon: 'branch' }, '可以点击地图里的关键词，再建立一个探索方向。') : h('div', { className: 'lm-branch-grid' }, ...state.branches.map((b, i) => h('article', { className: 'lm-branch-card', key: b.id }, h('span', { className: 'lm-eyebrow' }, `DIRECTION ${String(i + 1).padStart(2, '0')}`), h('h3', null, b.label), h('p', null, b.query), h('div', { className: 'lm-branch-chips' }, ...b.graph.nodes.slice(0, 5).map(n => h('span', { key: n.id }, n.label))), h('p', { className: 'lm-muted' }, b.explanation), h('footer', null, h('span', null, `${b.graph.nodes.length} 概念 · ${b.graph.edges.length} 条关系`, (b.libraryRevision !== state.libraryRevision || b.graphVersion !== state.graph.version) && h('b', { className: 'lm-warning-text' }, ' · 依据有更新')), h(Button, { small: true, icon: 'arrow', onClick: () => { setBranchId(b.id); setTab('map'); setSelected(null); } }, '查看地图'))))));
      else {
        const comparisons = tab === 'saved' ? state.connections.map(c => ({ ...c, cards: c.cards.filter(v => v.saved) })).filter(c => c.cards.length) : state.connections;
        center = h('div', { className: 'lm-content-scroll' }, h('div', { className: 'lm-page-title' }, h('div', null, h('h2', null, tab === 'saved' ? '已保存的灵感' : '两个方向，新的可能'), h('p', null, tab === 'saved' ? '保留问题、推断和来源，留给下一次深入阅读。' : '每个结合点都包含两侧论文依据，以及仍需验证的部分。')), tab !== 'saved' && h(Button, { primary: true, icon: 'spark', disabled: loading || state.branches.length < 2, onClick: () => open('compare') }, '寻找结合点')), !comparisons.length && h(Empty, { title: tab === 'saved' ? '遇到值得保留的问题，就收藏在这里' : '建立两个方向后，开始比较', icon: tab === 'saved' ? 'save' : 'link' }, 'AI 会解释具体连接机制，并把推测与已有研究分开呈现。'), ...comparisons.toReversed().map(c => h('section', { key: c.id, id: 'lm-comparison-' + c.id, className: 'lm-comparison' + (activeComparison === c.id ? ' lm-comparison-active' : '') }, h('div', { className: 'lm-comparison-label' }, h('span', null, c.labelA), h(Icon, { name: 'link', size: 14 }), h('span', null, c.labelB), (c.libraryRevision !== state.libraryRevision || c.graphVersion !== state.graph.version) && h('b', { className: 'lm-warning-text' }, '来源有更新')), h('details', { className: 'lm-comparison-summary' }, h('summary', null, '比较依据与适用范围'), h('p', { className: 'lm-muted' }, researchText(c.explanation))), !c.cards.length && h('p', null, '现有材料还不足以形成可信的结合点，可以补充论文后再比较。'), ...c.cards.map(card => h('article', { className: 'lm-connection-card', key: card.id }, h('div', { className: 'lm-connection-top' }, h('span', { className: 'lm-hypothesis-tag' }, h(Icon, { name: 'spark', size: 12 }), '待验证的研究灵感'), h(Button, { small: true, quiet: true, icon: card.saved ? 'check' : 'save', onClick: () => action('/save', { comparisonId: c.id, cardId: card.id, saved: !card.saved }) }, card.saved ? '已保存' : '保存灵感')), h('h3', null, card.title), h('p', null, researchText(card.mechanism)), h('div', { className: 'lm-question' }, h('span', null, '可以继续研究的问题'), h('strong', null, researchText(card.question))), h('details', null, h('summary', null, '推断过程与待验证之处'), h('h4', null, '推断过程'), h('p', null, researchText(card.inference)), h('h4', null, '待验证之处'), h('p', null, researchText(card.gap))), h('footer', null, h(Button, { small: true, icon: 'book', onClick: () => setSelected({ type: 'evidence', label: c.labelA, items: card.evidenceA }) }, '方向 A 的依据'), h(Button, { small: true, icon: 'book', onClick: () => setSelected({ type: 'evidence', label: c.labelB, items: card.evidenceB }) }, '方向 B 的依据')))))));
      }

      let detail;
      if (node) detail = h(R.Fragment, null, h('p', { className: 'lm-eyebrow' }, 'CONCEPT'), h('h2', null, node.label), h('p', { className: 'lm-muted' }, node.aliases.join(' · ')), h('div', { className: 'lm-detail-actions' }, h(Button, { small: true, primary: true, icon: 'branch', disabled: loading, onClick: () => open('branch') }, '深化这个方向'), editable && h(Button, { small: true, icon: 'edit', onClick: () => open('rename'), 'aria-label': '重命名关键词' }), editable && h(Button, { small: true, icon: 'link', onClick: () => open('merge'), 'aria-label': '合并同义概念' })), h('h4', { className: 'lm-section-label' }, '相关关系'), ...relatedEdges.map(e => h('button', { key: e.id, className: 'lm-relation-row', onClick: () => setSelected({ type: 'edge', id: e.id }) }, h('i', { className: e.kind === 'hypothesis' ? 'lm-dot lm-hollow' : 'lm-dot' }), h('span', null, e.label), h(Icon, { name: 'arrow', size: 13 }))), h('h4', { className: 'lm-section-label' }, '概念的原文依据'), h(Evidence, { items: node.evidence, papers: state.papers }));
      else if (edge) detail = h(R.Fragment, null, h('span', { className: edge.kind === 'hypothesis' ? 'lm-hypothesis-tag' : 'lm-supported-tag' }, edge.kind === 'hypothesis' ? 'AI 潜在连接 · 待验证' : categories[edge.category]), h('h2', null, edge.label), h('p', { className: 'lm-muted' }, `${graph.nodes.find(n => n.id === edge.from)?.label} ↔ ${graph.nodes.find(n => n.id === edge.to)?.label}`), h('div', { className: 'lm-explanation' }, edge.context), editable && h(Button, { small: true, onClick: () => action('/edit', { version: state.graph.version, op: { type: 'removeEdge', edgeId: edge.id } }, '关系已移除，可以撤销。') }, '移除这条关系'), h('h4', { className: 'lm-section-label' }, edge.kind === 'hypothesis' ? '两端概念依据' : '论文原文依据'), edge.kind === 'hypothesis' && h('p', { className: 'lm-muted' }, '这些原文支持两端概念，不直接证明这条连接。'), h(Evidence, { items: edge.evidence, papers: state.papers }));
      else if (paper) detail = h(R.Fragment, null, h('p', { className: 'lm-eyebrow' }, 'PAPER'), h('h2', null, paper.title), h('div', { className: 'lm-tag' }, availability[paper.availability]), h('p', { className: 'lm-muted' }, paper.authors, paper.year && ` · ${paper.year}`), paper.qualityWarnings?.length > 0 && h('div', { className: 'lm-modal-error' }, `已排除 ${paper.qualityWarnings.length} 条未通过核验的候选结果。`, ...paper.qualityWarnings.map((w, i) => h('p', { key: i }, `${w.label}：${w.reason}`))), paper.error && h('p', { className: 'lm-modal-error' }, paper.error), h('p', { className: 'lm-explanation' }, paper.summary || (paper.availability === 'metadata' ? '目前只有题录，未将其作为原文证据。' : '生成地图后，将在这里显示论文的分析说明。')), paper.coverage && h('p', { className: 'lm-muted' }, `已分析 ${paper.coverage.used}/${paper.coverage.total} 个文本片段${paper.coverage.used < paper.coverage.total ? '，长文采用分布采样' : ''}`), paper.path && paper.status === 'ready' && h('a', { className: 'lm-button', href: `/api/literature-map/papers/${paper.id}/pdf`, target: '_blank', rel: 'noreferrer' }, '打开 PDF ↗'), paper.url && h('a', { className: 'lm-button', href: paper.url, target: '_blank', rel: 'noreferrer' }, '查看论文 ↗'), h('h4', { className: 'lm-section-label' }, '地图中的原文证据'), h(Evidence, { items: evidenceUnique(state.graph.nodes.flatMap(n => n.evidence).filter(e => e.paperId === paper.id)), papers: state.papers }));
      else if (selected?.type === 'evidence') detail = h(R.Fragment, null, h('p', { className: 'lm-eyebrow' }, 'EVIDENCE'), h('h2', null, selected.label), h(Evidence, { items: selected.items, papers: state.papers }));
      else detail = h(R.Fragment, null, h('p', { className: 'lm-eyebrow' }, 'START EXPLORING'), h('h2', null, '值得从这里开始'), h('p', { className: 'lm-muted' }, '点击关键词或连线，同时查看论文依据与分析解释。'), ...(graph?.startingPoints || []).map((point, i) => h('button', { className: 'lm-starting-point', key: point.conceptId, onClick: () => { setTab('map'); setSelected({ type: 'node', id: point.conceptId }); } }, h('span', null, `0${i + 1}`), h('div', null, h('strong', null, graph.nodes.find(n => n.id === point.conceptId)?.label), h('p', null, point.reason)), h(Icon, { name: 'arrow', size: 14 }))), !graph?.startingPoints.length && h('div', { className: 'lm-guidance' }, h(Icon, { name: 'book', size: 24 }), h('h3', null, '先读懂，再连接'), h('p', null, '实线呈现论文中讨论的关系，虚线保留 AI 提出的探索可能。每一步都能回到原文。')));

      return h('section', { className: 'lm-app', 'aria-label': '文献地图工作台' }, h('link', { rel: 'stylesheet', href: '/api/literature-map/styles.css' }),
        h('header', { className: 'lm-header' }, h('div', { className: 'lm-brand' }, h('div', { className: 'lm-brand-mark' }, h(Icon, { name: 'map', size: 24 })), h('h1', null, '文献地图')), h('div', { className: 'lm-header-actions' }, loading && h('span', { className: 'lm-status-chip', role: 'status' }, h('span', { className: 'lm-spinner lm-spinner-sm' }), activeRun?.message || (state ? '正在保存…' : '正在加载…')), h(Button, { icon: 'plus', disabled: loading, onClick: () => open('import') }, '导入论文'), h(Button, { primary: true, icon: 'spark', disabled: loading || !ready, onClick: () => action('/analyze', {}) }, state?.graph.nodes.length ? '更新地图' : '生成地图'))),
        (error || failedRun) && !modal && h('div', { className: 'lm-banner lm-banner-error', role: 'alert' }, h('span', null, error || failedRun.error), h(Button, { quiet: true, small: true, icon: 'close', onClick: () => { setError(''); if (failedRun) setDismissedRun(failedRun.id); }, 'aria-label': '关闭错误提示' })),
        toast && h('div', { className: 'lm-banner', role: 'status' }, h('span', null, toast), h(Button, { quiet: true, small: true, icon: 'close', onClick: () => setToast(''), 'aria-label': '关闭提示' })),
        state?.stale && state.graph.nodes.length > 0 && h('div', { className: 'lm-banner lm-banner-warning' }, '论文库有变化。当前展示上一次地图，更新后可继续建立方向。'),
        state?.graph.editConflicts?.length > 0 && h('div', { className: 'lm-banner lm-banner-warning' }, `${state.graph.editConflicts.length} 条历史修改因来源变化未能自动应用，请在地图中复核。`),
        state?.graph.rejectedCount > 0 && h('div', { className: 'lm-banner lm-banner-warning' }, `已排除 ${state.graph.rejectedCount} 条未通过原文核验的候选结果，可在论文详情中查看。`),
        state?.modelError && h('div', { className: 'lm-banner lm-banner-warning' }, state.modelError),
        activeRun && h('div', { className: 'lm-progress-bar', role: 'status', 'aria-live': 'polite' }, h('div', { className: 'lm-spinner' }), h('div', { className: 'lm-progress-meta' }, h('strong', null, runLabels[activeRun.kind] || '正在处理'), h('span', null, activeRun.message)), h('div', { className: 'lm-progress-value' }, h('progress', { max: 1, value: activeRun.progress }), h('b', null, Math.round((activeRun.progress || 0) * 100) + '%')), h(Button, { small: true, quiet: true, onClick: () => action('/cancel', { id: activeRun.id }) }, '取消')),
        !activeRun && busy && h('div', { className: 'lm-progress-bar lm-progress-local', role: 'status' }, h('div', { className: 'lm-spinner' }), h('span', null, '正在提交请求…')),
        h('div', { className: 'lm-workbench' }, h('aside', { className: 'lm-library' }, h('div', { className: 'lm-library-title' }, h('h2', null, '我的论文库'), h('span', null, state?.papers.length || 0)), h('div', { className: 'lm-library-tools' }, h('span', null, `${ready} 篇可用`), h(Button, { quiet: true, small: true, icon: 'refresh', disabled: loading || !state?.papers.length, onClick: () => action('/refresh', {}), 'aria-label': '检查文件更新', title: '检查文件更新' })), !state && h('div', { className: 'lm-skeleton', 'aria-hidden': true }, ...[0, 1, 2, 3].map(i => h('div', { key: i, className: 'lm-skeleton-row' }, h('i'), h('span')))), h('div', { className: 'lm-paper-list' }, ...((state?.papers || []).map(p => h('button', { className: `lm-paper ${selected?.id === p.id ? 'lm-paper-active' : ''}`, key: p.id, onClick: () => setSelected({ type: 'paper', id: p.id }) }, h(Icon, { name: 'file', size: 17 }), h('div', null, h('strong', null, p.title), h('small', null, p.status === 'error' ? '解析失败' : `${p.pageCount ? `${p.pageCount} 页 · ` : ''}${availability[p.availability]}${p.analyzed ? ' · 已分析' : ''}`)), p.isNew && h('i', { className: 'lm-new-dot', title: '新增论文' }))))), state && !state.papers.length && h('p', { className: 'lm-library-empty' }, '你的论文会保存在这里，地图中的每个概念都能找到出处。'), h('div', { className: 'lm-library-footer' }, h('span', null, h('i', { className: 'lm-local-dot' }), '数据保存在本机'), h('a', { href: '/api/literature-map/export', download: true }, '导出 ↗'))),
        h('main', { className: 'lm-main' }, h('div', { className: 'lm-toolbar' }, h('nav', { 'aria-label': '文献地图导航' }, ...[['map', '关键词地图'], ['branches', '探索方向'], ['connections', '结合点'], ['saved', '已保存']].map(([value, label]) => h('button', { key: value, 'aria-current': tab === value ? 'page' : undefined, onClick: () => { setTab(value); setBridgePreview(''); if (value !== 'map') { setBranchId(''); setSelected(null); } } }, label))), h('div', { className: 'lm-toolbar-actions' }, tab === 'map' && graph?.nodes.length > 0 && h('label', { className: 'lm-map-search' }, h(Icon, { name: 'search', size: 14 }), h('input', { 'aria-label': '搜索地图关键词', placeholder: '搜索关键词', value: search, onChange: e => setSearch(e.target.value) })), h(Button, { small: true, quiet: true, icon: 'undo', disabled: loading || !state?.edits.some(e => !e.undoneAt), onClick: () => action('/undo', { version: state.graph.version }), 'aria-label': '撤销上一次地图修改', title: '撤销上一次地图修改' }))), center, h('div', { className: 'lm-main-footer' }, h('span', null, graph?.nodes.length ? `${graph.nodes.length} 个概念 · ${graph.edges.filter(e => e.kind === 'supported').length} 关系 · ${graph.edges.filter(e => e.kind === 'hypothesis').length} 潜在连接` : '先导入论文，再开始探索'), h(Button, { small: true, quiet: true, icon: 'search', disabled: loading, onClick: () => open('supplement') }, '补充相关论文'))),
        h('aside', { className: 'lm-inspector' }, h('div', { className: 'lm-inspector-title' }, h('span', null, '解释与依据'), selected && h(Button, { small: true, quiet: true, icon: 'close', onClick: () => setSelected(null), 'aria-label': '关闭详情' })), h('div', { className: 'lm-detail' }, detail), h('form', { className: 'lm-conversation', onSubmit: e => { e.preventDefault(); if (!instruction.trim()) return; run('/conversation', { instruction }).then(() => setInstruction('')).catch(() => {}); } }, h('label', { htmlFor: 'lm-conversation-input' }, h(Icon, { name: 'spark', size: 13 }), '用对话调整地图'), h('div', null, h('textarea', { id: 'lm-conversation-input', value: instruction, onChange: e => setInstruction(e.target.value), placeholder: '例如：把“共创”改名为“协同设计”', rows: 2, disabled: loading || !state?.graph.nodes.length }), h(Button, { type: 'submit', primary: true, icon: 'arrow', disabled: loading || !instruction.trim() || !state?.graph.nodes.length, 'aria-label': '提交地图修改' }))))), dialog);
    }
    return { name: 'literature-map-ui', inject: ['slots', 'layout'], apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'literature-map' }, App));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'literature-map', order: 45, label: '文献地图' }, () => h(Icon, { name: 'map', size: 17 })));
    } };
  },
});
