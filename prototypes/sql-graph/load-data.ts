/**
 * load-data.ts — produce real and synthetic knowledge-graph data for the
 * SQL graph benchmark.
 *
 * Real: parse + resolve the pinned repositories with the validated parser
 *       (`prototypes/parser-comparison/typescript-compiler-api/parser.ts`) and
 *       resolver (`prototypes/resolver/resolver.ts`), then reconcile their raw
 *       node/relationship ids into a clean node set. Files are parsed relative
 *       to the repo root so every id is repo-relative and portable.
 * Synthetic: replicate the real topology at a scale factor (same degree
 *            distribution, ids remapped). CLEARLY LABELED SYNTHETIC.
 *
 * Output shape (benchmark.ts consumes this directly):
 *   Graph = { label, kind: 'real'|'synthetic', nodes: GraphNode[],
 *             rels: GraphRel[], placeholderCount }
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TypeScriptCompilerParser } from '../parser-comparison/typescript-compiler-api/parser';
import { RepositoryResolver } from '../resolver/resolver';
import type { File, Symbol, Test, TodoMarker } from '../common-model';

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  kind?: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  isExported?: boolean;
  isTest?: boolean;
  props: Record<string, unknown>;
}

export interface GraphRel {
  from: string;
  to: string;
  type: string;
  callSiteLine?: number;
  props: Record<string, unknown>;
}

export interface Graph {
  label: string;
  kind: 'real' | 'synthetic';
  nodes: GraphNode[];
  rels: GraphRel[];
  byId: Map<string, GraphNode>;
  placeholderCount: number;
}

const norm = (p: string) => p.replace(/\\/g, '/');
const HERE = dirname(fileURLToPath(import.meta.url));

function walkAbsolute(dir: string, base: string, out: string[] = []): void {
  for (const entry of readdirSync(resolve(dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walkAbsolute(full, base, out);
    else if (/\.(js|ts|jsx|tsx)$/.test(entry.name)) out.push(norm(full));
  }
}

/** Parse + resolve one repo directory into a Graph. Endpoint ids are repo-relative. */
export async function loadRealRepo(repoDir: string, label: string): Promise<Graph> {
  const absRoot = resolve(repoDir);
  const absolutes: string[] = [];
  walkAbsolute(absRoot, absRoot, absolutes);
  const relPaths = absolutes.map((a) => norm(relative(absRoot, a)));

  const parser = new TypeScriptCompilerParser();
  const resolver = new RepositoryResolver();
  const parseResults = relPaths.map((rp, i) => parser.parse(rp, readFileSync(absolutes[i], 'utf8')));
  const resolved = resolver.resolve(parseResults);

  const byId = new Map<string, GraphNode>();
  const add = (n: GraphNode) => {
    if (!byId.has(n.id)) byId.set(n.id, n);
  };

  add({ id: `repo:${label}`, type: 'RepositorySnapshot', name: label, props: { commit: 'pinned' } });

  for (const pr of parseResults) {
    const f: File = pr.file;
    add({
      id: f.path,
      type: 'File',
      name: f.path,
      isTest: f.isTest,
      filePath: f.path,
      props: { language: f.language, bytes: f.size, hash: f.hash },
    });

    for (const s of pr.symbols as Symbol[]) {
      add({
        id: s.symbolId,
        type: 'Symbol',
        name: s.name,
        kind: s.kind,
        filePath: f.path,
        startLine: s.startLine,
        endLine: s.endLine,
        isExported: s.isExported,
        props: { complexity: s.complexity ?? null },
      });
    }
    for (const t of pr.tests as Test[]) {
      add({
        id: t.testId,
        type: 'Test',
        name: t.testName,
        filePath: f.path,
        startLine: t.startLine ?? 0,
        props: { framework: t.testFramework },
      });
    }
    for (const m of pr.todoMarkers as TodoMarker[]) {
      add({
        id: m.markerId,
        type: 'TodoMarker',
        name: m.text.slice(0, 40),
        filePath: f.path,
        startLine: m.line,
        props: { markerType: m.markerType },
      });
    }
  }

  const rels: GraphRel[] = [];
  for (const r of resolved.relationships) {
    const g: GraphRel = {
      from: r.fromId,
      to: r.toId,
      type: r.type,
      callSiteLine: (r as { callSiteLine?: number }).callSiteLine,
      props: { confidence: (r as { confidence?: string }).confidence ?? null },
    };
    rels.push(g);
    // FK safety: register any referenced endpoint we have not seen (external
    // imports, resolver misses). These become placeholder nodes, counted.
    for (const end of [g.from, g.to]) {
      if (!byId.has(end)) {
        byId.set(end, {
          id: end,
          type: /\.(ts|js|jsx|tsx)$/.test(end) ? 'File' : 'Symbol',
          name: end,
          filePath: norm(end),
          props: { placeholder: true },
        } as GraphNode);
      }
    }
  }

  const placeholderCount = [...byId.values()].filter((n) => n.props.placeholder).length;
  return { label, kind: 'real', nodes: [...byId.values()], rels, byId, placeholderCount };
}

/**
 * Synthetic scaling of a real template's topology. Clone ids are remapped under
 * a prefix so the full structure replicates S times with no id collisions and
 * per-clone degree distribution preserved. ~2% of edges cross clones so the
 * stress graph is not disconnected. Clearly synthetic.
 */
export function synthesize(template: Graph, scale: number, seed = 1): Graph {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;

  const remap = new Map<string, string>();
  const nodes: GraphNode[] = [];
  const rels: GraphRel[] = [];

  for (let c = 0; c < scale; c++) {
    for (const n of template.nodes) {
      if (n.type === 'RepositorySnapshot') continue;
      remap.set(`${n.id}:${c}`, `S${c}:${n.id}`);
    }
  }
  for (let c = 0; c < scale; c++) {
    for (const n of template.nodes) {
      if (n.type === 'RepositorySnapshot') continue;
      nodes.push({ ...n, id: remap.get(`${n.id}:${c}`)!, props: { ...n.props, synthetic: true } });
    }
    for (const r of template.rels) {
      const cross = rnd() < 0.02;
      const other = cross ? Math.floor(rnd() * scale) : c;
      const from = remap.get(`${r.from}:${other}`);
      const to = remap.get(`${r.to}:${c}`);
      if (!from || !to) continue;
      rels.push({ ...r, from, to });
    }
  }

  return {
    label: `synthetic(${template.label}×${scale})`,
    kind: 'synthetic',
    nodes,
    rels,
    byId: new Map(nodes.map((n) => [n.id, n])),
    placeholderCount: 0,
  };
}

/** Self-check: parse+resolve commander.js, assert basic invariants. */
export async function selfCheck(): Promise<void> {
  const g = await loadRealRepo(resolve(HERE, '../../benchmarks/commander.js'), 'commander.js');
  const syms = g.nodes.filter((n) => n.type === 'Symbol').length;
  const files = g.nodes.filter((n) => n.type === 'File' && !n.props.placeholder).length;
  const calls = g.rels.filter((r) => r.type === 'CALLS').length;
  const orphans = g.rels.filter((r) => !g.byId.has(r.from) || !g.byId.has(r.to)).length;
  if (syms < 300) throw new Error(`expected ≥300 symbols, got ${syms}`);
  if (files < 50) throw new Error(`expected ≥50 files, got ${files}`);
  if (calls < 200) throw new Error(`expected ≥200 CALLS, got ${calls}`);
  if (orphans !== 0) throw new Error(`expected 0 orphan endpoints, got ${orphans}`);
  if (g.placeholderCount > 100) throw new Error(`too many placeholders: ${g.placeholderCount}`);
  console.log(`selfCheck OK: ${files} files, ${syms} symbols, ${calls} CALLS, ${g.rels.length} rels, ${g.placeholderCount} placeholders`);
}