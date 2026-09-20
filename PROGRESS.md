# Implementation Progress Report

**Date:** 2026-09-14
**Session:** AST Parser Comparison (TypeScript Compiler API vs Babel)

## Summary

Completed real AST parser benchmark comparing TypeScript Compiler API and Babel against ground-truth gold standards, per Phase 0 evaluation requirements.

## Completed Tasks

### AST Parser Comparison (Phase 0 Requirement) ✓

**Created:**
- `prototypes/parser-comparison/typescript-compiler-api/parser.ts` - TS Compiler API parser (typescript@5.9.3)
- `prototypes/parser-comparison/babel/parser.ts` - Babel parser (@babel/parser + @babel/traverse)
- `prototypes/parser-comparison/benchmark/run-comparison.mts` - Full benchmark runner
- `prototypes/parser-comparison/benchmark/validate-accuracy.mts` - Ground-truth accuracy validation
- `prototypes/parser-comparison/benchmark/gold-commander-argument.json` - Gold standard
- `prototypes/parser-comparison/benchmark/gold-datefns-format.json` - Gold standard
- `prototypes/parser-comparison/results.md` - Full comparison results and recommendation

## Accuracy Results (Ground Truth)

### commander.js/lib/argument.js
Both parsers: **100% precision, 100% recall** on symbols (10/10), methods (8/8), imports (1/1), exports (2/2).

### date-fns/pkgs/core/src/format/index.ts
Both parsers:
- Symbols: R=100% (3/3 gold matched), P=38% (8 extracted — 5 regex-literal const false positives)
- Imports: P=100% R=100% (8/8)
- Exports: R=100% (5/5), P=83% (one type-only export false positive: FormatDateOptions)

## Performance Results

### commander.js (159 files)
| Metric | TS Compiler API | Babel |
|--------|-----------------|-------|
| Parse Time | 688 ms (4.3 ms/file) | 1001 ms (6.3 ms/file) |
| Memory | 8.0 MB | 13.0 MB |
| Symbols | 513 | 517 |
| Methods | 333 | 333 |
| Errors | 0 | 0 |

### date-fns (1624 files)
| Metric | TS Compiler API | Babel |
|--------|-----------------|-------|
| Parse Time | 4380 ms (2.7 ms/file) | 5579 ms (3.4 ms/file) |
| Memory | 10.4 MB | 19.7 MB |
| Symbols | 4263 | 4234 |
| Errors | 0 | 0 |

**Note:** Method counts now match exactly (333/333) after fixing Babel's handling of `TSDeclareMethod` in `.d.ts` files.

## Recommendation (from results.md)

**TypeScript Compiler API** — better scaling on large codebases, lower memory, official standard, identical accuracy to Babel on gold standards.

## Known Gaps (documented, not blocking)
1. Regex-literal const declarations extracted as symbols (precision, not recall)
2. Type-only exports (e.g. `FormatDateOptions`) over-reported

## Regex Baseline

**⚠️ BASELINE / NON-AST / NOT SUFFICIENT FOR PARSER DECISION**

Earlier regex parser results (132 symbols on commander.js, 1478 on date-fns, 0 methods, 0 call sites) remain in this report only as baseline reference.

## Next Steps (blocked on review)

1. **Awaiting review** of parser comparison results before resolver implementation
2. Implement resolver - cross-file relationship resolution
3. Test on Phase 0 questions Q1-Q10
4. Make infrastructure decisions based on measured query patterns

---
**Status:** AST parser comparison complete, awaiting review
**Blocked:** Resolver implementation (per instruction: wait for review)

---

# Phase 1 — Repository Ingestion

**Date:** 2026-09-15
**Session:** Milestone 1 — Repository URL → Snapshot + Analysis Job

## Summary

A valid public GitHub URL now produces a reproducible repository snapshot
identity and an analysis job in PostgreSQL. Source retrieval, file discovery
and classification remain out of scope (Milestones 2–5).

## Completed Tasks

### Milestone 1 ✓

**Created:**
- `src/ingest/repository-url.ts` — deterministic GitHub URL parser (trust boundary)
- `src/ingest/errors.ts` — structured error types
- `src/ingest/github-client.ts` — metadata-only GitHub REST client
- `src/ingest/ingestion-service.ts` — orchestrator
- `src/storage/schema.ts` — PostgreSQL DDL
- `src/storage/types.ts` — record types + `RepositoryStore` interface
- `src/storage/repository-store.ts` — `PostgresRepositoryStore`
- `src/storage/postgres.ts` — pool + schema application
- `src/testing/postgres-harness.ts` — embedded PostgreSQL 18.4 test harness
- `tsconfig.src.json` — application-only TypeScript config

## Design Notes / Deliberate Deferrals

1. **`repository_files` deferred.** The database requirements list
   RepositoryFile as a minimum table, but Milestone 1 explicitly forbids
   speculative tables and no file data exists until Milestones 3–4. It will be
   introduced when file discovery produces rows — not before.
2. **Full job-status domain in the CHECK constraint.** The eight documented
   ingestion states (QUEUED … FAILED) are enforced from the start so Milestone 5
   does not require a schema migration. Milestone 1 only ever writes `QUEUED`.
3. **Separate `tsconfig.src.json`.** The Phase 0 root `tsconfig.json` includes
   the vendored benchmark clones and does not type-check clean (pre-existing:
   4281 errors across `benchmarks/**`). The root config is left untouched;
   application code type-checks clean under its own config.
4. **Scoped test glob.** `npm test` targets `dist/ingest` and `dist/storage`
   explicitly. A `dist/**/*.test.js` glob picks up vendored fixture tests that
   the Phase 0 config compiles into the same `dist/` tree.
5. **`dist/` is shared with Phase 0 output.** Build artifacts only; `dist/` is
   gitignored.

## Verification

- Integration + unit: 63 tests, 63 pass, 0 fail.
- Type check: clean (`tsc -p tsconfig.src.json --noEmit`).
- End-to-end against the live GitHub API and real PostgreSQL 18.4: ingesting
  `octocat/Hello-World` twice yields one repository, one snapshot and one job
  (commit `7fd1a60b01f91b314f59955a4e4d4e80d8edf11d`).

---

# Phase 1 — Milestone 2 — Safe Repository Source Retrieval

**Date:** 2026-09-16

## Summary

Given a RepositorySnapshot, the system can now safely materialize the
repository source at the exact recorded commit without executing any repository
code. Source retrieval is a git clone of the exact commit SHA into an isolated
temporary workspace; the job transitions QUEUED → FETCHING → RETRIEVING (or
FAILED).

## Completed Tasks

**Created:**
- `src/ingest/source-retrieval.ts` — `GitHubSourceRetriever` (clones, checks out
  the exact commit, enforces a size limit, never executes repository code)
- `src/ingest/source-retrieval.test.ts` — integration tests

**Modified:**
- `src/ingest/ingestion-service.ts` — optional `retrieveSource` flag + injected
  `SourceRetriever`; advances the job through FETCHING/RETRIEVING, returns
  `sourcePath`
- `src/storage/types.ts` — added `updateJob` to `RepositoryStore`
- `src/storage/repository-store.ts` — `updateJob` implementation
- `src/ingest/ingestion-service.test.ts` — covered source retrieval + FAILED path
- `src/storage/repository-store.test.ts` — covered `updateJob`

## Design Notes / Deliberate Deferrals

1. **`retrieveSource` is opt-in.** Milestone 1 behaviour (URL → job only) is
   unchanged by default. Callers turn on source retrieval explicitly.
2. **Network git clone** is used rather than a GitHub tarball snapshot. This
   guarantees the source corresponds to the exact commit and needs no API bytes
   for large repositories. Cheap for this milestone: a shallow clone keeps the
   transfer small.
3. **No job queue / worker yet.** Retrieval runs inline at submit time. A
   background worker (FETCHING status exists for it) is a later Phase — the
   status machine already supports it.
4. **Size limit is checked after clone.** Git has no pre-transfer size
   enforcement; the retriever deletes the workspace if it exceeds
   `maxSizeBytes` (default 100 MB).
5. **Source is left on disk** for the downstream stages and must be cleaned up
   by the caller. Failure always removes the workspace directory.

## Verification

- Integration + unit: 69 tests, 69 pass, 0 fail.
- Type check: clean (`tsc -p tsconfig.src.json --noEmit`).
- End-to-end against live GitHub + real PostgreSQL 18.4 + real git: ingesting
  `octocat/Hello-World` produced a `RETRIEVING` job, a real source directory on
  disk, and a `sourcePath`; a repeat submission reused the in-flight job without
  refetching; exactly one repository, snapshot and active job in PostgreSQL.

**Status:** Milestone 2 complete.

---

# Phase 1 — Milestone 3 — File Discovery

**Date:** 2026-09-16

## Summary

Given a retrieved source tree, the system now walks it and records each entry
(relative path, file/directory type, size, content hash, detected language) in
a `repository_files` table keyed to its snapshot. The job transitions
DISCOVERING → CLASSIFYING (or FAILED). Files are never executed; the walker
only reads them.

## Completed Tasks

**Created:**
- `src/ingest/file-discoverer.ts` — `RepositoryFileDiscoverer` + `FileDiscoverer`
  interface (iterative directory walk, exclusion set, sha256 content hashing,
  extension-based language detection)
- `src/ingest/file-discoverer.test.ts` — unit tests for walking, exclusions,
  language detection and hashing

**Modified:**
- `src/storage/schema.ts` — `repository_files` table
  (snapshot FK, `(snapshot_id, path)` unique, type CHECK)
- `src/storage/types.ts` — `RepositoryFileRecord`, `FileDiscoveryResult`,
  `RepositoryFileType`; `replaceFilesForSnapshot` + `countSnapshotFiles` on
  `RepositoryStore`
- `src/storage/repository-store.ts` — `PostgresRepositoryStore` implementations
  (batch `unnest` insert inside a transaction)
- `src/ingest/ingestion-service.ts` — optional `discoverFiles` flag + injected
  `FileDiscoverer`; advances the job DISCOVERING → CLASSIFYING, returns
  `fileCount`

## Design Notes / Deliberate Deferrals

1. **Hashing is size-capped (1 MB).** Files above 1 MB get a blank hash to
   avoid streaming large blobs into the ingest path; `scaleBytes`-style reuse
   detection is a later concern. (`MAX_HASH_BYTES`)
2. **Exclusions are opt-out by name.** `.git`, `node_modules`, `bower_components`,
   `vendor`, `dist`, `build`, `out`, `.next`, `.output` and `coverage` are
   skipped; the constructor accepts an override for other repos.
3. **Discovery is scoped to the invoking job.** A reused in-flight job (already
   past QUEUED, no source known to this invocation) is never re-discovered;
   only the invocation that materialized `sourcePath` advances it.
4. **File classification is still out of scope (Milestone 4).** Discovery
   records type/size/hash/language; binary-vs-text and analysis-worthiness are
   not yet decided.

## Verification

- Integration + unit: 79 tests, 79 pass, 0 fail.
- Type check: clean (`tsc -p tsconfig.src.json --noEmit`).
- End-to-end against live GitHub + real PostgreSQL 18.4 + real git: ingesting
  `octocat/Hello-World` reached `CLASSIFYING`, persisted its file listing to
  `repository_files`, and excluded `.git`/`node_modules` entries.

**Status:** Milestone 3 complete. Awaiting approval before Milestone 4 — File Classification.

---

# Phase 1 — Milestone 4 — File Classification

**Date:** 2026-09-16

## Summary

Each discovered file is now classified as analyzable or not. A file is
analyzable iff it is a regular file, is not binary, and its detected language
is a supported analysis language (currently JavaScript and TypeScript). The
classifier is pure and deterministic — no I/O, no dependencies — so it is
directly unit-testable. The job reaches `CLASSIFYING` once files are persisted.

## Completed Tasks

**Created:**
- `src/ingest/file-classifier.ts` — `classifyFiles` (pure mapping to `analyzable`)
  and `countAnalyzable` (deterministic count helper)
- `src/ingest/file-classifier.test.ts` — unit tests for JS/TS inclusion,
  non-JS/TS and directory exclusion, and binary exclusion

**Modified:**
- `src/ingest/file-discoverer.ts` — records `isBinary` (NUL-byte scan of the
  first 512 bytes)
- `src/storage/schema.ts` — `repository_files` gains `is_binary` and `analyzable`
  columns (idempotent `DO`-block migration; `binary` is a PG reserved word)
- `src/storage/types.ts` — `RepositoryFileRecord.isBinary` (renamed from
  `binary`) + `analyzable`
- `src/storage/repository-store.ts` — `replaceFilesForSnapshot` persists the
  new columns via 8-column `unnest` batch insert
- `src/ingest/ingestion-service.ts` — classifies discovered files before
  persisting them and returns `analyzedFileCount`

## Design Notes / Deliberate Deferrals

1. **Binary detection is a NUL-byte heuristic on the first 512 bytes.** This is
   the classic, cheap binary test and avoids reading whole files. Premium
   MIME sniffing is not warranted for an ingest tag.
2. **`is_binary` column name.** PostgreSQL reserves `binary`, so the column is
   `is_binary` (TS field `isBinary`).
3. **Analyzable gate is language-list based.** Only `javascript` and
   `typescript` count today, per the MVP scope. Other language labels are
   recorded but excluded until those languages are implemented.
4. **Classification precedes the analysis stages.** AST parsing (Milestone 5+)
   consumes only `analyzable = true` rows.

## Verification

- Integration + unit: 84 tests, 84 pass, 0 fail (storage 13 + ingest suites).
- Type check: clean (`tsc -p tsconfig.src.json --noEmit`).
- End-to-end against live GitHub + real PostgreSQL 18.4 + real git: ingesting
  `octocat/Hello-World` reached `CLASSIFYING`, persisted its file listing with
  binary/analyzable flags, and reported `analyzedFileCount`.

**Status:** Milestone 4 complete. Awaiting approval before Milestone 5 — Ingestion Completion + Snapshot Manifest.

---

# Phase 1 — Milestone 5 — Ingestion Completion + Snapshot Manifest

**Date:** 2026-09-16

## Summary

Ingestion now completes cleanly: after source retrieval (if enabled) and file
discovery/classification, the job transitions to a terminal status — either
`COMPLETED` (at least one analysable JavaScript/TypeScript file) or
`COMPLETED_WITH_WARNINGS` (no analysable source). The result is a
`SnapshotManifest` that reports:

- repository & snapshot identity
- job outcome (including reuse flags)
- optional source path (if retrieval was enabled)
- file count and total size of the discovered tree
- language breakdown (extension-based detection, Stage 2)
- any non-fatal warnings (e.g., “no analysable JavaScript or TypeScript files”)

The manifest gives the caller a first-class, reproducible summary of what was
ingested, while keeping the source directory on disk for downstream phases
(static analysis, graph building, etc.) to consume.

## Completed Tasks

**Created:**
- `src/ingest/file-classifier.ts` — added `countByLanguage` helper (pure,
  deterministic tally of files by detected language)
- `src/ingest/file-classifier.test.ts` — unit tests for the new helper

**Modified:**
- `src/ingest/ingestion-service.ts` — renamed result type to `SnapshotManifest`;
  after classification: compute `totalSizeBytes` + language breakdown, complete
  the job (`COMPLETED` if `analyzedFileCount > 0`, else `COMPLETED_WITH_WARNINGS`),
  return the manifest with the new fields
- `src/ingest/ingestion-service.test.ts` — updated existing tests to assert the
  new manifest shape and the terminal job status; added a test for the warning
  path (no analysable JS/TS files)

## Design Notes / Deliberate Deferrals

1. **Job completion is deterministic.** No further stages are implied by
   Milestone 5; downstream phases (static analysis, graph construction) are
   separate concerns wired by a worker or CLI that calls the service and then
   acts on the manifest.
2. **Source directory retention.** The retrieved source is *not* automatically
   removed — callers clean it up after they are finished with it (e.g., after
   static analysis). Keeps Milestone 5 free of opinionated lifecycle policy.
3. **Manifest fields are optional.** Each appears only when the corresponding
   feature flag is true (`retrieveSource`, `discoverFiles`), preserving
   Milestone 1–2 behaviour for callers that only want a repository + job.
4. **Language detection stays extension-based (Stage 2).** The manifest’s
   `languages` map reports what the discoverer already recorded; actual AST
   parsing and symbol extraction belong to Phase 2.

## Verification

- Integration + unit: 87 tests, 87 pass, 0 fail (storage 13 + ingest 74).
- Type check: clean (`tsc -p tsconfig.src.json --noEmit`).
- End-to-end against live GitHub + real PostgreSQL 18.4 + real git: ingesting
  `octocat/Hello-World` produced a `SnapshotManifest` with
  `job.status: COMPLETED_WITH_WARNINGS`, `fileCount: 1`, `analyzedFileCount: 0`,
  and the warning “no analysable JavaScript or TypeScript files”, confirming the
  warning path end to end (the happy path is covered by the unit suite).

**Status:** Milestone 5 complete. Awaiting approval before Milestone 6 — Static Analysis (AST Parsing + Symbol Extraction).
