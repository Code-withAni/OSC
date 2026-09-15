# Contribution Engine

## Objective

Identify contribution opportunities that are useful, realistic for a specific developer, evidence-backed, and unlikely to conflict with ongoing work.

## Inputs

The engine can use:

- repository knowledge graph
- source code index
- tests
- documentation
- GitHub issues
- pull requests
- commit activity
- developer skills
- developer experience level
- available time

## Candidate Sources

Potential candidates may come from:

1. Existing beginner-friendly or help-wanted issues.
2. Existing issues that require code-level interpretation.
3. Missing or weak tests.
4. Documentation gaps.
5. Explicit TODO/FIXME markers when relevant.
6. Uncovered maintenance work.
7. Stale or under-specified issues that can be clarified.

AI-discovered opportunities are allowed only as candidates until validated by evidence.

## Candidate Validation

Before recommending a candidate, check as many of the following as applicable:

- Is the underlying code area real and present?
- Is there supporting source evidence?
- Is there a related open issue?
- Is there an active PR already addressing it?
- Is the work already being modified recently?
- Is the scope reasonably bounded?
- Does it match the developer's skills?
- Is the effort compatible with available time?

## Scoring Dimensions

The exact weighting can evolve, but the conceptual factors are:

```text
Contribution Score
= skill fit
+ difficulty fit
+ impact
+ evidence quality
+ activity/maintainer signal
- complexity
- conflict risk
- uncertainty
```

Keep deterministic scoring separate from AI-generated qualitative reasoning where possible.

## Developer Profile

The initial profile may contain:

- skills
- skill level
- preferred languages
- preferred domains
- available time
- contribution experience

## Recommendation Output

Each candidate should expose:

- title
- contribution type
- problem statement
- difficulty
- effort estimate
- required skills
- relevant files/symbols
- evidence
- confidence
- related GitHub entities

## Evidence Format

Example:

```text
Recommendation:
Add tests for token expiration handling.

Evidence:
- src/auth/token.ts contains verifyToken().
- verifyToken() is used by API middleware.
- No direct expiration test was detected in the indexed tests.
- Related issue #431 discusses expiration behavior.
- No active PR was detected that clearly addresses the same scope.
```

## Confidence

Confidence is not certainty.

A recommendation can be labeled:

- high
- medium
- low

based on evidence completeness and ambiguity.

## Avoiding Issue Spam

The system must not automatically create issues from AI discoveries in the MVP.

The recommended flow is:

```text
Candidate
  ↓
Evidence
  ↓
Human review
  ↓
Optional GitHub action
```

## Future Capabilities

Later phases may add:

- implementation plans
- patch suggestions
- test-plan generation
- branch creation
- pull-request assistance

These are not MVP requirements.
