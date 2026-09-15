# Architecture

## High-Level Architecture

```text
                         GitHub
                           │
                           ▼
                  ┌─────────────────┐
                  │ Ingestion Layer │
                  └────────┬────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
          Repository      Issues        PRs
           metadata       /PR data    /commits
             │             │             │
             ▼             ▼             ▼
        Static Analyzer  GitHub Data  Activity Data
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                  ┌──────────────────┐
                  │ Common Code Model│
                  └────────┬─────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      Knowledge Graph              Code/Doc Index
             │                           │
             └─────────────┬─────────────┘
                           ▼
                  ┌─────────────────┐
                  │ Evidence/Query  │
                  │     Layer       │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │ Contribution    │
                  │    Engine       │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │ AI Reasoning    │
                  └────────┬────────┘
                           ▼
                       Frontend
```

## Architectural Responsibilities

### Ingestion Layer

Responsible for:

- validating repository input
- retrieving repository metadata
- obtaining repository source safely
- ingesting issues, PRs, and selected commit data
- creating analysis jobs

It should not contain contribution ranking logic.

### Static Analyzer

Responsible for deterministic source analysis:

- file discovery
- file classification
- language detection
- AST parsing
- symbols
- imports/exports
- call relationships
- inheritance/implementation
- test identification

### Common Code Model

This is the internal representation that decouples parsers from storage.

Example concepts:

```text
Repository
File
Symbol
Function
Class
Interface
Relationship
Test
Documentation
```

Language-specific parsers should map into this common model.

### Knowledge Graph

Stores structural and semantic relationships between repository entities.

It should answer relationship questions efficiently, for example:

- What calls this function?
- Which tests cover this component?
- Which files are likely affected by this change?
- Which issue is related to this component?

### Code/Document Index

Supports semantic retrieval of relevant source and documentation chunks.

The graph and index are complementary:

- graph = explicit structure and relationships
- index = semantic retrieval

### Contribution Engine

Generates, validates, scores, and ranks contribution candidates.

### AI Reasoning Layer

Consumes a compact evidence package built from graph traversal and semantic retrieval. It should not be given a huge repository dump by default.

## Processing Model

Repository analysis should be asynchronous.

```text
User request
    ↓
Create analysis job
    ↓
Worker processes repository
    ↓
Persist intermediate results
    ↓
Mark repository snapshot ready
    ↓
Frontend queries results
```

## Incremental Analysis

A future version should reprocess only affected files/symbols after repository changes.

The initial implementation may use full analysis for simplicity, but data structures should retain commit/snapshot identity so incremental processing can be introduced later.

## Reliability

Failures should be isolated by stage.

For example:

- a failed documentation parser should not invalidate the AST graph
- a GitHub API timeout should not corrupt source analysis
- an LLM failure should not erase deterministic analysis results

## Technology Direction

The first implementation should favor a modular TypeScript architecture. Specific graph, vector, queue, and database technologies should be selected based on the graph query model and measured workload rather than assumed up front.
