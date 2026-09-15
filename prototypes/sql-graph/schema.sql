-- Graph Storage Benchmark — schema for the MVP knowledge graph in PostgreSQL.
--
-- Model: nodes + directed, typed relationships (Common Code Model v1.1).
--   Node types:   RepositorySnapshot | Directory | File | Symbol | Test | TodoMarker
--   Rel types:    CONTAINS | IMPORTS | EXPORTS | CALLS | TESTED_BY
--
-- Query targets: Q2 (callers), Q3 (tests→symbol), Q4 (N-hop impact),
--                Q6 (coverage gaps), Q9 (evidence neighborhood).
--
-- Design notes:
--   - Denormalized hot columns (node_type, rel_type, call_site_line) sit beside a
--     JSONB `props` for everything else — keeps the hot paths index-friendly while
--     retaining full provenance from the Common Code Model.
--   - Two relationship indexes (from_id+rel_type, to_id+rel_type) are the reversal
--     pair that makes "who calls X" and "what does X call" both index-driven.
--   - Partial indexes exist for the two hottest rel types (CALLS, TESTED_BY) so
--     tree scans never touch CONTAINS/IMPORTS/EXPORTS rows.

DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS nodes CASCADE;

CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,        -- unique node id (see load-data.ts)
  node_type   TEXT NOT NULL,           -- RepositorySnapshot|Directory|File|Symbol|Test|TodoMarker
  name        TEXT NOT NULL,
  kind        TEXT,                    -- SymbolKind, else NULL
  file_path   TEXT,                    -- repo-relative for provenance
  start_line  INT,
  end_line    INT,
  is_exported BOOLEAN NOT NULL DEFAULT FALSE,
  is_test     BOOLEAN NOT NULL DEFAULT FALSE,
  props       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE relationships (
  rel_id     BIGSERIAL PRIMARY KEY,
  from_id    TEXT  NOT NULL REFERENCES nodes(id),
  to_id      TEXT  NOT NULL REFERENCES nodes(id),
  rel_type   TEXT  NOT NULL,           -- CONTAINS|IMPORTS|EXPORTS|CALLS|TESTED_BY
  call_site_line INT,                  -- denormalized hot field (CALLS only)
  props      JSONB NOT NULL DEFAULT '{}'::jsonb  -- confidence, callType, coverageType, provenance…
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Outgoing / incoming scans by type (reversal pair).
CREATE INDEX idx_rel_from_t ON relationships (from_id, rel_type);
CREATE INDEX idx_rel_to_t   ON relationships (to_id, rel_type);

-- Node-type scans (Q6 coverage gaps).
CREATE INDEX idx_nodes_type ON nodes (node_type);

-- Hot partial indexes: CALLS (impact analysis) and TESTED_BY (coverage).
CREATE INDEX idx_rel_calls_from ON relationships (from_id) WHERE rel_type = 'CALLS';
CREATE INDEX idx_rel_calls_to   ON relationships (to_id)   WHERE rel_type = 'CALLS';
CREATE INDEX idx_rel_tested_to  ON relationships (to_id)   WHERE rel_type = 'TESTED_BY';

-- Statistics freshness for the planner.
ANALYZE nodes;
ANALYZE relationships;