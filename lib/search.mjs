import { AppError, hash, key } from './util.mjs';

const plain = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// Crossref scholarly metadata. Called only after an explicit user search action.
export async function crossrefSearch(query, signal, request = fetch) {
  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query', query);
  url.searchParams.set('rows', '12');
  const response = await request(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]), headers: { Accept: 'application/json', 'User-Agent': 'LiteratureMap/0.2 (local research plugin)' } });
  if (!response.ok) throw new AppError(`论文检索暂不可用（HTTP ${response.status}），请稍后重试`, 503);
  const body = await response.json();
  return (body.message?.items ?? []).filter(w => w.DOI && w.title?.[0] && !w['is-retracted']).map(w => {
    const doi = String(w.DOI).toLowerCase(), title = plain(w.title[0]), abstract = plain(w.abstract);
    const id = `doi-${hash(doi).slice(0, 18)}`, sourceHash = hash(`${doi}:${abstract}`);
    return { id, title, doi, url: `https://doi.org/${encodeURI(doi)}`, authors: (w.author ?? []).map(a => [a.given, a.family].filter(Boolean).join(' ')).join(', '), year: w.published?.['date-parts']?.[0]?.[0] ?? null, sourceHash, availability: abstract.length > 100 ? 'abstract' : 'metadata', status: 'ready', addedFrom: 'Crossref', passages: abstract.length > 100 ? [{ id: `${id}:${sourceHash.slice(0, 12)}:abstract`, paperId: id, sourceHash, page: null, text: abstract }] : [], summary: '', extraction: null };
  });
}

export function deduplicatePapers(candidates, existing) {
  const titles = new Set(existing.map(p => key(p.title)));
  const dois = new Set(existing.filter(p => p.doi).map(p => p.doi.toLowerCase()));
  return candidates.filter(p => { if (titles.has(key(p.title)) || dois.has(p.doi)) return false; titles.add(key(p.title)); dois.add(p.doi); return true; });
}
