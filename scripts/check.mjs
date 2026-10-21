import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const roots = ['.', 'lib', 'scripts', 'test']; let failed = false;
for (const root of roots) for (const name of await readdir(root)) {
  if (!/\.(mjs|js)$/.test(name)) continue;
  const file = `${root}/${name}`, result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { failed = true; process.stderr.write(result.stderr); }
}
if (failed) process.exitCode = 1; else console.log('JavaScript syntax checks passed.');
