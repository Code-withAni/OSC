# Code Analysis

## Objective

Build a complete structural representation of a repository without requiring the LLM to ingest the entire repository as one prompt.

## Analysis Philosophy

“Read the whole repository” means:

- inspect the complete file inventory
- classify files
- parse supported source files
- extract important code relationships
- analyze tests and documentation
- connect source entities to repository history and GitHub activity

It does not mean sending every line to an LLM at once.

## Stage 1 — File Discovery

Discover the complete repository tree.

Prefer to include:

- source files
- test files
- documentation
- configuration
- CI configuration
- package manifests

Usually exclude from deep analysis:

- `.git`
- dependency directories such as `node_modules`
- build output
- coverage output
- generated artifacts when safely identified
- binaries and very large media files

The exclusion rules must be configurable.

## Stage 2 — Language Detection

Determine supported languages from file extension and repository metadata.

MVP support:

- JavaScript
- TypeScript
- JSX/TSX as applicable

The architecture should allow additional languages later.

## Stage 3 — AST Parsing

Extract deterministic structural information such as:

- files
- imports
- exports
- functions
- methods
- classes
- interfaces/types
- parameters
- references
- calls where the parser can determine them reliably
- inheritance/implementation

Retain source locations where possible.

## Stage 4 — Test Discovery

Identify:

- test files
- test suites
- test cases
- mappings between tests and source when inferable

Avoid claiming test coverage that cannot be supported by evidence.

## Stage 5 — Documentation Analysis

Analyze:

- README
- CONTRIBUTING guidance
- docs
- architecture documentation
- examples

Documentation should become searchable and may also be linked to graph entities.

## Stage 6 — Common Code Model

Map language-specific parser output into a language-neutral internal representation.

This allows the graph and contribution engine to work independently of individual parsers.

## Stage 7 — Semantic Analysis

Use AI only after deterministic analysis.

Good AI tasks include:

- summarizing a component
- explaining a complex relationship
- interpreting an issue
- identifying likely contribution scope

Semantic claims must remain traceable to evidence.

## Stage 8 — Indexing

Create searchable representations for relevant source and documentation chunks.

A chunk should retain:

- repository
- commit SHA
- file path
- symbol context when available
- line range when available
- content hash

## Large Repository Strategy

For large repositories:

```text
Entire file tree
      ↓
Deterministic parsing
      ↓
Structured graph
      ↓
Hierarchical summaries
      ↓
Relevant retrieval
      ↓
LLM reasoning
```

Do not construct a giant prompt containing the full repository.

## Safety

Static analysis must not execute repository code.

Do not run package installation, build hooks, tests, or arbitrary scripts as part of the default ingestion pipeline.
