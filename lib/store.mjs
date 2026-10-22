import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { clone, now, uid, AppError } from './util.mjs';

export function emptyState() {
  return { schema: 1, revision: 0, libraryRevision: 0, folders: [], papers: [], graph: { nodes: [], edges: [], clusters: [], startingPoints: [], libraryRevision: 0 }, branches: [], connections: [], relatedSearches: [], edits: [], runs: [] };
}

export async function createStore(file) {
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; state = emptyState(); }
  if (state.schema !== 1) throw new AppError('不支持的数据版本，请保留原文件后检查插件版本', 503);
  state.relatedSearches ??= [];
  let tail = Promise.resolve();
  async function save(next) {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${uid()}.tmp`;
    await writeFile(tmp, JSON.stringify(next), { mode: 0o600 });
    await rename(tmp, file);
    state = next;
  }
  // Any interrupted task is visible as interrupted rather than permanently running.
  for (const run of state.runs) if (run.status === 'running' || run.status === 'queued') {
    run.status = 'interrupted'; run.error = '上次运行被中断，可以重新发起'; run.finishedAt = now();
  }
  await save(state);
  return {
    read: () => clone(state),
    update(fn) {
      const task = tail.then(async () => {
        const next = clone(state), result = await fn(next);
        next.revision = state.revision + 1;
        await save(next);
        return result;
      });
      tail = task.catch(() => {});
      return task;
    },
  };
}
