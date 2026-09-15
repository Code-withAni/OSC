# Open Source Contribution Intelligence

An AI-assisted platform that helps developers understand a GitHub repository and find meaningful contributions that match their skills and available time.

## Vision

Open-source repositories often contain valuable work that needs contributors, but the path from “I want to help” to “I know exactly what I should work on” is difficult.

This project aims to bridge that gap by building a structured understanding of a repository and using it to recommend actionable contribution opportunities.

## Product Flow

```text
GitHub Repository
       ↓
Repository Analysis
       ↓
Knowledge Graph + Code Index
       ↓
Issues / PRs / Tests / Docs / Commits
       ↓
Contribution Candidates
       ↓
Developer Skill Matching
       ↓
Evidence-backed Recommendation
       ↓
AI Explanation
       ↓
Developer contributes on GitHub
```

## Why a Knowledge Graph?

Traditional repository search can retrieve relevant text, but contribution discovery depends heavily on relationships:

- which functions call which functions
- which tests cover which code
- which issue concerns which component
- which PR changes which code
- which modules depend on a component
- what could be affected by a change

The knowledge graph represents those relationships explicitly. A code/document index complements it by supporting semantic retrieval.

## Initial Technology Direction

The implementation can begin with:

- Next.js + TypeScript
- Node.js-compatible analysis workers
- PostgreSQL for application data
- A graph database or graph layer suitable for repository relationships
- A vector/code index for semantic retrieval
- GitHub REST and/or GraphQL APIs
- An LLM API for semantic reasoning

The database choices are intentionally not treated as final until the required graph queries and workload are validated.

## MVP

The first usable version should:

1. Accept a public GitHub repository URL.
2. Ingest the repository without executing its code.
3. Analyze JavaScript/TypeScript structure.
4. Build a repository knowledge graph.
5. Fetch issues and pull requests.
6. Identify candidate contribution opportunities.
7. Match candidates to a developer profile.
8. Explain the selected contribution with evidence.

## Core Principle

The product is not “chat with a repository.”

It is a contribution intelligence system that answers:

> What meaningful contribution can I realistically make here, and why?

## Repository Layout

```text
CLAUDE.md
README.md

docs/
├── PRODUCT.md
├── ARCHITECTURE.md
├── KNOWLEDGE-GRAPH.md
├── CODE-ANALYSIS.md
├── CONTRIBUTION-ENGINE.md
└── ROADMAP.md
```

## Development

Read `CLAUDE.md` before making architectural or product changes. The documents in `docs/` are the current product and architecture source of truth.
