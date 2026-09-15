# Roadmap

## Phase 0 — Product and Architecture Foundation ✅

- [x] Define product problem
- [x] Define MVP scope
- [x] Define high-level architecture
- [x] Define initial graph model
- [x] Choose concrete infrastructure after validating graph queries
- [x] Create benchmark repositories and evaluation cases

> **Decisions:** `docs/ARCHITECTURE-DECISIONS.md` | ADRs: `decisions/001` through `decisions/004`

## Phase 1 — Repository Ingestion

- [ ] Accept public GitHub repository URL
- [ ] Validate repository
- [ ] Fetch repository metadata
- [ ] Create analysis job model
- [ ] Safely retrieve repository source
- [ ] Discover repository files
- [ ] Classify files
- [ ] Detect JavaScript/TypeScript
- [ ] Persist repository snapshot and commit SHA

## Phase 2 — Code Intelligence

- [ ] Add JavaScript/TypeScript AST parsing
- [ ] Extract symbols
- [ ] Extract imports/exports
- [ ] Extract call relationships where reliable
- [ ] Extract classes/interfaces
- [ ] Detect tests
- [ ] Build common code model

## Phase 3 — Knowledge Graph

- [ ] Implement repository graph schema
- [ ] Persist nodes
- [ ] Persist relationships
- [ ] Add provenance metadata
- [ ] Implement graph neighborhood queries
- [ ] Implement caller/callee queries
- [ ] Implement test relationship queries

## Phase 4 — Code and Documentation Retrieval

- [ ] Chunk source with symbol/file context
- [ ] Index documentation
- [ ] Add semantic retrieval
- [ ] Connect retrieval results to graph entities

## Phase 5 — GitHub Intelligence

- [ ] Ingest issues
- [ ] Ingest pull requests
- [ ] Ingest selected commit data
- [ ] Link GitHub entities to repository/code entities
- [ ] Detect obvious duplicate/active work conflicts

## Phase 6 — Contribution Engine

- [ ] Generate candidates
- [ ] Validate candidates
- [ ] Estimate difficulty
- [ ] Estimate effort
- [ ] Match contributor skills
- [ ] Rank candidates
- [ ] Produce evidence bundles

## Phase 7 — AI Reasoning

- [ ] Component summarization
- [ ] Issue explanation
- [ ] Contribution explanation
- [ ] Relevant-code retrieval before reasoning
- [ ] Evidence-aware response generation

## Phase 8 — Product UI

- [ ] Repository input screen
- [ ] Analysis status screen
- [ ] Repository overview
- [ ] Contribution opportunity list
- [ ] Skill/profile setup
- [ ] Contribution detail page
- [ ] Evidence presentation

## Phase 9 — Evaluation

- [ ] Build benchmark dataset
- [ ] Measure recommendation precision
- [ ] Measure relevant-file accuracy
- [ ] Measure evidence correctness
- [ ] Track hallucination/error rate
- [ ] Track latency and analysis cost

## Phase 10 — Future Enhancements

- [ ] Incremental re-analysis
- [ ] More programming languages
- [ ] Private repository support
- [ ] Maintainer workflow
- [ ] Optional GitHub issue creation
- [ ] PR assistance
- [ ] Patch/test suggestions

## Scope Rule

Do not skip ahead into autonomous coding or private repository support before the core contribution recommendation loop is proven useful and reliable.
