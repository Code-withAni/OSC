// Bootstrap node_modules for the REAL dependency closure only.
//
// npm is unusable in this environment: its cache assert an empty node_modules is
// "already installed" (npm ci/install all no-op), and package-lock.json was left
// polluted by the failed @huggingface/transformers install (~60 extra packages:
// sharp, onnxruntime, protobufjs, ...). Those are gone from package.json, so we
// compute the dependency closure from the 5 real devDependencies and download
// exactly that subtree straight from the registry.
//
//   node scripts/bootstrap-deps.js
//
// File layout (Windows-friendly; no /tmp):
//   .tmp-bootstrap/           scratch (tarballs, extracts)
//   node_modules/<pkg>        final install locations
//   node_modules/.bin/*       sh + cmd shims (from each package `bin`)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const lock = require('../package-lock.json');
// The Phase 0 sql-graph prototype lock resolved the Postgres client + embedded
// Postgres server closure. The app needs those at the root, and the root lock
// has no entries for them, so they are installed from this second source.
const pgLock = require('../prototypes/sql-graph/package-lock.json');

// Application lock wins for any name present in both.
const packages = { ...pgLock.packages, ...lock.packages };

// ── 1. Compute reachable closure from the real roots ────────────────────────
// `@embedded-postgres/<platform>` is an optionalDependency holding the actual
// Postgres binaries; it is not reachable via `dependencies`, so it is an
// explicit root for the host platform.
const embeddedPlatform = `@embedded-postgres/${
  process.platform === 'win32' ? 'windows' : process.platform
}-${process.arch}`;

const roots = [
  '@babel/parser',
  '@babel/traverse',
  '@types/babel__traverse',
  '@types/node',
  '@types/pg',
  'typescript',
  'pg',
  'embedded-postgres',
  embeddedPlatform,
];
const reach = new Set(roots);
const queue = [...roots];
while (queue.length) {
  const name = queue.shift();
  const entry = packages['node_modules/' + name];
  if (!entry) continue;
  for (const dep of Object.keys(entry.dependencies || {})) {
    if (!reach.has(dep)) { reach.add(dep); queue.push(dep); }
  }
}

// Keep only reachable entries that have a tarball URL.
// ponytail: nested-node_modules instances (version conflicts) are ignored —
// only onnxruntime-web nests one, and it is outside the reachable closure.
const targets = Object.entries(packages)
  .filter(([k, v]) => v && v.resolved && reach.has(k.replace(/^node_modules\//, '')))
  .map(([k, v]) => ({ key: k.replace(/^node_modules\//, ''), url: v.resolved }));

const excluded = Object.keys(lock.packages).filter(
  (k) => k.startsWith('node_modules/') && !reach.has(k.replace(/^node_modules\//, ''))
).length;
console.log(`need ${targets.length} packages, excluding ${excluded} transformers-tree packages`);

// ── 2. Download + extract each into node_modules ────────────────────────────
;(async () => {
const scratch = path.join(__dirname, '..', '.tmp-bootstrap');
const tars = path.join(scratch, 'tars');
const x = path.join(scratch, 'x');
fs.mkdirSync(tars, { recursive: true });
fs.mkdirSync(x, { recursive: true });
fs.rmSync(path.join(process.cwd(), 'node_modules', '.package-lock.json'), { force: true });

let failed = 0;
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  const target = path.join(process.cwd(), 'node_modules', t.key);
  if (fs.existsSync(path.join(target, 'package.json'))) {
    console.log(`[${i + 1}/${targets.length}] ok   ${t.key}`);
    continue;
  }
  const tgz = path.join(tars, `${i}.tgz`);
  try {
    console.log(`[${i + 1}/${targets.length}] dl   ${t.key} (${t.url})`);
    const res = await fetch(t.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
    // tar chokes on Windows D: paths — convert to MSYS-style (/d/OSC/...) for Git Bash.
    // --strip-components=1 drops the tarball's root dir (named 'package' on modern
    // npm, but historically variable on @types/*) and extracts into target directly.
    const toMsys = (p) => p.replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase()).replace(/\\/g, '/');
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true }); // tar -C needs the target dir to exist
    execSync(`tar -xzf "${toMsys(tgz)}" -C "${toMsys(target)}" --strip-components=1`);
  } catch (err) {
    // Keep going; report at the end. Some tarballs are garbage on corrupt locks.
    console.error(`[${i + 1}/${targets.length}] FAIL ${t.key}: ${err.message}`);
    failed++;
  }
}

// ── 3. .bin shims ───────────────────────────────────────────────────────────
const binDir = path.join(process.cwd(), 'node_modules', '.bin');
fs.mkdirSync(binDir, { recursive: true });
let made = 0;
for (const t of targets) {
  const entry = lock.packages['node_modules/' + t.key];
  if (!entry || !entry.bin) continue;
  const bins = typeof entry.bin === 'string' ? { [path.basename(t.key)]: entry.bin } : entry.bin;
  for (const [name, rel] of Object.entries(bins)) {
    const sh = `#!/bin/sh\nbasedir=$(dirname "$0")\nnode "$basedir/../${t.key}/${rel}" "$@"\n`;
    const cmd = `@ECHO off\r\nnode "%~dp0\\..\\${t.key}\\${rel.replace(/\//g, '\\')}" %*\r\n`;
    fs.writeFileSync(path.join(binDir, name), sh, { mode: 0o755 });
    fs.writeFileSync(path.join(binDir, name + '.cmd'), cmd);
    made++;
  }
}

const installed = fs.readdirSync(path.join(process.cwd(), 'node_modules'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '.bin').length;
if (failed) console.log(`\nDONE with ${failed} failures (above)`);
console.log(`\ninstalled ${installed} top-level packages, ${made} bin shims`);
// Load-test what matters:
try {
  require('../node_modules/@babel/parser'); console.log('@babel/parser: OK');
  require('../node_modules/@babel/traverse'); console.log('@babel/traverse: OK');
  require('../node_modules/typescript'); console.log('typescript: OK');
  require('../node_modules/pg'); console.log('pg: OK');
  // By package name, not by path: the package has only an `exports` map (no
  // `main`), so a path require would look for a non-existent index.js.
  const ep = require('embedded-postgres');
  console.log('embedded-postgres: OK', ep && ep.default ? '(esm default)' : '(cjs)');
} catch (err) {
  console.log('load test failed:', err.message);
}
process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });