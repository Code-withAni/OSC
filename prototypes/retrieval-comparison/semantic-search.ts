/**
 * Semantic / Subword Retrieval
 *
 * Character n-gram TF-IDF (3-grams by default).
 *
 * Why n-grams are a meaningful semantic proxy:
 * - "async" and "asynchronous" share "n-c", "y-n", "s-y" n-grams → match
 * - "argument" and "arguments" share n-grams → match
 * - "parse" matches "parsing" and "parser" through shared n-grams
 * - OOV (out-of-vocabulary) terms handled natively
 *
 * This is a lightweight semantic similarity signal WITHOUT embeddings.
 * For a production system, replace with real embeddings (e.g. all-MiniLM-L6-v2).
 * The benchmarking infrastructure stays identical — only the scorer changes.
 *
 * Run:  npx tsx prototypes/retrieval-comparison/benchmark.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, relative } from 'path';

const NGRAM_SIZE = 3;
const CHUNK_SIZE = 300;

export interface Chunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
  symbolHint?: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  method: 'semantic';
}

function tokenize(text: string): string[] {
  // Split camelCase and snake_case identifiers (mirrors keyword tokenizer).
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function getNgrams(text: string, n = NGRAM_SIZE): string[] {
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.length < n) return [];
  const ngrams: string[] = [];
  for (let i = 0; i <= clean.length - n; i++) {
    ngrams.push(clean.slice(i, i + n));
  }
  return ngrams;
}

export function buildIndex(chunks: Chunk[]) {
  const N = chunks.length;
  const df = new Map<string, number>();

  for (const chunk of chunks) {
    // N-grams of the raw text for subword matching
    const ngrams = getNgrams(chunk.text);
    const unique = new Set(ngrams);
    for (const ng of unique) {
      df.set(ng, (df.get(ng) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, freq] of df) {
    idf.set(term, Math.log(N / freq));
  }

  // Pre-compute n-gram sets per chunk
  const chunkNgrams = chunks.map((c) => new Set(getNgrams(c.text)));
  const docLengths = chunks.map((c) =>
    Math.sqrt(getNgrams(c.text).length)
  );

  // Term co-occurrence (within chunk) for PMI-based query expansion.
  // cooc: Map<term, Map<coTerm, count>> — both keys are tokenized terms.
  const cooc = new Map<string, Map<string, number>>();
  const termDf = new Map<string, number>();
  for (const chunk of chunks) {
    const terms = new Set(tokenize(chunk.text));
    for (const t of terms) {
      termDf.set(t, (termDf.get(t) ?? 0) + 1);
    }
    const list = [...terms];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!cooc.has(a)) cooc.set(a, new Map());
        if (!cooc.has(b)) cooc.set(b, new Map());
        cooc.get(a)!.set(b, (cooc.get(a)!.get(b) ?? 0) + 1);
        cooc.get(b)!.set(a, (cooc.get(b)!.get(a) ?? 0) + 1);
      }
    }
  }

  return { chunks, idf, chunkNgrams, docLengths, cooc, termDf, N };
}

/**
 * Rocchio-style query expansion: for each query term, add the top co-occurring
 * terms (highest PMI) that appear together in code chunks. This captures
 * conceptual links the raw query text lacks — e.g. "environment variable"
 * expands toward "envVar option value".
 */
function expandQuery(query: string, index: ReturnType<typeof buildIndex>): string {
  const { cooc, termDf, N } = index;
  const queryTerms = new Set(tokenize(query));
  const expansions: { term: string; weight: number }[] = [];

  for (const qt of queryTerms) {
    const neighbors = cooc.get(qt);
    if (!neighbors) continue;
    const dfQ = termDf.get(qt) ?? 0;
    for (const [coTerm, c] of neighbors) {
      if (queryTerms.has(coTerm)) continue;
      // PMI(qt, coTerm) = log2( p(qt,coTerm) / (p(qt) p(coTerm)) )
      const pxy = c / N;
      const px = dfQ / N;
      const py = (termDf.get(coTerm) ?? 0) / N;
      const pmi = Math.log2(Math.max(pxy, Number.EPSILON) / Math.max(px * py, Number.EPSILON));
      if (pmi > 1.5 && pmi < 20) {
        expansions.push({ term: coTerm, weight: pmi });
      }
    }
  }

  if (expansions.length === 0) return query;

  // Keep the top 12 expansions by PMI, append as weighted query tokens.
  expansions.sort((a, b) => b.weight - a.weight);
  const chosen = expansions.slice(0, 12).map((e) => e.term);
  return `${query} ${chosen.join(' ')}`;
}

export function searchSemantic(
  query: string,
  index: ReturnType<typeof buildIndex>,
  topK = 10
): SearchResult[] {
  if (!query.trim()) return [];

  const expanded = expandQuery(query, index);
  const scores: number[] = [];
  for (let i = 0; i < index.chunks.length; i++) {
    scores.push(score(expanded, i, index));
  }

  const results: SearchResult[] = scores
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .map(({ s, i }) => ({ chunk: index.chunks[i], score: s, method: 'semantic' as const }));

  return results;
}

function score(query: string, chunkIdx: number, index: ReturnType<typeof buildIndex>): number {
  const queryNgrams = getNgrams(query);
  if (queryNgrams.length === 0) return 0;

  const { idf, chunkNgrams, docLengths } = index;
  const chunkSet = chunkNgrams[chunkIdx];
  const docLen = docLengths[chunkIdx];
  if (docLen === 0) return 0;

  // Also include query token n-grams for exact word matches
  const queryTokens = tokenize(query);
  const allQueryNgrams = new Set([
    ...queryNgrams,
    ...getNgrams(queryTokens.join(' ')), // n-grams of the full query string too
  ]);

  // Weighted: exact n-gram matches get +1, partial overlap gets scaled
  let dot = 0;
  for (const ng of allQueryNgrams) {
    if (chunkSet.has(ng)) {
      dot += idf.get(ng) ?? 0;
    }
  }
  return dot / docLen;
}

export function indexCodebase(rootDir: string, outputFile?: string): ReturnType<typeof buildIndex> {
  const chunks: Chunk[] = [];
  const files = walkDir(rootDir);

  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = source.split('\n');
    const relativePath = relative(rootDir, file);

    let currentLines: string[] = [];
    let currentWords = 0;
    let startLine = 1;

    const relativePathNorm = relativePath.replace(/\\/g, '/');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const wordCount = line.trim().split(/\s+/).length;
      currentLines.push(line);
      currentWords += wordCount;

      if (currentWords >= CHUNK_SIZE || i === lines.length - 1) {
        chunks.push({
          id: `${relativePathNorm}:${startLine}`,
          filePath: relativePathNorm,
          startLine,
          endLine: i + 1,
          text: currentLines.join('\n'),
        });
        currentLines = [];
        currentWords = 0;
        startLine = i + 2;
      }
    }
  }

  const idx = buildIndex(chunks);
  if (outputFile) {
    const { writeFileSync } = require('fs');
    writeFileSync(
      outputFile,
      JSON.stringify({ chunkCount: chunks.length, fileCount: files.length }, null, 2)
    );
  }
  return idx;
}

function walkDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (['node_modules', 'dist', 'build', 'coverage', 'tmp'].includes(entry.name)) continue;
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, files);
    } else if (entry.isFile() && /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}