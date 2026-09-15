# Knowledge Graph

## Purpose

The knowledge graph is the structural representation of the software repository.

It should capture code structure, relationships, tests, documentation, and GitHub activity so the system can reason about a repository as a connected system instead of a collection of text files.

## Design Principle

The graph should represent facts and relationships that can be established by deterministic analysis or supported by explicit evidence.

AI-generated summaries may be attached as annotations, but they must not silently replace source-derived relationships.

## Core Node Types

### Repository

Suggested properties:

- repositoryId
- owner
- name
- defaultBranch
- languageSet
- commitSha
- analyzedAt

### Directory

Suggested properties:

- path
- name

### File

Suggested properties:

- path
- language
- size
- hash
- generated
- testFile

### Symbol

Common abstraction for source-level definitions.

Suggested properties:

- symbolId
- name
- kind
- filePath
- startLine
- endLine
- signature

### Function / Method / Class / Interface

These may be represented as specialized symbol kinds or concrete node types depending on implementation needs.

### Test

Represents a test file, test case, or testing symbol depending on parser granularity.

### Documentation

Represents README sections, docs pages, or documentation symbols/chunks.

### Issue

Suggested properties:

- githubId
- number
- title
- state
- labels
- url
- createdAt
- updatedAt

### PullRequest

Suggested properties:

- githubId
- number
- title
- state
- merged
- url
- createdAt
- updatedAt

### Commit

Suggested properties:

- sha
- message
- author
- timestamp

## Core Relationships

- `CONTAINS`
- `IMPORTS`
- `EXPORTS`
- `CALLS`
- `EXTENDS`
- `IMPLEMENTS`
- `USES`
- `DEPENDS_ON`
- `TESTED_BY`
- `DOCUMENTED_BY`
- `MODIFIED_BY`
- `INTRODUCED_BY`
- `RELATED_TO`
- `FIXES`
- `DUPLICATES`
- `MENTIONS`

## Example Graph

```text
Repository
  │
  └── CONTAINS → src/auth/auth.ts
                     │
                     └── CONTAINS → validateToken()
                                       │
                                       ├── CALLS → JWTService.verify()
                                       │
                                       └── TESTED_BY → auth.test.ts

Issue #431
  │
  └── RELATED_TO → validateToken()

PR #452
  │
  ├── MODIFIES → auth.ts
  └── FIXES → Issue #431
```

## Evidence and Provenance

Every graph fact that can be traced to a source should retain provenance metadata where practical:

- source file
- source line range
- parser/analyzer version
- repository commit SHA
- extraction timestamp

For GitHub entities, retain the GitHub identifier and URL.

## Semantic Annotations

The system may attach AI-generated metadata such as:

- component summary
- responsibility summary
- potential risk
- likely purpose

These annotations should be marked as inferred/AI-generated and linked to the evidence used to produce them.

## Graph Queries the MVP Should Support

1. Find functions related to an issue.
2. Find tests associated with a function or file.
3. Find callers and callees of a function.
4. Find files likely affected by a component change.
5. Find code areas with weak or missing tests.
6. Connect an issue or PR to relevant source files.
7. Build a compact neighborhood around a candidate contribution.

## Graph Boundaries

Do not attempt to model every possible concept on day one. Add node and relationship types when they support a concrete product query or recommendation capability.
