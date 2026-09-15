/**
 * Keyword / Full-Text Retrieval
 *
 * CamelCase-aware token TF-IDF, normalized by chunk length. No embeddings,
 * no API calls. Chunks the codebase into ~300-word spans with file+line
 * metadata, indexes each chunk, then scores queries.
 *
 * Run:  npx tsx prototypes/retrieval-comparison/benchmark.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, relative } from 'path';

const CHUNK_SIZE = 300; // approximate token count per chunk (word-based)

export interface Chunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  text: string;
  symbolHint?: string; // symbol name if this chunk covers a known symbol
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  method: 'keyword';
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  // Split camelCase and snake_case identifiers so queries like
  // "add business days" can reach "addBusinessDays".
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// ─── TF-IDF ───────────────────────────────────────────────────────────────────

interface TfIdfIndex {
  chunks: Chunk[];
  idf: Map<string, number>;
  docLengths: number[];
}

/** Build index from a list of chunks. */
export function buildIndex(chunks: Chunk[]): TfIdfIndex {
  const N = chunks.length;
  const df = new Map<string, number>(); // document frequency
  const docLengths: number[] = [];

  for (const chunk of chunks) {
    const terms = tokenize(chunk.text);
    const unique = new Set(terms);
    for (const term of unique) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    docLengths.push(Math.sqrt(terms.length)); // for cosine normalization
  }

  // IDF = log(N / df)
  const idf = new Map<string, number>();
  for (const [term, freq] of df) {
    idf.set(term, Math.log(N / freq));
  }

  return { chunks, idf, docLengths };
}

function tfidfScore(queryTerms: string[], chunkIdx: number, index: TfIdfIndex): number {
  const chunk = index.chunks[chunkIdx];
  const terms = tokenize(chunk.text);
  const termFreq = new Map<string, number>();
  for (const t of terms) {
    termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
  }

  const docLen = index.docLengths[chunkIdx];
  if (docLen === 0) return 0;

  let dot = 0;
  for (const qt of queryTerms) {
    const tf = termFreq.get(qt) ?? 0;
    if (tf === 0) continue;
    const idf = index.idf.get(qt) ?? 0;
    dot += tf * idf;
  }
  return dot / docLen;
}

export function searchKeyword(
  query: string,
  index: TfIdfIndex,
  topK = 10,
  _options?: { boostSymbolName?: boolean }
): SearchResult[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Score every chunk
  const scores: number[] = [];
  for (let i = 0; i < index.chunks.length; i++) {
    scores.push(tfidfScore(queryTerms, i, index));
  }

  // Top-k via partial sort
  const result: SearchResult[] = [];
  const indices = scores
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, topK);

  for (const { s, i } of indices) {
    result.push({ chunk: index.chunks[i], score: s, method: 'keyword' });
  }
  return result;
}

// ─── Code-indexing helper ──────────────────────────────────────────────────────

/** Walk a directory recursively and index every JS/TS file. */
export function indexCodebase(rootDir: string, outputFile?: string): TfIdfIndex {
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

    // Chunk by ~CHUNK_SIZE words
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

  const index = buildIndex(chunks);
  if (outputFile) {
    writeFileSync(
      outputFile,
      JSON.stringify({ chunkCount: chunks.length, fileCount: files.length }, null, 2)
    );
  }
  return index;
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