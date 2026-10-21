import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(process.env.LITERATURE_PREVIEW_DIR || resolve(root, '.local/preview'));
await mkdir(directory, { recursive: true });
const patch = resolve(directory, 'plugin.patch.yml');
const credentialsPatch = process.argv.includes('--reuse-dsh-credentials') ? `- id: credentials\n  config:\n    path: ${JSON.stringify(resolve(homedir(), '.dsh/.credentials.yaml'))}\n    watch: false\n` : '';
let modelPatch = '', modelEnvironment = {};
if (process.env.LITERATURE_MODEL_CONFIG) {
  const settings = JSON.parse(await readFile(process.env.LITERATURE_MODEL_CONFIG, 'utf8'));
  const base = new URL(settings.baseURL || 'https://api.deepseek.com');
  if (!settings.apiKey || base.protocol !== 'https:' || base.hostname !== 'api.deepseek.com') throw new Error('测试模型配置需要 DeepSeek 官方端点及可用密钥');
  modelEnvironment = { LITERATURE_DSH_API_KEY: settings.apiKey };
  modelPatch = `- id: llm-deepseek\n  config:\n    apiKeyEnv: LITERATURE_DSH_API_KEY\n    baseURL: https://api.deepseek.com/anthropic\n- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: ${JSON.stringify(settings.model || 'deepseek-flash')}\n`;
}
const testPatch = process.env.LITERATURE_TEST_ADAPTER ? `- insert:\n    - id: literature-test-fixture\n      name: ${JSON.stringify(resolve(root, 'test/dsh-adapter.mjs'))}\n      config: {}\n` : '';
const testModel = process.env.LITERATURE_TEST_ADAPTER ? '\n        provider: literature-fixture\n        model: fixture-test-only' : '';
await writeFile(patch, `${credentialsPatch}${modelPatch}${testPatch}- insert:\n    - id: literature-map\n      name: ${JSON.stringify(resolve(root, 'index.mjs'))}\n      config:\n        dataFile: ${JSON.stringify(resolve(directory, 'library.json'))}${testModel}\n`);
const launcher = process.env.LITERATURE_DSH_LAUNCHER ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
const child = spawn(launcher, ['web', '--patch', patch, '--no-open', '--port', process.env.LITERATURE_PORT || '4193'], { cwd: root, env: { ...process.env, ...modelEnvironment, DSH_HOME: resolve(directory, 'dsh-home') }, stdio: ['ignore', 'pipe', 'pipe'] });
let pending = '', writes = Promise.resolve();
child.stdout.on('data', chunk => {
  pending += chunk;
  const lines = pending.split('\n'); pending = lines.pop();
  for (const line of lines) {
    const url = line.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0];
    if (url) writes = writes.then(() => writeFile(resolve(directory, 'access.json'), JSON.stringify({ url, pid: child.pid }), { mode: 0o600 }));
    process.stdout.write(`${line.replace(/\?token=\S+/g, '?token=[local access token]')}\n`);
  }
});
child.stderr.on('data', chunk => process.stderr.write(chunk));
child.on('error', e => { console.error(e.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
console.log('文献地图测试配置启动中。首次测试可在 dsh 模型设置中连接账号。');
