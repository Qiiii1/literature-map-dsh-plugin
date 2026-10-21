import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createService } from './lib/service.mjs';
import { dshGenerator } from './lib/ai.mjs';
import { handler } from './lib/http.mjs';
import { installTools } from './tools.mjs';

export const name = 'literature-map';
export const inject = ['tools', 'webServer', 'llm', 'agentDefaultModel'];

export async function apply(ctx, config = {}) {
  const profile = ctx.get('profileContext')?.dir ?? process.cwd();
  const service = await createService({
    file: resolve(config.dataFile ?? resolve(profile, 'literature-map', 'library.json')),
    generator: dshGenerator(ctx, config),
    picker: async () => {
      const capability = ctx.get('directoryPicker')?.capability();
      if (capability?.kind !== 'native') return null;
      return capability.pick();
    },
  });
  installTools(ctx, service);
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/api/literature-map', handler: handler(service, () => readFile(new URL('./styles.css', import.meta.url))) }));
  ctx.effect(() => () => service.close());
}
