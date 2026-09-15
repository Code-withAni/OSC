/**
 * Common Code Model - MVP
 *
 * Language-neutral intermediate representation for repository structure and code relationships.
 * Separates parsing (file-level) from resolution (repository-level).
 *
 * Derivation documented in: docs/COMMON-CODE-MODEL.md
 * Version: 1.1
 * Last Updated: 2026-09-13
 */

// ============================================================================
// Core Types
// ============================================================================

export type Language =
  | 'javascript'
  | 'typescript'
  | 'unknown';

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'const'
  | 'enum'
  | 'module'; // synthetic: per-file module-level scope

export type RelationshipType =
  | 'CONTAINS'
  | 'IMPORTS'
  | 'EXPORTS'
  | 'CALLS'
  | 'TESTED_BY';

export type ImportType =
  | 'relative'      // ./file, ../file
  | 'package'       // node_modules package
  | 'absolute';     // src/file (via tsconfig paths)

export type ExportType =
  | 'named'         // export { foo }
  | 'default';      // export default foo

export type CallType =
  | 'direct'        // foo()
  | 'method'        // obj.foo()
  | 'callback'      // func(foo)
  | 'dynamic';      // obj[methodName](), eval()

export type CoverageType =
  | 'direct'        // Test calls symbol directly
  | 'indirect';     // Test calls A, A calls symbol

export type Confidence =
  | 'high'          // Deterministic from AST
  | 'medium'        // Inferred
  | 'low';          // Guessed

export type TestFramework =
  | 'jest'
  | 'mocha'
  | 'vitest'
  | 'unknown';

export type MarkerType =
  | 'TODO'
  | 'FIXME'
  | 'HACK'
  | 'XXX'
  | 'NOTE';

// ============================================================================
// Provenance
// ============================================================================

/**
 * Provenance tracks where every fact came from.
 * Required on all nodes and relationships.
 */
export interface Provenance {
  commitSha: string;         // Git commit SHA or "local" for uncommitted
  extractedAt: string;       // ISO 8601 timestamp
  extractedBy: string;       // Parser/resolver ID + version (e.g., "typescript-parser:1.0")
  sourceFile?: string;       // For relationships: which file was analyzed
  sourceLine?: number;       // For relationships: line number in sourceFile
}

// ============================================================================
// Nodes
// ============================================================================

/**
 * RepositorySnapshot represents one analyzed version of a repository.
 */
export interface RepositorySnapshot {
  repositoryId: string;      // Format: "owner/repo" or local path
  commitSha: string;         // Git commit SHA (or "local")
  analyzedAt: string;        // ISO 8601 timestamp
  provenance: Provenance;
}

/**
 * Directory represents a directory in the repository tree.
 * Optional - may be inferred from File paths.
 */
export interface Directory {
  path: string;              // Relative path from repo root (e.g., "src/utils")
  provenance: Provenance;
}

/**
 * File represents a source file, test file, or configuration file.
 */
export interface File {
  path: string;              // Relative path from repo root (e.g., "src/index.ts")
  language: Language;
  hash: string;              // Content hash (SHA-256) for change detection
  size: number;              // File size in bytes
  isTest: boolean;           // True if this is a test file
  isGenerated: boolean;      // True if file is build output
  provenance: Provenance;
}

/**
 * Symbol represents a code entity.
 * Single interface with discriminator (SymbolKind) - simplest for MVP.
 */
export interface Symbol {
  symbolId: string;          // Unique within repository snapshot
  name: string;              // Symbol name as it appears in code
  kind: SymbolKind;
  filePath: string;          // File containing this symbol
  startLine: number;         // 1-indexed line number
  endLine: number;           // 1-indexed line number
  signature?: string;        // Optional function/method signature (may be incomplete)
  complexity?: number;       // Optional cyclomatic complexity
  isExported: boolean;       // Derived from EXPORTS relationship (denormalized)
  provenance: Provenance;
}

/**
 * Test represents a test file or test case.
 */
export interface Test {
  testId: string;            // Unique within repository snapshot
  testName: string;          // Test case name or test file name
  testFilePath: string;      // File containing this test
  testFramework: TestFramework;
  startLine?: number;        // Optional: test case location
  endLine?: number;
  provenance: Provenance;
}

/**
 * TodoMarker represents a TODO/FIXME/HACK comment.
 * Used for Q7 (contribution candidate discovery).
 * Contained by File via CONTAINS relationship.
 */
export interface TodoMarker {
  markerId: string;          // Unique within repository snapshot
  text: string;              // Full comment text
  markerType: MarkerType;
  filePath: string;
  line: number;
  provenance: Provenance;
}

/**
 * Node is a union of all node types in the Common Code Model.
 */
export type Node =
  | RepositorySnapshot
  | Directory
  | File
  | Symbol
  | Test
  | TodoMarker;

// ============================================================================
// Relationships
// ============================================================================

/**
 * Base relationship interface.
 */
export interface BaseRelationship {
  type: RelationshipType;
  fromId: string;            // Node ID
  toId: string;              // Node ID
  provenance: Provenance;
}

/**
 * CONTAINS: Parent-child structural containment.
 *
 * Examples:
 * - RepositorySnapshot --CONTAINS--> File
 * - File --CONTAINS--> Symbol
 * - File --CONTAINS--> Test
 * - File --CONTAINS--> TodoMarker
 */
export interface ContainsRelationship extends BaseRelationship {
  type: 'CONTAINS';
}

/**
 * IMPORTS: File-level import dependency (resolved by resolver).
 */
export interface ImportsRelationship extends BaseRelationship {
  type: 'IMPORTS';
  fromId: string;            // File
  toId: string;              // File
  importSpecifier: string;   // Original specifier (e.g., "./utils", "lodash")
  importType: ImportType;
}

/**
 * EXPORTS: Symbol exported from a file (public API).
 * Authoritative representation of public API.
 * When resolver creates this, it also sets Symbol.isExported = true.
 */
export interface ExportsRelationship extends BaseRelationship {
  type: 'EXPORTS';
  fromId: string;            // File
  toId: string;              // Symbol
  exportType: ExportType;
}

/**
 * CALLS: Function/method invocation relationship (resolved by resolver).
 * Critical for Q2 (find callers), Q4 (impact analysis).
 */
export interface CallsRelationship extends BaseRelationship {
  type: 'CALLS';
  fromId: string;            // Symbol (function or method)
  toId: string;              // Symbol (function or method)
  callType: CallType;
  confidence: Confidence;
  callSiteLine: number;      // Line where call occurs (in caller's file)
}

/**
 * TESTED_BY: Symbol is tested by a test (inferred by resolver).
 * Critical for Q3 (find tests), Q6 (coverage gaps).
 */
export interface TestedByRelationship extends BaseRelationship {
  type: 'TESTED_BY';
  fromId: string;            // Symbol
  toId: string;              // Test
  coverageType: CoverageType;
  confidence: Confidence;
}

/**
 * Relationship is a union of all relationship types.
 */
export type Relationship =
  | ContainsRelationship
  | ImportsRelationship
  | ExportsRelationship
  | CallsRelationship
  | TestedByRelationship;

// ============================================================================
// Parser Contract (File-Level)
// ============================================================================

/**
 * ParseError represents a failure during parsing.
 */
export interface ParseError {
  file: string;
  line?: number;
  message: string;
  fatal: boolean;            // True if file cannot be analyzed at all
}

/**
 * ImportNameMapping captures alias information for one imported binding.
 * 'import { foo as bar }' -> { local: 'bar', imported: 'foo' }
 * 'import def from "./mod"' -> { local: 'def', imported: 'default', isDefault: true }
 * 'import * as ns from "./mod"' -> { local: 'ns', imported: '*', isNamespace: true }
 */
export interface ImportNameMapping {
  local: string;              // Name used in the importing file
  imported: string;           // Name in the source module ('default' | '*' | original name)
  isDefault?: boolean;
  isNamespace?: boolean;
}

/**
 * ImportStatement represents an unresolved import (parser output).
 */
export interface ImportStatement {
  specifier: string;         // e.g., './utils', 'lodash'
  importedNames: string[];   // e.g., ['helper', 'foo'] (local names)
  line: number;
  nameMappings?: ImportNameMapping[]; // Alias-aware mapping for resolver
}

/**
 * ExportStatement represents an export (parser output).
 */
export interface ExportStatement {
  symbolName: string;        // Exported (public) name, 'default', or '*' for export-star
  exportType: ExportType;
  line: number;
  sourceSpecifier?: string;  // For re-exports: the module the symbol comes from
  sourceName?: string;       // Name in source module before re-export aliasing
}

/**
 * CallExpression represents an unresolved function call (parser output).
 */
export interface CallExpression {
  callerSymbolId?: string;   // Symbol making the call (if inside function)
  calledName: string;        // Identifier being called (e.g., 'foo', 'obj.bar')
  callType: CallType;
  line: number;
  /**
   * Identifier / property-access names used as call arguments.
   * Lets the resolver label callback-registered functions without
   * duplicating the category decision outside the resolver.
   */
  arguments?: string[];
}

/**
 * FileParseResult is what a parser returns for a single file.
 * Contains file-level facts only, no cross-file resolution.
 */
export interface FileParseResult {
  file: File;
  symbols: Symbol[];         // isExported not set yet (resolver's job)
  tests: Test[];
  todoMarkers: TodoMarker[];

  // Unresolved facts (raw AST extraction)
  importStatements: ImportStatement[];
  exportStatements: ExportStatement[];
  callExpressions: CallExpression[];

  errors: ParseError[];
}

/**
 * Parser is the contract all language parsers must implement.
 * Produces file-level facts only, does NOT resolve cross-file references.
 */
export interface Parser {
  id: string;                // Parser ID + version (e.g., "typescript-parser:1.0")

  /**
   * Parse a single file and extract file-level structural facts.
   * Does NOT resolve import specifiers or call targets.
   *
   * @param filePath - Path to the file (used for provenance)
   * @param content - File content as string
   * @returns FileParseResult with symbols, unresolved facts, and errors
   */
  parse(filePath: string, content: string): FileParseResult;
}

// ============================================================================
// Resolver Contract (Repository-Level)
// ============================================================================

/**
 * ResolverError represents a failure during resolution.
 * category separates why it failed:
 * - 'external_dependency': specifier points outside the repository (node_modules, builtins)
 * - 'unsupported': construct the MVP resolver does not handle (e.g., tsconfig paths)
 * - 'ambiguous': determinable target requires type information not available
 * - 'not_found': target genuinely missing in the repository
 */
export interface ResolverError {
  type: 'unresolved_import' | 'unresolved_call' | 'ambiguous_symbol';
  file: string;
  line?: number;
  message: string;
  category?: 'external_dependency' | 'unsupported' | 'ambiguous' | 'not_found';
}

/**
 * ResolverResult is what a resolver returns.
 * Contains resolved cross-file relationships.
 */
export interface ResolverResult {
  relationships: Relationship[];
  errors: ResolverError[];
}

/**
 * Resolver constructs cross-file relationships from parsed files.
 * Must be called after all files are parsed.
 */
export interface Resolver {
  /**
   * Resolve cross-file relationships from all parsed files.
   *
   * @param parseResults - All file parse results from parser
   * @returns Resolved relationships (IMPORTS, EXPORTS, CALLS, TESTED_BY)
   */
  resolve(parseResults: FileParseResult[]): ResolverResult;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * NodeId uniquely identifies a node within a repository snapshot.
 */
export type NodeId = string;

/**
 * RelationshipId uniquely identifies a relationship.
 */
export type RelationshipId = string;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a valid provenance object.
 */
export function createProvenance(
  commitSha: string,
  extractedBy: string,
  sourceFile?: string,
  sourceLine?: number
): Provenance {
  return {
    commitSha,
    extractedAt: new Date().toISOString(),
    extractedBy,
    sourceFile,
    sourceLine,
  };
}

/**
 * Create a Symbol ID.
 * Format: {filePath}:{name}:{startLine}
 */
export function createSymbolId(filePath: string, name: string, startLine: number): string {
  return `${filePath}:${name}:${startLine}`;
}

/**
 * Create a Test ID.
 * Format: {testFilePath}:{testName}:{startLine?}
 */
export function createTestId(testFilePath: string, testName: string, startLine?: number): string {
  if (startLine !== undefined) {
    return `${testFilePath}:${testName}:${startLine}`;
  }
  return `${testFilePath}:${testName}`;
}

/**
 * Create a TodoMarker ID.
 * Format: {filePath}:{markerType}:{line}
 */
export function createTodoMarkerId(filePath: string, markerType: MarkerType, line: number): string {
  return `${filePath}:${markerType}:${line}`;
}

/**
 * Type guard: check if node is a Symbol.
 */
export function isSymbol(node: Node): node is Symbol {
  return 'symbolId' in node && 'kind' in node;
}

/**
 * Type guard: check if node is a Test.
 */
export function isTest(node: Node): node is Test {
  return 'testId' in node && 'testFramework' in node;
}

/**
 * Type guard: check if node is a File.
 */
export function isFile(node: Node): node is File {
  return 'path' in node && 'language' in node && 'hash' in node;
}

/**
 * Type guard: check if node is a TodoMarker.
 */
export function isTodoMarker(node: Node): node is TodoMarker {
  return 'markerId' in node && 'markerType' in node;
}

/**
 * Type guard: check if relationship is CALLS.
 */
export function isCallsRelationship(rel: Relationship): rel is CallsRelationship {
  return rel.type === 'CALLS';
}

/**
 * Type guard: check if relationship is TESTED_BY.
 */
export function isTestedByRelationship(rel: Relationship): rel is TestedByRelationship {
  return rel.type === 'TESTED_BY';
}

/**
 * Type guard: check if relationship is IMPORTS.
 */
export function isImportsRelationship(rel: Relationship): rel is ImportsRelationship {
  return rel.type === 'IMPORTS';
}

/**
 * Type guard: check if relationship is EXPORTS.
 */
export function isExportsRelationship(rel: Relationship): rel is ExportsRelationship {
  return rel.type === 'EXPORTS';
}
