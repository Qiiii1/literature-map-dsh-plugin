import { AppError } from './util.mjs';

export function localRequest(req) {
  const host = req.headers.host;
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) throw new AppError('仅支持本机访问', 403);
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}` && origin !== 'dsh-app://app') throw new AppError('来源不允许', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('来源不允许', 403);
}
export function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value));
}
export async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('需要 JSON 请求', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) throw new AppError('请求过大', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
  catch { throw new AppError('JSON 格式不正确'); }
}

export function handler(service, stylesheet) {
  return async (req, res) => {
    try {
      localRequest(req);
      const url = new URL(req.url, 'http://localhost'), path = url.pathname.slice('/api/literature-map'.length);
      if (req.method === 'GET') {
        if (path === '/state') return json(res, 200, await service.state());
        if (path === '/styles.css') { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); return res.end(await stylesheet()); }
        if (path === '/export') { res.setHeader('Content-Disposition', 'attachment; filename="literature-map.json"'); return json(res, 200, await service.exported()); }
        const paper = /^\/papers\/([\w-]+)\/(passages|pdf)$/.exec(path);
        if (paper?.[2] === 'passages') return json(res, 200, await service.passages(paper[1]));
        if (paper?.[2] === 'pdf') { const bytes = await service.pdf(paper[1]); res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); return res.end(bytes); }
      }
      if (req.method === 'POST') {
        const input = await readJson(req);
        const routes = { '/pick': () => service.pick(), '/import': () => service.import(input), '/refresh': () => service.refresh(), '/analyze': () => service.analyze(), '/branch': () => service.branch(input), '/compare': () => service.compare(input), '/edit': () => service.edit(input), '/undo': () => service.undo(input), '/conversation': () => service.conversation(input), '/save': () => service.saveCard(input), '/related/plan': () => service.relatedPlan(input), '/related/search': () => service.relatedSearch(input), '/related/add': () => service.relatedAdd(input), '/supplement': () => service.supplement(input), '/cancel': () => service.tasks.cancel(input.id) };
        if (routes[path]) return json(res, 200, await routes[path]());
      }
      throw new AppError('接口不存在', 404);
    } catch (error) { json(res, error.status ?? 500, { error: error.status ? error.message : '操作失败，请检查文件或重试' }); }
  };
}
