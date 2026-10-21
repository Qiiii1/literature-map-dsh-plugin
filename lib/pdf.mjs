import { readFile, stat, readdir, realpath } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { hash, AppError } from './util.mjs';

export async function scanFolder(input) {
  const root = await realpath(resolve(input));
  if (!(await stat(root)).isDirectory()) throw new AppError('请选择文件夹');
  const paths = [];
  async function walk(dir, depth = 0) {
    if (depth > 12) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') paths.push(path);
      if (paths.length > 200) throw new AppError('首版单个论文库最多导入 200 篇，请选择更小的文件夹');
    }
  }
  await walk(root);
  return { root, paths: paths.sort() };
}

export async function parsePdf(input) {
  const path = await realpath(resolve(input)), info = await stat(path);
  if (!info.isFile() || extname(path).toLowerCase() !== '.pdf') throw new AppError('只支持 PDF 文件');
  if (info.size > 50 * 1024 * 1024) throw new AppError('PDF 大于 50 MB，请拆分后导入');
  const bytes = await readFile(path), sourceHash = hash(bytes), id = `paper-${hash(path).slice(0, 16)}`;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
    if (doc.numPages > 500) throw new AppError('PDF 超过 500 页，请拆分后导入');
    const metadata = await doc.getMetadata().catch(() => ({}));
    const candidateTitle = metadata.info?.Title?.trim();
    const title = candidateTitle && !/microsoft\s+word|untitled|^document\b|\.docx?$|^\d+$|^EMERALD_|^TOCHI\d/i.test(candidateTitle) ? candidateTitle : '';
    const passages = [], pages = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const p = await doc.getPage(page), content = await p.getTextContent();
      let value = '';
      for (const item of content.items) if (typeof item.str === 'string') value += item.str + (item.hasEOL ? '\n' : ' ');
      value = value.replace(/ +\n/g, '\n').trim();
      pages.push({ page, characters: value.length });
      for (let offset = 0; offset < value.length; offset += 1700) {
        const body = value.slice(offset, offset + 1900);
        if (body.trim().length < 20) continue;
        passages.push({ id: `${id}:${sourceHash.slice(0, 12)}:${page}:${offset}`, paperId: id, sourceHash, page, text: body });
      }
      p.cleanup();
    }
    if (passages.reduce((n, p) => n + p.text.length, 0) < 250) throw new AppError('未提取到足够文字，可能是扫描件；首版需要带文字层的 PDF');
    return { id, path, filename: basename(path), title: title && title.length < 300 ? title : basename(path, '.pdf'), sourceHash, pageCount: doc.numPages, size: info.size, mtimeMs: info.mtimeMs, availability: 'fulltext', status: 'ready', passages, pages, summary: '', extraction: null };
  } finally { await task.destroy(); }
}

export async function verifiedPdf(paper) {
  if (!paper?.path) throw new AppError('此论文尚未导入本地全文', 404);
  const bytes = await readFile(paper.path);
  if (hash(bytes) !== paper.sourceHash) throw new AppError('原文件已变化，请先检查更新；旧证据仍保留', 409);
  return bytes;
}
