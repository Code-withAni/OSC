# Product Definition

## Problem

Many developers want to contribute to open source but struggle to determine:

- where to start
- which work matches their skills
- which part of the codebase an issue actually concerns
- how difficult a contribution will be
- whether someone is already working on it
- how to turn an issue description into a concrete implementation plan

## Solution

Analyze a repository as a connected software system and combine that understanding with GitHub activity and a developer profile to produce actionable contribution recommendations.

## Core User Journey

1. The user enters a GitHub repository URL.
2. The system analyzes the repository.
3. The system builds a structured repository model.
4. The system ingests relevant issues, pull requests, and commit context.
5. The system generates potential contribution candidates.
6. The user provides skills, experience level, and available time.
7. The system ranks candidates for that developer.
8. The user opens a candidate.
9. The AI explains the opportunity using repository evidence.
10. The user continues the contribution workflow on GitHub.

## Primary User

A developer who wants to contribute to an unfamiliar open-source project and needs help identifying a realistic starting point.

## Secondary User

An open-source maintainer who wants contributors to understand project areas and discover useful work without creating low-quality issue spam.

## Product Differentiator

GitHub already exposes issues, labels, commits, and pull requests.

This product adds a repository-level reasoning layer that connects:

- code
- architecture
- tests
- documentation
- issues
- pull requests
- commits
- contributor capabilities

## Recommendation Principles

A recommendation should optimize for a combination of:

- skill match
- difficulty fit
- estimated effort
- likely impact
- repository activity
- maintainer context
- evidence quality
- lack of conflicting active work

## Recommendation Output

Every contribution recommendation should provide:

- title
- concise problem statement
- contribution type
- difficulty estimate
- effort estimate
- required skills
- relevant files/components
- evidence
- confidence
- related issues/PRs where applicable

## Trust Model

The system should distinguish between:

- observed facts
- inferred relationships
- AI-generated hypotheses

The UI should not present inferred or speculative opportunities as confirmed bugs or maintainer requests.

## Product Non-Goals for MVP

The MVP is not:

- an autonomous software engineer
- a replacement for GitHub
- a generic code chatbot
- a private repository management suite
- an automatic issue-spam generator

## Success Criteria

Early product success means users can paste a repository and obtain at least one useful, evidence-backed contribution opportunity they understand well enough to investigate themselves.
