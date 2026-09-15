# Benchmark Repositories

This document specifies the exact repository snapshots used for all Phase 0 evaluation experiments.

## Selected Repositories

| Repository | Commit SHA | Date | Purpose |
|------------|------------|------|---------|
| commander.js | ba6d13ddb4243e5913367734f8c159089ffe7834 | 2026-05-29 | Small TypeScript CLI library |
| date-fns | 18cbd436f1428d0f45f89f710df65f62546c42f0 | 2026-08-30 | Medium TypeScript functional library |

## Repository Details

### commander.js (ba6d13ddb4243e5913367734f8c159089ffe7834)

- **Total files**: 219
- **TypeScript files**: 3
- **JavaScript files**: 124
- **Test files**: 109
- **Repository size**: ~2.2 MB
- **Language breakdown**: 
  - JavaScript: 57%
  - TypeScript: 1%
  - Other (JSON, markdown, config): 42%
- **Source files**: 127 (JS + TS files excluding tests and node_modules)
- **Test files**: 109
- **Why selected**:
  - Small enough for rapid iteration (<30 source files)
  - Mixed JS/TS (mostly JS with some TS)
  - Clear module structure
  - Moderate test coverage
  - Well-maintained with active issues/PRs
  - CLI tool domain (good for contribution discovery)

### date-fns (18cbd436f1428d0f45f89f710df65f62546c42f0)

- **Total files**: 1,917
- **TypeScript files**: 1,601
- **JavaScript files**: 38
- **Test files**: 5
- **Repository size**: ~18 MB
- **Language breakdown**:
  - TypeScript: 83%
  - JavaScript: 2%
  - Other: 15%
- **Source files**: 1,639 (TS + JS files excluding tests and types/)
- **Test files**: 5 (minimal test suite)
- **Why selected**:
  - Medium size for scalability testing (~1,600 source files)
  - Predominantly TypeScript
  - Functional programming style (different from commander.js OOP)
  - Many pure functions (good for call graph analysis)
  - Well-known library with clear API
  - Minimal test suite (good for identifying test gaps)

## Verification Notes

Both repositories:
- Are public on GitHub
- Use primary MVP languages (JavaScript/TypeScript)
- Have open issues for Q1 testing
- Are actively maintained
- Represent different architectural patterns
- Are suitable for Phase 0 evaluation:
  - commander.js: validates small repo handling, mixed language
  - date-fns: validates medium repo handling, TypeScript-heavy

## Usage Instructions

All experiments MUST:
1. Clone the repository at the exact commit SHA specified
2. Verify the commit matches before proceeding
3. Use the same snapshot across all experiments (parser, gold standard, retrieval, graph)
4. Record any deviations (though none should occur)

Example verification:
```bash
git clone <repository-url>
git checkout <commit-sha>
git rev-parse HEAD  # Must match the SHA above
```

## Last Updated

2026-09-13