# Phase 0 Evaluation Specification

**Purpose:** Define concrete questions the system must answer and capabilities it must demonstrate before making infrastructure decisions.

**Status:** This is a specification document. No implementation code exists yet.

---

## Core Intelligence Questions

The system must answer these 10 questions with evidence:

### Q1: Which code entities are related to a GitHub issue?

**Scenario:** User provides a GitHub issue number. System identifies the relevant code symbols, files, and components.

**Required Input:**
- Repository URL
- Issue number
- Repository snapshot (commit SHA)

**Expected Output:**
- List of files related to the issue
- List of symbols (functions, classes, methods) related to the issue
- Confidence level (high/medium/low)
- Evidence for each relationship (issue text mentions, PR references, commit references)

**Required Graph Relationships:**
- `Issue --MENTIONS--> Symbol`
- `Issue --MENTIONS--> File`
- `Issue --RELATED_TO--> Symbol`
- `PR --FIXES--> Issue`
- `PR --MODIFIES--> File`
- `Commit --INTRODUCED_BY--> Issue`

**Required Code-Analysis Data:**
- Symbol table (all functions, classes, methods)
- File inventory with paths
- Symbol location data (file, line range)

**Required GitHub Data:**
- Issue title, body, labels
- Issue comments
- Cross-referenced PRs (if any)
- Linked commits (if any)

**Vector/Semantic Retrieval Needed:** YES
- Semantic similarity between issue text and code symbol names/summaries
- Issue body may describe behavior without exact function names

**Deterministic Logic Sufficient:** PARTIAL
- Exact name matches in issue text = deterministic
- Semantic similarity between issue description and code purpose = AI-assisted
- Follow graph relationships from linked PRs/commits = deterministic

**AI Reasoning Required:** YES
- Interpret issue intent when code entity names aren't explicitly mentioned
- Map semantic concepts to code structures

---

### Q2: What functions call this function?

**Scenario:** Given a function name, find all its callers.

**Required Input:**
- Repository URL
- Function/symbol identifier (name + file path or symbol ID)

**Expected Output:**
- List of caller functions with file paths and line numbers
- Call context (direct call, callback, promise chain, etc.)
- Call frequency if determinable

**Required Graph Relationships:**
- `Symbol --CALLS--> Symbol`
- `Symbol --CONTAINS--> Symbol` (for methods within classes)
- `File --CONTAINS--> Symbol`

**Required Code-Analysis Data:**
- AST-derived call graph
- Symbol locations (file + line range)
- Function signatures

**Required GitHub Data:**
- None (purely structural query)

**Vector/Semantic Retrieval Needed:** NO
- Pure graph traversal

**Deterministic Logic Sufficient:** YES
- AST parsing can reliably extract function calls

**AI Reasoning Required:** NO
- This is a structural fact

---

### Q3: Which tests cover this function?

**Scenario:** Given a function, identify tests that exercise it.

**Required Input:**
- Repository URL
- Function/symbol identifier

**Expected Output:**
- List of test files and test cases
- Coverage type (direct test, integration test, indirect coverage)
- Line coverage data if available
- Confidence level

**Required Graph Relationships:**
- `Test --TESTS--> Symbol`
- `Test --CALLS--> Symbol` (test calls function directly)
- `Test --CALLS--> Symbol --CALLS--> Symbol` (indirect coverage)
- `File --CONTAINS--> Test`

**Required Code-Analysis Data:**
- Test file identification (naming patterns, imports from test frameworks)
- Test case extraction
- Call relationships from test files

**Required GitHub Data:**
- None for basic query
- Optional: Recent test-related commits

**Vector/Semantic Retrieval Needed:** OPTIONAL
- Can help identify related integration tests by semantic similarity
- Not required for direct test detection

**Deterministic Logic Sufficient:** MOSTLY
- Direct calls from tests = deterministic
- Test file patterns = deterministic
- Indirect coverage requires graph traversal

**AI Reasoning Required:** OPTIONAL
- May help identify conceptually-related tests
- Not required for core functionality

---

### Q4: What could be affected if this function changes?

**Scenario:** Impact analysis for a function modification.

**Required Input:**
- Repository URL
- Function/symbol identifier

**Expected Output:**
- List of directly affected callers
- List of transitively affected code (call chain depth configurable)
- Files that would need changes
- Tests that should be re-run
- Estimated blast radius (high/medium/low)

**Required Graph Relationships:**
- `Symbol --CALLS--> Symbol` (reverse traversal)
- `Symbol --TESTED_BY--> Test`
- `File --CONTAINS--> Symbol`
- `File --IMPORTS--> File`

**Required Code-Analysis Data:**
- Complete call graph
- Symbol dependency graph
- Test relationships

**Required GitHub Data:**
- None for basic query
- Optional: Recent change frequency for risk assessment

**Vector/Semantic Retrieval Needed:** NO
- Pure graph traversal for structural impact

**Deterministic Logic Sufficient:** YES
- Graph traversal provides factual impact analysis

**AI Reasoning Required:** OPTIONAL
- May help assess semantic impact beyond structural changes
- Not required for core capability

---

### Q5: Is an issue already being addressed by an active PR?

**Scenario:** Conflict detection before recommending work.

**Required Input:**
- Repository URL
- Issue number

**Expected Output:**
- Boolean: has active PR
- If yes: PR number, title, status, author
- If yes: files being modified in the PR
- Confidence level

**Required Graph Relationships:**
- `PR --FIXES--> Issue`
- `PR --MODIFIES--> File`
- `Issue --RELATED_TO--> File`

**Required Code-Analysis Data:**
- File inventory for overlap detection

**Required GitHub Data:**
- Open PRs
- PR-to-issue references
- PR file changes
- PR status (draft, ready, mergeable)

**Vector/Semantic Retrieval Needed:** OPTIONAL
- Can detect semantically similar PRs even without explicit issue reference
- Not required for basic conflict detection

**Deterministic Logic Sufficient:** MOSTLY
- Explicit PR-issue links = deterministic
- File overlap detection = deterministic
- Semantic similarity of PR/issue intent requires AI

**AI Reasoning Required:** OPTIONAL
- Helps detect implicit conflicts
- Not required when explicit links exist

---

### Q6: Which parts of the codebase have weak test coverage?

**Scenario:** Identify testing gaps as contribution opportunities.

**Required Input:**
- Repository URL
- Optionally: minimum coverage threshold

**Expected Output:**
- List of files with low/no test coverage
- List of functions with no tests
- Complexity metrics (cyclomatic complexity + coverage = priority)
- Ranked by importance (call frequency, public API, complexity)

**Required Graph Relationships:**
- `Symbol --TESTED_BY--> Test` (absence indicates gap)
- `Symbol --CALLS--> Symbol` (call frequency)
- `File --CONTAINS--> Symbol`
- `Symbol --EXPORTS--> Symbol` (public API detection)

**Required Code-Analysis Data:**
- Complete symbol inventory
- Test relationships
- Function complexity metrics
- Public/private API detection (exports)

**Required GitHub Data:**
- Optional: Recent bug reports related to untested code

**Vector/Semantic Retrieval Needed:** NO
- Structural analysis sufficient

**Deterministic Logic Sufficient:** YES
- Test coverage is a structural fact

**AI Reasoning Required:** OPTIONAL
- May help prioritize which gaps are most important
- Core detection is deterministic

---

### Q7: What contribution opportunities exist that are not already being worked on?

**Scenario:** Generate ranked list of available contributions.

**Required Input:**
- Repository URL

**Expected Output:**
- List of contribution candidates with:
  - Type (bug fix, test, docs, feature, maintenance)
  - Title and description
  - Relevant files/symbols
  - Estimated difficulty (beginner/intermediate/advanced)
  - Estimated effort (hours)
  - Evidence
  - Confidence
- Filtered to exclude active work

**Required Graph Relationships:**
- All issue relationships (Q1)
- All conflict detection relationships (Q5)
- Test coverage relationships (Q6)
- `File --DOCUMENTED_BY--> Documentation` (doc gap detection)

**Required Code-Analysis Data:**
- Symbol inventory
- Test relationships
- TODO/FIXME comment extraction
- Documentation presence

**Required GitHub Data:**
- All open issues
- All open PRs
- Issue labels (good-first-issue, help-wanted, bug, etc.)
- Issue staleness (created/updated dates)
- Issue activity (comment count, assignees)

**Vector/Semantic Retrieval Needed:** YES
- Group similar issues
- Identify related TODO comments
- Match documentation gaps to code

**Deterministic Logic Sufficient:** PARTIAL
- Issue filtering = deterministic
- Test gap detection = deterministic
- TODO extraction = deterministic
- Semantic grouping = AI-assisted

**AI Reasoning Required:** YES
- Determine contribution type from issue
- Assess scope and difficulty
- Generate clear problem statements

---

### Q8: Which contribution best matches a developer's skills and available time?

**Scenario:** Personalized recommendation ranking.

**Required Input:**
- Repository URL
- Developer profile:
  - Skills (TypeScript, React, testing, etc.)
  - Experience level (beginner/intermediate/advanced)
  - Available time (hours)
  - Preferred domains (frontend, backend, CLI, etc.)

**Expected Output:**
- Re-ranked contribution list
- Match score for each candidate
- Skill-gap analysis (required skills vs developer skills)
- Explanation of ranking

**Required Graph Relationships:**
- All from Q7
- `File --CONTAINS--> Symbol` (to identify technology stack per contribution)
- `Symbol --IMPORTS--> ExternalPackage` (framework/library detection)

**Required Code-Analysis Data:**
- File language detection
- Framework/library usage
- Code location (identify frontend vs backend)

**Required GitHub Data:**
- Same as Q7

**Vector/Semantic Retrieval Needed:** OPTIONAL
- Can help match developer domain preferences to code areas
- Not strictly required for basic skill matching

**Deterministic Logic Sufficient:** MOSTLY
- Skill keyword matching = deterministic
- Effort filtering = deterministic
- Difficulty filtering = deterministic
- Domain detection from file paths = deterministic

**AI Reasoning Required:** OPTIONAL
- Can provide nuanced skill-gap analysis
- Can assess domain fit beyond file paths
- Core ranking can be deterministic

---

### Q9: What evidence supports a recommendation?

**Scenario:** Explain why the system believes a contribution is valid and appropriate.

**Required Input:**
- Repository URL
- Contribution candidate ID

**Expected Output:**
- Evidence bundle:
  - Source files (paths + line ranges)
  - Symbol names and signatures
  - Graph relationships (what calls what, what tests what)
  - GitHub issue/PR references
  - Test coverage facts
  - Recent commit activity
  - Maintainer signals (labels, comments)
- Provenance for each fact (where it came from)

**Required Graph Relationships:**
- All relationships relevant to the contribution type
- Graph neighborhood around contribution scope

**Required Code-Analysis Data:**
- Symbol locations
- Relationship provenance (which parser, which commit)

**Required GitHub Data:**
- Full context for referenced issues/PRs

**Vector/Semantic Retrieval Needed:** YES
- Retrieve relevant code context chunks
- Retrieve relevant documentation

**Deterministic Logic Sufficient:** MOSTLY
- Collecting facts = deterministic
- Organizing and presenting them = deterministic

**AI Reasoning Required:** YES
- Synthesize evidence into coherent explanation
- Highlight most relevant facts
- Natural language generation

---

### Q10: How confident is the system in a recommendation?

**Scenario:** Distinguish high-confidence from speculative opportunities.

**Required Input:**
- Repository URL
- Contribution candidate

**Expected Output:**
- Confidence level: high / medium / low
- Confidence factors:
  - Evidence completeness (all required data present?)
  - Evidence quality (explicit references vs inferred relationships?)
  - Conflict risk (active work detected?)
  - Scope clarity (well-bounded vs vague?)
  - Maintainer signal strength (labeled issue vs discovered gap?)

**Required Graph Relationships:**
- All relevant relationships for the contribution

**Required Code-Analysis Data:**
- Completeness of analysis (full parse vs partial?)

**Required GitHub Data:**
- Maintainer activity level
- Issue label presence

**Vector/Semantic Retrieval Needed:** NO
- Confidence is a meta-assessment of existing data

**Deterministic Logic Sufficient:** MOSTLY
- Evidence completeness = deterministic
- Explicit vs inferred = deterministic
- Conflict detection = deterministic

**AI Reasoning Required:** OPTIONAL
- May help assess scope clarity
- Core confidence scoring can be deterministic

---

## Required Data

### From Static Analysis
- Complete file inventory with paths, hashes, sizes
- Language detection per file
- Test file identification
- AST-derived symbols (functions, classes, methods, interfaces)
- Symbol locations (file + line range)
- Symbol signatures
- Import/export relationships
- Call relationships (who calls whom)
- Inheritance/implementation relationships
- TODO/FIXME comment extraction with locations
- Cyclomatic complexity per function
- Public API detection (exports)
- Documentation file identification

### From GitHub API
- Repository metadata (owner, name, default branch, stars, activity)
- All open issues (title, body, labels, state, created/updated dates, assignees, comments)
- All closed issues from last 6 months (to detect recent fixes)
- All open PRs (title, body, state, draft status, file changes)
- Selected commit data (SHAs, messages, changed files, authors, timestamps)
- Issue-PR cross-references
- Maintainer signals (label types, comment activity)

### From Common Code Model
- Language-neutral representation of all symbols
- Unified relationship types across languages
- Provenance metadata (parser version, commit SHA, timestamp)

---

## Required Graph Queries

### Traversal Queries
1. **Find callers**: Given symbol S, return all symbols that call S
2. **Find callees**: Given symbol S, return all symbols S calls
3. **Find tests**: Given symbol S, return all tests that exercise S (direct or transitive)
4. **Impact analysis**: Given symbol S, return all symbols transitively affected by changes to S (with depth limit)
5. **File dependencies**: Given file F, return all files that import F
6. **Issue scope**: Given issue I, return all symbols and files related to I
7. **PR conflicts**: Given issue I, return all open PRs that modify related files
8. **Test coverage gap**: Return all public symbols with no TESTED_BY relationships
9. **Symbol neighborhood**: Given symbol S, return N-hop neighborhood (callers, callees, tests, containing files)
10. **Documentation gap**: Return all public symbols with no DOCUMENTED_BY relationships

### Aggregation Queries
1. **Call frequency**: How many symbols call this symbol?
2. **Test count**: How many tests cover this file/symbol?
3. **Complexity ranking**: Rank functions by complexity where test coverage is low
4. **Change frequency**: How often has this file been modified? (requires commit history)
5. **Contribution type distribution**: Count issues by label type

### Pattern Queries
1. **Orphan symbols**: Functions/classes never called within the codebase
2. **High-impact symbols**: Functions called by many other functions
3. **Test deserts**: Connected components of code with no test coverage
4. **API boundary**: Public exports and their immediate dependents

---

## Required Retrieval

### Semantic Search
1. **Issue-to-code matching**: Given issue text, find semantically similar code areas
2. **Code-to-docs matching**: Given symbol, find relevant documentation chunks
3. **Similar issues**: Given issue, find similar issues
4. **TODO relevance**: Given issue, find related TODO comments
5. **Example retrieval**: Given contribution task, find similar existing code

### Requirements
- Chunk size: ~100-500 tokens per chunk
- Metadata per chunk: file path, line range, symbol context, commit SHA
- Hybrid search capability (keyword + semantic)
- Re-ranking by recency and relevance

---

## AI Responsibilities

### During Analysis (one-time per repository)
1. **Component summarization**: Generate natural language summary of what a file/module does
2. **Symbol purpose extraction**: Infer the purpose of functions without clear documentation
3. **Architecture understanding**: Identify high-level architectural patterns

### During Contribution Discovery (per query)
1. **Issue interpretation**: Map issue description to code concepts
2. **Scope assessment**: Determine if an issue is well-bounded or vague
3. **Difficulty estimation**: Assess complexity beyond cyclomatic complexity metrics
4. **Impact estimation**: Assess likely user/maintainer value

### During Recommendation (per user)
1. **Evidence synthesis**: Organize facts into coherent explanation
2. **Skill-gap analysis**: Explain what developer needs to learn
3. **Implementation guidance**: Suggest approach (when explicitly requested by user)

### Not AI Responsibilities (must be deterministic)
- AST parsing
- Call graph construction
- Test detection (based on patterns)
- Conflict detection (based on PR/issue links)
- Basic scoring/ranking (based on metrics)

---

## Benchmark Repositories

### 1. Small Library: `date-fns` (or similar)
**Why:**
- ~50-100 TypeScript files
- Pure functions, no framework
- High test coverage
- Active issues/PRs
- Good documentation
- Clear module boundaries

**What to Test:**
- Can we parse all TypeScript files?
- Can we build accurate call graph?
- Can we detect test coverage correctly?
- Can we map issues to relevant date formatting functions?
- Can we identify well-tested vs under-tested areas?

**Success Criteria:**
- 100% file parse rate
- Accurate function call relationships
- Correct test-to-function mapping
- Identify at least 3 valid contribution opportunities from real issues

---

### 2. Medium CLI Tool: `commander.js` or `yargs`
**Why:**
- ~20-30 files
- Mix of TypeScript and JavaScript
- API-heavy (methods, chaining)
- Real-world issues (API design, documentation)
- Moderate test coverage

**What to Test:**
- Can we handle mixed JS/TS?
- Can we detect method chaining patterns?
- Can we identify API surface (exports)?
- Can we find documentation gaps?
- Can we recommend API improvements from issues?

**Success Criteria:**
- Correct language detection per file
- Accurate method call chains in graph
- Identify exported API vs internal functions
- Match issues about API confusion to relevant code

---

### 3. Medium Web Framework: `fastify` or `koa`
**Why:**
- ~100-200 files
- Plugin architecture
- Mix of core and plugins
- High complexity in core, simple in plugins
- Active contribution community
- Good test coverage

**What to Test:**
- Can we identify plugin boundaries?
- Can we map middleware/plugin issues to code?
- Can we detect impact of core changes on plugins?
- Can we identify beginner-friendly plugin contributions vs core contributions?

**Success Criteria:**
- Distinguish core from plugins in graph
- Accurate impact analysis (core change affects which plugins)
- Difficulty scoring separates beginner plugin work from advanced core work
- Identify good-first-issue that matches labels

---

### 4. Monorepo: `turborepo` or small Nx example
**Why:**
- Multiple packages
- Inter-package dependencies
- Shared code
- Package-specific tests
- Cross-package impact analysis needed

**What to Test:**
- Can we model multiple packages in one graph?
- Can we detect cross-package calls?
- Can we identify which package an issue concerns?
- Can we do impact analysis across packages?

**Success Criteria:**
- Graph contains package boundaries
- Cross-package relationships correct
- Issues correctly mapped to specific packages
- Impact analysis crosses package boundaries

---

### 5. Frontend Component Library: `radix-ui/primitives` or similar
**Why:**
- React + TypeScript
- Component architecture
- Accessibility requirements
- Visual testing challenges
- Documentation-heavy
- Mix of simple and complex components

**What to Test:**
- Can we parse JSX/TSX?
- Can we identify component boundaries?
- Can we detect component usage relationships?
- Can we identify documentation per component?
- Can we find components missing tests?

**Success Criteria:**
- Parse all TSX files
- Identify React component definitions
- Map components to their tests
- Identify doc gaps per component
- Recommend test/doc contributions for less-covered components

---

## Evaluation Criteria

### Pass Criteria (must achieve on all benchmarks)
1. **Parse rate**: ≥95% of JavaScript/TypeScript files successfully parsed
2. **Symbol extraction**: ≥90% of functions/classes/methods extracted
3. **Call accuracy**: ≥85% of function calls correctly identified (manual validation on sample)
4. **Test detection**: Correctly identify test files (100% precision on filename patterns)
5. **Test mapping**: ≥70% of test-to-function relationships correct (sample validation)
6. **Issue mapping**: ≥60% of issues correctly mapped to relevant files (manual validation)
7. **Conflict detection**: 100% detection of explicitly-linked PR-issue conflicts
8. **Recommendations**: ≥3 valid contribution opportunities per repository
9. **Evidence**: Every recommendation has at least 2 pieces of supporting evidence
10. **No hallucination**: 0 recommendations for code that doesn't exist

### Quality Criteria (targets)
1. **Precision**: ≥80% of recommendations are actually valid contributions
2. **Recall**: ≥60% of good-first-issues are included in recommendations
3. **Ranking**: Top 3 recommendations should include at least 1 good-first-issue
4. **Evidence quality**: ≥70% of evidence items are directly relevant
5. **Confidence calibration**: High-confidence recommendations are valid ≥90% of time

### Performance Criteria (informational at this stage)
- Analysis time per repository
- Graph query latency
- Retrieval latency
- Storage size per repository
- Memory usage during analysis

---

## Minimum Technical Capabilities

### Code Analysis Engine Must:
1. Parse JavaScript and TypeScript files into AST
2. Extract function/class/method definitions with line ranges
3. Extract import/export statements
4. Build call graph (who calls whom) with ≥85% accuracy
5. Detect test files by naming convention
6. Extract TODO/FIXME comments with locations
7. Calculate cyclomatic complexity per function
8. Handle parse errors gracefully (skip file, log error, continue)
9. Process repositories incrementally (file by file, not all-in-memory)

### Graph Database Must:
1. Store nodes with arbitrary properties (flexible schema)
2. Store directed relationships with properties
3. Execute multi-hop traversals (N-hop neighborhood)
4. Execute reverse traversals (find callers)
5. Filter by relationship type
6. Filter by node properties
7. Count relationships (degree, fan-in, fan-out)
8. Return subgraphs (relevant neighborhood for evidence)
9. Handle 10,000+ nodes and 50,000+ relationships per repository
10. Query latency <500ms for typical queries (<5 hops, <1000 nodes examined)

### Vector/Semantic Index Must:
1. Store text chunks with metadata
2. Generate embeddings (via external LLM API or local model)
3. Execute semantic similarity search
4. Execute hybrid search (keyword + semantic)
5. Filter by metadata (file path, commit SHA, symbol name)
6. Return top-K results with scores
7. Handle 10,000+ chunks per repository
8. Query latency <200ms for typical search

### Common Code Model Must:
1. Represent symbols in language-neutral format
2. Represent relationships in language-neutral format
3. Include provenance metadata (source, parser, timestamp, commit)
4. Serialize to/from storage
5. Support multiple languages (extensible)

### GitHub Integration Must:
1. Fetch repository metadata via API
2. Fetch issues with pagination
3. Fetch PRs with pagination
4. Fetch commits (selected)
5. Detect cross-references (issue mentions PR, PR fixes issue)
6. Handle API rate limits gracefully
7. Cache results to avoid redundant calls

### Job Queue Must:
1. Accept analysis jobs
2. Execute jobs asynchronously
3. Provide job status (queued, running, completed, failed)
4. Handle failures with retry logic
5. Persist job state across restarts

---

## Infrastructure Decision Inputs

After running these benchmarks, we will have data to inform:

### Graph Database Selection
- **Data point**: Actual graph size (nodes, relationships) per repository type
- **Data point**: Query patterns and frequency
- **Data point**: Query latency requirements validated
- **Question**: Do we need graph-specific features (algorithms, complex traversals) or is adjacency-list in RDBMS sufficient?
- **Question**: Do we need distributed graph (multi-machine) or single-machine sufficient?

### Vector Index Selection
- **Data point**: Chunk count per repository
- **Data point**: Embedding dimensionality needed
- **Data point**: Query latency measured
- **Question**: Do we need managed service or self-hosted?
- **Question**: Do we need hybrid search (keyword + semantic) or semantic-only?
- **Question**: Can we use PostgreSQL extension (pgvector) or need dedicated system?

### Job Queue Selection
- **Data point**: Average analysis time per repository
- **Data point**: Concurrency needs (how many repositories analyzed simultaneously)
- **Question**: Do we need distributed queue or single-machine sufficient?
- **Question**: Do we need priority queues or FIFO sufficient?
- **Question**: Can we use database-backed queue or need Redis/message broker?

### Parser Selection
- **Data point**: Parse success rate per parser
- **Data point**: Parse time per file
- **Data point**: Call graph accuracy per parser
- **Question**: TypeScript Compiler API vs Babel vs tree-sitter?
- **Trade-off**: Accuracy vs speed vs memory

### Storage Model
- **Data point**: Storage size per repository (graph + index + metadata)
- **Data point**: Query patterns (relational vs graph vs full-text)
- **Question**: Single database (PostgreSQL + extensions) vs polyglot (Postgres + Neo4j + Pinecone)?
- **Trade-off**: Operational complexity vs query performance vs cost

---

## Next Steps After This Spec

1. **Manual validation first**: Pick 1 benchmark repo, manually answer all 10 questions, document expected results
2. **Run benchmarks**: Implement minimal prototype to validate each capability
3. **Measure**: Collect all "data points" listed above
4. **Decide**: Make infrastructure choices based on measured needs, not assumptions
5. **Document decision**: Create `decisions/001-infrastructure-choices.md` with rationale
6. **Proceed to Phase 1**: Implement repository ingestion with chosen stack
