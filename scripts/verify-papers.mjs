import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parsePdf } from '../lib/pdf.mjs';
const manifest = process.argv[2];
if (!manifest) throw new Error('用法：npm run verify:papers -- /absolute/path/to/papers.json（内容为路径数组或 {paths:[]}）');
const input = JSON.parse(await readFile(manifest, 'utf8')), paths = Array.isArray(input) ? input : input.paths;
const reports = [];
for (const path of paths) {
  try { const paper = await parsePdf(path); const result = { id: paper.id, path, title: paper.title, pages: paper.pageCount, passages: paper.passages.length, characters: paper.passages.reduce((n, p) => n + p.text.length, 0), sourceHash: paper.sourceHash, status: 'ready' }; reports.push(result); console.log(`${result.pages} 页 · ${result.passages} 个片段 · ${result.title}`); }
  catch (e) { reports.push({ path, status: 'error', error: e.message }); console.error(e.message); }
}
await mkdir('.local', { recursive: true });
await writeFile('.local/pdf-verification.json', JSON.stringify(reports, null, 2));
if (reports.some(r => r.status === 'error')) process.exitCode = 1;
