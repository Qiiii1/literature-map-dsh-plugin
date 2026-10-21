import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifiedPdf } from '../lib/pdf.mjs';
import { hash } from '../lib/util.mjs';
import { crossrefSearch, deduplicatePapers } from '../lib/search.mjs';

test('changed source bytes are never opened as if they supported old evidence', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'lit-source-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'source.txt'); await writeFile(path, 'original source bytes');
  const p = { path, sourceHash: hash('original source bytes') };
  assert.equal((await verifiedPdf(p)).toString(), 'original source bytes');
  await writeFile(path, 'updated source bytes'); await assert.rejects(verifiedPdf(p), /原文件已变化/);
});
test('Crossref records distinguish abstract from metadata, strip markup, and deduplicate DOI/title', async () => {
  let requested;
  const signal = new AbortController().signal;
  const results = await crossrefSearch('public research query', signal, async url => { requested = url; return { ok: true, json: async () => ({ message: { items: [{ DOI: '10.1000/A', title: ['<i>Title A</i>'], abstract: `<jats:p>${'Research text '.repeat(20)}</jats:p>` }, { DOI: '10.1000/B', title: ['Title B'] }] } }) }; });
  assert.equal(requested.hostname, 'api.crossref.org'); assert.equal(results[0].title, 'Title A'); assert.equal(results[0].availability, 'abstract'); assert.equal(results[1].availability, 'metadata'); assert.equal(results[1].passages.length, 0);
  assert.equal(deduplicatePapers(results, [{ title: 'TITLE A', doi: '10.1000/a' }]).length, 1);
});
