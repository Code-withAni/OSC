# Open Source Contribution Intelligence

## Project Purpose

This project analyzes public GitHub repositories and helps developers discover meaningful open-source contribution opportunities.

The system builds a machine-readable understanding of a repository using static code analysis, a knowledge graph, code/document retrieval, GitHub issues and pull requests, and AI reasoning.

## Core Product Question

> Given a repository and a developer's skills, what meaningful contribution can they realistically make?

## Core Architecture Principle

The AI must not be expected to remember an entire repository.

Use this pipeline:

Repository → ingestion → static analysis → common code model → knowledge graph + code index → evidence retrieval → AI reasoning → contribution recommendations

## MVP Scope

The MVP should support:

- Public GitHub repositories
- JavaScript and TypeScript
- Repository structure analysis
- AST-based symbol and relationship extraction
- Knowledge graph construction
- GitHub issues, pull requests, and basic commit context
- Contribution candidate discovery
- Developer skill matching
- AI explanation of a selected contribution
- Evidence-backed recommendations

## Current Non-Goals

Do not implement yet:

- Private repositories
- Automatic issue creation
- Automatic pull-request creation
- Autonomous coding agents
- Execution of arbitrary repository code during static analysis
- Support for every programming language
- Fully autonomous bug discovery

## Engineering Principles

1. Prefer deterministic analysis over LLM guesses.
2. Treat every repository as untrusted input.
3. Never execute arbitrary repository code on the application server.
4. Every AI recommendation should provide evidence.
5. Keep ingestion, analysis, graph, retrieval, and reasoning modular.
6. Prefer incremental updates over full re-analysis when practical.
7. Use LLMs for semantic reasoning, not basic parsing tasks.
8. Avoid unnecessary dependencies and abstractions.
9. Write tests for core analysis and ranking logic.
10. Document significant architectural decisions in `decisions/`.

## Documentation Map

- Product definition: `docs/PRODUCT.md`
- System architecture: `docs/ARCHITECTURE.md`
- Knowledge graph: `docs/KNOWLEDGE-GRAPH.md`
- Code analysis: `docs/CODE-ANALYSIS.md`
- Contribution engine: `docs/CONTRIBUTION-ENGINE.md`
- Roadmap: `docs/ROADMAP.md`

## Development Workflow

Before implementing a feature:

1. Read this file.
2. Read the relevant document in `docs/`.
3. Inspect the existing implementation.
4. Identify the smallest coherent change.
5. Implement it.
6. Run targeted tests.
7. Update documentation if behavior or architecture changed.

## Repository Analysis Pipeline

GitHub repository
→ repository ingestion
→ file discovery/classification
→ language detection
→ AST parsing
→ common code model
→ knowledge graph
→ code/document index
→ GitHub issue/PR correlation
→ contribution candidate generation
→ evidence validation
→ ranking/personalization
→ AI explanation

## Evidence Requirement

Do not present an AI hypothesis as fact.

A recommendation should cite or expose evidence such as:

- file path
- symbol name
- line range when available
- graph relationships
- issue or PR identifiers
- test coverage observations
- recent repository activity

## Repository Safety

Static analysis must not execute repository code.

Potentially dangerous operations include package installation, build scripts, post-install scripts, and arbitrary shell commands contained in repositories.

If code execution is ever introduced, it must happen in a hardened, isolated sandbox with no application secrets and strict resource limits.

## Coding Expectations

Prefer:

- TypeScript
- strong typing
- small modules
- explicit interfaces
- clear error handling
- deterministic services
- testable code

Avoid:

- giant files
- hidden global state
- broad try/catch blocks that hide failures
- duplicate business rules
- unnecessary LLM calls
- architecture changes without documentation

## Scope Control

Do not build the entire product in one step.

Implement one roadmap phase at a time. Do not introduce features from later phases unless they are necessary foundations for the current phase.
