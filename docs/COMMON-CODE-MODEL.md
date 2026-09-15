# Common Code Model (MVP)

**Version:** 1.1  
**Status:** Phase 0 Definition  
**Last Updated:** 2026-09-13

---

## Purpose

The Common Code Model is a language-neutral intermediate representation for repository structure and code relationships.

It decouples:
- **Parsers** (language-specific AST extraction) from
- **Resolvers** (cross-file symbol linking) from
- **Storage** (graph database, indexes) from
- **Analysis** (contribution engine, queries)

---

## Architectural Layers

This document defines **Layer 1: Common Code Model** only.

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Correlation / Evidence                │
│  (Issue→Symbol, PR→File, PR→Issue)              │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────┐
│  Layer 2: GitHub Integration Model              │
│  (Issue, PullRequest, Commit, GitHub metadata)  │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────┐
│  Layer 1: Common Code Model (THIS DOCUMENT)     │
│  (RepositorySnapshot, File, Symbol, Test, Code  │
│   relationships)                                │
└─────────────────────────────────────────────────┘
```

**Layer 1** is purely about source code structure.  
**Layer 2** is GitHub-specific data.  
**Layer 3** connects the two layers for contribution discovery.

This separation ensures:
- Layer 1 can support any code hosting platform (GitHub, GitLab, Bitbucket)
- Layer 1 can work offline (analyze local repository without API access)

---

## Processing Pipeline

The Common Code Model distinguishes between **parsing** (file-level) and **resolution** (repository-level):

```
Source Files
     ↓
┌────────────────────────┐
│ Language Parser        │  Per-file, independent, parallel
│ (TypeScript/JS/etc)    │  Extracts file-level facts
└────────┬───────────────┘
         ↓
File-Level Parse Facts
├─ Symbols (with unresolved references)
├─ Import statements (specifiers only)
├─ Export statements
├─ Local call expressions (unresolved targets)
└─ TODO markers
         ↓
┌────────────────────────┐
│ Repository Resolver    │  Cross-file, whole-repo, sequential
│ (Symbol Linker)        │  Constructs cross-file relationships
└────────┬───────────────┘
         ↓
Resolved Relationships
├─ IMPORTS (file → file)
├─ EXPORTS (file → symbol)
├─ CALLS (symbol → symbol, resolved)
└─ TESTED_BY (symbol → test)
         ↓
   Graph Storage
```

### Why Separate Parsing from Resolution?

**Parsers produce file-level facts:**
- Can process files independently (parallelizable)
- No cross-file dependencies required
- Extract structural facts: symbols, import strings, call expressions
- Output: unresolved references (e.g., "this file imports './other'", "this function calls 'foo'")

**Resolvers construct cross-file relationships:**
- Requires all files parsed first (sequential after parsing)
- Resolves import specifiers to actual files (`'./other'` → `src/other.ts`)
- Links call expressions to target symbols (`foo()` → `Symbol{name: 'foo', file: 'utils.ts'}`)
- Detects test coverage (which tests call which symbols)
- Output: resolved relationships (CALLS, IMPORTS, TESTED_BY edges)

**Examples:**

File `src/index.ts`:
```typescript
import { helper } from './utils';
helper();
```

**Parser output (file-level):**
- Symbol: `index.ts` contains no functions
- Import: specifier `'./utils'`, imported names `['helper']`
- Call expression: identifier `'helper'`, line 2

**Resolver output (repository-level):**
- IMPORTS: `src/index.ts` → `src/utils.ts`
- CALLS: (none - no local function, call is in module scope)

File `src/utils.ts`:
```typescript
export function helper() { ... }
```

**Parser output:**
- Symbol: `helper`, kind `function`, line 1, name `'helper'`
- Export: symbol `'helper'`

**Resolver output:**
- EXPORTS: `src/utils.ts` → Symbol(helper)

---

## Derivation from MVP Requirements

### From 10 Core Questions (PHASE-0-EVALUATION.md)

| Question | Required Data |
|----------|---------------|
| Q1: Issue → Code | Layer 3 correlation (not in this model) |
| Q2: Find callers | CALLS relationship (resolved by resolver) |
| Q3: Tests covering function | TESTED_BY relationship (resolved by resolver) |
| Q4: Impact analysis | CALLS relationship (multi-hop) |
| Q5: PR conflicts | Layer 3 correlation |
| Q6: Test coverage gaps | Absence of TESTED_BY |
| Q7: Contribution candidates | All code relationships + TODO markers |
| Q8: Skill matching | Symbol.isExported (derived from EXPORTS relationship) |
| Q9: Evidence bundles | Provenance on all nodes/relationships |
| Q10: Confidence scoring | Evidence quality metadata |

### From CODE-ANALYSIS.md Stage 3 (Required Extraction)

Parser produces:
- ✅ files
- ✅ imports (unresolved specifiers)
- ✅ exports (symbol names)
- ✅ functions
- ✅ classes
- ✅ methods
- ✅ interfaces/types
- ✅ call expressions (unresolved targets)

Resolver produces:
- ✅ IMPORTS (file → file, resolved)
- ✅ EXPORTS (file → symbol)
- ✅ CALLS (symbol → symbol, resolved)
- ✅ TESTED_BY (symbol → test, inferred)

Deferred:
- ❌ parameters (not needed for MVP queries)
- ❌ inheritance/implementation (not needed for Q1-Q10)

---

## Symbol Representation Decision

**Question:** Base Symbol + specialized types OR single Symbol with discriminator?

**Decision: Single Symbol with discriminator**

**Rationale:**
1. Q1-Q10 queries don't depend on function vs method type distinction
2. Simpler serialization (one node type in graph)
3. Easier to extend (add kinds without new interfaces)
4. Parser contract is simpler (return Symbol[], not polymorphic list)
5. Graph queries filter by `kind` property instead

---

## Core Node Types

### RepositorySnapshot

Represents one analyzed version of a repository.

```typescript
interface RepositorySnapshot {
  repositoryId: string;      // Format: "owner/repo" or local path
  commitSha: string;         // Git commit SHA (or "local" for uncommitted)
  analyzedAt: string;        // ISO 8601 timestamp
  provenance: Provenance;
}
```

---

### File

Represents a source file, test file, or configuration file.

```typescript
interface File {
  path: string;              // Relative path from repo root
  language: Language;
  hash: string;              // Content hash (SHA-256) for change detection
  size: number;              // File size in bytes
  isTest: boolean;           // True if this is a test file
  isGenerated: boolean;      // True if file is build output
  provenance: Provenance;
}

type Language = 'javascript' | 'typescript' | 'unknown';
```

---

### Symbol

Represents a code entity: function, class, method, interface, constant, enum.

```typescript
interface Symbol {
  symbolId: string;          // Unique within repository snapshot
  name: string;              // Symbol name as it appears in code
  kind: SymbolKind;
  filePath: string;          // File containing this symbol
  startLine: number;         // 1-indexed line number
  endLine: number;           // 1-indexed line number
  signature?: string;        // Optional function/method signature
  complexity?: number;       // Optional cyclomatic complexity
  isExported: boolean;       // Derived from EXPORTS relationship
  provenance: Provenance;
}

type SymbolKind = 
  | 'function' | 'method' | 'class' | 'interface' | 'const' | 'enum';
```

**Important: Symbol.isExported**

`isExported` is **derived** from the presence of an EXPORTS relationship:
- **Authoritative:** `File --EXPORTS--> Symbol` relationship
- **Derived/Cached:** `Symbol.isExported = true` if EXPORTS relationship exists

Why both?
- EXPORTS relationship is ground truth (explicit in graph)
- isExported is denormalized for query convenience (avoid JOIN on every symbol query)

Resolver sets `isExported` when creating EXPORTS relationships.

---

### Test

Represents a test file or test case.

```typescript
interface Test {
  testId: string;
  testName: string;          // Test case name or test file name
  testFilePath: string;
  testFramework: TestFramework;
  startLine?: number;
  endLine?: number;
  provenance: Provenance;
}

type TestFramework = 'jest' | 'mocha' | 'vitest' | 'unknown';
```

---

### TodoMarker

Represents a TODO/FIXME/HACK comment.

```typescript
interface TodoMarker {
  markerId: string;
  text: string;              // Full comment text
  markerType: MarkerType;
  filePath: string;
  line: number;
  provenance: Provenance;
}

type MarkerType = 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'NOTE';
```

**Relationship:** TodoMarker is contained by File via CONTAINS relationship.

```
File --CONTAINS--> TodoMarker
```

No new relationship type needed. TODOs are file-level facts (extracted by parser).

---

## Core Relationship Types

### CONTAINS

Parent-child structural containment.

```typescript
interface ContainsRelationship {
  type: 'CONTAINS';
  fromId: string;            // RepositorySnapshot, Directory, or File
  toId: string;              // Directory, File, Symbol, Test, or TodoMarker
  provenance: Provenance;
}
```

**Examples:**
- `RepositorySnapshot --CONTAINS--> File`
- `File --CONTAINS--> Symbol`
- `File --CONTAINS--> Test`
- `File --CONTAINS--> TodoMarker`

---

### IMPORTS

File-level import dependency (resolved by resolver).

```typescript
interface ImportsRelationship {
  type: 'IMPORTS';
  fromId: string;            // File
  toId: string;              // File
  importSpecifier: string;   // Original specifier (e.g., "./utils", "lodash")
  importType: ImportType;
  provenance: Provenance;
}

type ImportType = 'relative' | 'package' | 'absolute';
```

**How resolved:**
- Parser extracts: `import { X } from './utils'` → specifier `'./utils'`
- Resolver maps: specifier `'./utils'` → actual file `src/utils.ts`
- Resolver creates: IMPORTS edge from `src/index.ts` to `src/utils.ts`

---

### EXPORTS

Symbol exported from a file (public API).

```typescript
interface ExportsRelationship {
  type: 'EXPORTS';
  fromId: string;            // File
  toId: string;              // Symbol
  exportType: ExportType;
  provenance: Provenance;
}

type ExportType = 'named' | 'default';
```

**Authoritative representation of public API.**

When resolver creates EXPORTS edge, it also sets `Symbol.isExported = true` (denormalized for query convenience).

---

### CALLS

Function/method invocation relationship (resolved by resolver).

```typescript
interface CallsRelationship {
  type: 'CALLS';
  fromId: string;            // Symbol (function or method)
  toId: string;              // Symbol (function or method)
  callType: CallType;
  confidence: Confidence;
  callSiteLine: number;
  provenance: Provenance;
}

type CallType = 'direct' | 'method' | 'callback' | 'dynamic';
type Confidence = 'high' | 'medium' | 'low';
```

**How resolved:**
- Parser extracts: function `foo()` calls identifier `'bar'` at line 10
- Resolver searches: symbols named `'bar'` in scope (same file, imported files)
- Resolver creates: CALLS edge from Symbol(foo) to Symbol(bar) with confidence
- Confidence depends on resolution certainty (direct call = high, dynamic = low)

**Critical for:** Q2 (find callers), Q4 (impact analysis)

**Validation target:** ≥85% call graph accuracy (measured in Blocker 2a, not assumed)

---

### TESTED_BY

Symbol is tested by a test (inferred by resolver).

```typescript
interface TestedByRelationship {
  type: 'TESTED_BY';
  fromId: string;            // Symbol
  toId: string;              // Test
  coverageType: CoverageType;
  confidence: Confidence;
  provenance: Provenance;
}

type CoverageType = 'direct' | 'indirect';
```

**How resolved:**
- Resolver examines: which tests CALL which symbols
- Direct coverage: Test calls Symbol directly
- Indirect coverage: Test calls Function A, Function A calls Symbol (1-2 hops)
- Resolver creates: TESTED_BY edge with coverage type

**Critical for:** Q3 (find tests), Q6 (coverage gaps)

---

## Provenance

All nodes and relationships include provenance.

```typescript
interface Provenance {
  commitSha: string;
  extractedAt: string;       // ISO 8601 timestamp
  extractedBy: string;       // Parser/resolver ID + version
  sourceFile?: string;       // For relationships: which file analyzed
  sourceLine?: number;       // For relationships: line in source
}
```

---

## What Is Intentionally NOT Represented

### Type System Details
**Omitted:** Generics, type inference, union types, type guards  
**Why:** Type resolution requires full semantic analysis (slow, complex)  
**Impact:** Call graph may miss type-based dispatch  
**Validation Target:** ≥85% call graph accuracy (to be measured in Blocker 2a)  
**Mitigation:** Name matching + semantic retrieval compensates

### Full Function Signatures
**Omitted:** Complete parameter types, return types, generics  
**Impact:** Cannot query "functions returning Promise<User>"  
**Acceptable for MVP:** Name + location sufficient

### Class Hierarchy
**Omitted:** `extends`, `implements`  
**Impact:** Cannot answer "what overrides this method?"  
**Acceptable for MVP:** Not needed for Q1-Q10

### Comments (except TODO markers)
**Omitted:** JSDoc, inline comments  
**Impact:** May miss documentation quality opportunities  
**Acceptable for MVP:** README + docs analyzed separately

---

## Information Loss Summary

| Aspect | Loss | Impact | Mitigation |
|--------|------|--------|------------|
| Dynamic calls | Low confidence or missing | Q2 (callers) may miss some | Mark low confidence |
| Indirect tests | Heuristic detection | Q3 (tests) has false +/- | Mark as 'indirect' |
| Type-based dispatch | May miss method calls | Q2, Q4 incomplete | Target ≥85% (validate in Blocker 2a) |
| Full signatures | May be absent | Q8 less precise | Name + location sufficient |
| Class hierarchy | No inheritance | Cannot query subclasses | Not needed for MVP |
| Import symbols | File-level only | Cannot detect unused imports | Not a priority |

---

## Parser and Resolver Contracts

### Parser Contract

```typescript
interface Parser {
  id: string;                // Parser ID + version

  /**
   * Parse a single file and extract file-level facts.
   * Does NOT resolve cross-file references.
   */
  parse(filePath: string, content: string): FileParseResult;
}

interface FileParseResult {
  file: File;
  symbols: Symbol[];         // isExported not set yet (resolver's job)
  tests: Test[];
  todoMarkers: TodoMarker[];
  
  // Unresolved facts (raw AST extraction)
  importStatements: ImportStatement[];
  exportStatements: ExportStatement[];
  callExpressions: CallExpression[];
  
  errors: ParseError[];
}

interface ImportStatement {
  specifier: string;         // e.g., './utils', 'lodash'
  importedNames: string[];   // e.g., ['helper', 'foo']
  line: number;
}

interface ExportStatement {
  symbolName: string;
  exportType: 'named' | 'default';
  line: number;
}

interface CallExpression {
  callerSymbolId?: string;   // Symbol making the call (if inside function)
  calledName: string;        // Identifier being called (e.g., 'foo', 'obj.bar')
  callType: CallType;
  line: number;
}

interface ParseError {
  file: string;
  line?: number;
  message: string;
  fatal: boolean;
}
```

**Parser responsibilities:**
- Extract symbols (functions, classes, methods, interfaces)
- Extract import/export statements (as strings)
- Extract call expressions (unresolved identifiers)
- Extract TODO markers
- Detect test files and test cases
- Handle parse errors gracefully

**Parser does NOT:**
- Resolve import specifiers to files
- Resolve call targets to symbols
- Construct CALLS, IMPORTS, EXPORTS relationships
- Infer test coverage

---

### Resolver Contract

```typescript
interface Resolver {
  /**
   * Resolve cross-file relationships from parsed files.
   * Must be called after all files are parsed.
   */
  resolve(parseResults: FileParseResult[]): ResolverResult;
}

interface ResolverResult {
  relationships: Relationship[];
  errors: ResolverError[];
}

interface ResolverError {
  type: 'unresolved_import' | 'unresolved_call' | 'ambiguous_symbol';
  file: string;
  line?: number;
  message: string;
}
```

**Resolver responsibilities:**
- Resolve import specifiers to actual files (IMPORTS relationships)
- Match export statements to symbols (EXPORTS relationships, set Symbol.isExported)
- Resolve call expressions to target symbols (CALLS relationships)
- Infer test coverage (TESTED_BY relationships)
- Handle unresolved references gracefully (mark low confidence or skip)

**Resolution strategy:**
1. Build symbol table (all symbols from all files, indexed by name + file)
2. For each import: resolve specifier to file path (handle relative/absolute/package)
3. For each export: create EXPORTS relationship, set Symbol.isExported = true
4. For each call expression: search symbol table for target (same file → imported files → confidence)
5. For tests: traverse CALLS from test symbols, create TESTED_BY relationships

---

## Extension Strategy (Future Languages)

When adding Python, Go, etc.:

1. Implement language-specific Parser (same contract)
2. Use same Resolver (language-agnostic symbol resolution)
3. Map to existing Symbol kinds where possible
4. Add language-specific properties only if critical for queries

---

## Validation Criteria

Model is sufficient for MVP if:
- ✅ Parser contract is simple (single file in, facts out)
- ✅ Resolver contract is clear (all files in, relationships out)
- ✅ All relationships in KNOWLEDGE-GRAPH.md represented
- ✅ All Q1-Q10 queries answerable
- ✅ Provenance traceable on all nodes/relationships
- ✅ Lossy aspects documented (≥85% call accuracy target for Blocker 2a validation)
- ✅ Can extend to Python/Go without redesign

---

## Out of Scope

- **GitHub Integration Model** (Layer 2) - separate document
- **Correlation/Evidence Layer** (Layer 3) - separate document
- **Storage Schema** - Blocker 4
- **Query Patterns** - Blocker 4
- **Parser Implementation** - Blocker 2a
- **Resolver Implementation** - Blocker 2a

---

## Next Steps

After approval:
1. Implement `prototypes/common-model.ts`
2. Select benchmark repositories
3. Proceed to Blocker 2a (Parser + Resolver benchmark)
