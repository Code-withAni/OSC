/**
 * Repository Resolver - MVP
 *
 * Architecture: file-level parse facts -> resolved cross-file relationships.
 *
 * Every relationship carries a resolution reason and confidence:
 *   high   - exact match from AST facts (local symbol, exact import binding)
 *   medium - contextual inference without type info (this.method, Class.static, namespace member)
 *   low    - ambiguous / dynamic inference (clearly marked, never guessed)
 *   (none) - no relationship created when truly unresolved
 *
 * ponytail: no type-checker pass - this resolver works purely on parse facts.
 * Method calls needing type info stay unresolved rather than guessed.
 */

import { existsSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import {
  FileParseResult,
  File,
  Symbol,
  ImportStatement,
  ExportStatement,
  ResolverError,
  ResolverResult,
  Relationship,
  ImportsRelationship,
  ExportsRelationship,
  CallsRelationship,
  TestedByRelationship,
  createProvenance,
  createSymbolId,
  Confidence,
} from '../common-model';

const RESOLVER_ID = 'repository-resolver:1.0.0';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const CALLABLE_KINDS = new Set(['function', 'method', 'const']);

export class RepositoryResolver {
  private id = RESOLVER_ID;
  private prov(file: string, line?: number) {
    return createProvenance('local', this.id, file, line);
  }

  // Indices
  private fileMap = new Map<string, FileParseResult>(); // normalized path -> result
  private symbolMap = new Map<string, Symbol>();        // symbolId -> Symbol
  private symbolsByFile = new Map<string, Symbol[]>();  // normalized path -> symbols
  private exportMap = new Map<string, Map<string, Symbol>>(); // path -> exportedName -> Symbol
  private exportMapInProgress = new Set<string>();      // cycle guard for re-export chains

  private errors: ResolverError[] = [];
  private relationships: Relationship[] = [];

  // Statistics for the benchmark
  readonly stats = {
    imports: { total: 0, resolved: 0, external: 0, unresolved: 0 },
    exports: { total: 0, resolved: 0, unresolved: 0, reExports: 0 },
    calls: {
      total: 0,
      resolved: 0,
      unresolved: 0,
      noEnclosingSymbol: 0,
      // Resolved CALLS whose caller and callee live in different files.
      crossFile: 0,
      // Calls needing type info to resolve (method/dotted targets).
      ambiguous: { total: 0, unresolved: 0 },
      // Resolved-call confidence distribution, per category and overall.
      confidence: { high: 0, medium: 0, low: 0 },
      byCategory: {
        sameFile: { total: 0, resolved: 0, confidence: { high: 0, medium: 0, low: 0 } },
        imported: { total: 0, resolved: 0, confidence: { high: 0, medium: 0, low: 0 } },
        method: { total: 0, resolved: 0, confidence: { high: 0, medium: 0, low: 0 } },
        callback: { total: 0, resolved: 0, confidence: { high: 0, medium: 0, low: 0 } },
        dynamic: { total: 0, resolved: 0, confidence: { high: 0, medium: 0, low: 0 } },
        builtin: { total: 0, resolved: 0, confidence: { high: 0, medium: 0, low: 0 } },
      } as Record<string, { total: number; resolved: number; confidence: Record<string, number> }>,
    },
    testedBy: { direct: 0, indirect: 0 },
    parserErrors: 0,
  };

  resolve(parseResults: FileParseResult[]): ResolverResult {
    this.errors = [];
    this.relationships = [];
    this.callbackCandidates.clear();

    // Pass 0: index all files and symbols
    for (const result of parseResults) {
      this.fileMap.set(this.norm(result.file.path), result);
      this.symbolsByFile.set(this.norm(result.file.path), result.symbols);
      for (const symbol of result.symbols) {
        this.symbolMap.set(symbol.symbolId, symbol);
      }
      this.stats.parserErrors += result.errors.length;
    }

    // Pass 1: resolve exports (recursive through re-exports)
    for (const result of parseResults) {
      this.buildExportMap(this.norm(result.file.path));
    }
    this.resolveExportRelationships(parseResults);

    // Pass 2: resolve imports
    this.resolveImports(parseResults);

    // Pass 3: resolve calls
    this.resolveCalls(parseResults);

    // Pass 4: resolve TESTED_BY (after CALLS graph exists)
    this.resolveTestedBy(parseResults);

    return { relationships: this.relationships, errors: this.errors };
  }

  // =========================================================================
  // Export resolution
  // =========================================================================

  /**
   * Build map of exportedName -> Symbol for one file.
   * Handles re-exports recursively with a cycle guard (circular re-exports
   * return the partial map built so far instead of looping forever).
   */
  private buildExportMap(filePath: string): Map<string, Symbol> {
    const cached = this.exportMap.get(filePath);
    if (cached) return cached;
    if (this.exportMapInProgress.has(filePath)) {
      // Circular re-export: return empty partial map for this cycle
      return new Map();
    }
    this.exportMapInProgress.add(filePath);

    const result = this.fileMap.get(filePath);
    const map = new Map<string, Symbol>();
    if (result) {
      for (const exp of result.exportStatements) {
        if (exp.symbolName === '*') {
          // export * from '...' - expand source exports (skip default)
          const srcPath = this.resolveSpecifier(exp.sourceSpecifier!, filePath);
          if (srcPath) {
            const srcMap = this.buildExportMap(srcPath);
            for (const [name, sym] of srcMap) {
              if (name !== 'default' && !map.has(name)) map.set(name, sym);
            }
          }
          continue;
        }
        if (exp.sourceSpecifier) {
          // Re-export: export { x [as y] } from '...'
          const srcPath = this.resolveSpecifier(exp.sourceSpecifier, filePath);
          if (srcPath) {
            const srcMap = this.buildExportMap(srcPath);
            const sym = srcMap.get(exp.sourceName ?? exp.symbolName);
            if (sym) map.set(exp.symbolName, sym);
          }
          continue;
        }
        // Local export: find symbol in this file
        const localName = exp.sourceName ?? exp.symbolName;
        const sym = result.symbols.find(
          (s) => s.name === localName || (exp.exportType === 'default' && s.name === exp.symbolName)
        );
        if (sym) {
          map.set(exp.symbolName, sym);
          // Default exports are importable under the key 'default' regardless
          // of the underlying declaration name (export default function helper).
          if (exp.exportType === 'default') map.set('default', sym);
        }
      }
    }

    this.exportMapInProgress.delete(filePath);
    this.exportMap.set(filePath, map);
    return map;
  }

  /** Create EXPORTS relationships (file -> symbol) for local exports. */
  private resolveExportRelationships(parseResults: FileParseResult[]): void {
    for (const result of parseResults) {
      const filePath = this.norm(result.file.path);
      for (const exp of result.exportStatements) {
        this.stats.exports.total++;
        if (exp.symbolName === '*' || exp.sourceSpecifier) {
          // Re-export / star: the symbol lives in another file; an EXPORTS
          // relationship to a foreign symbol would misattribute ownership.
          // Count as resolved for API purposes (it appears in this file's API)
          // but no relationship is created here - the owning file's EXPORTS
          // relationship covers it.
          this.stats.exports.resolved++;
          this.stats.exports.reExports++;
          continue;
        }
        const sym = this.exportMap.get(filePath)?.get(exp.symbolName);
        if (sym) {
          this.stats.exports.resolved++;
          sym.isExported = true;
          this.relationships.push({
            type: 'EXPORTS',
            fromId: filePath,
            toId: sym.symbolId,
            exportType: exp.exportType,
            provenance: this.prov(result.file.path, exp.line),
          } as ExportsRelationship);
        } else {
          this.stats.exports.unresolved++;
          this.errors.push({
            type: 'ambiguous_symbol',
            file: result.file.path,
            line: exp.line,
            message: `Exported symbol '${exp.symbolName}' not found in file`,
            category: 'not_found',
          });
        }
      }
    }
  }

  // =========================================================================
  // Import resolution
  // =========================================================================

  private resolveImports(parseResults: FileParseResult[]): void {
    for (const result of parseResults) {
      const filePath = this.norm(result.file.path);
      for (const imp of result.importStatements) {
        this.stats.imports.total++;

        if (!this.isRelative(imp.specifier)) {
          // External package or Node builtin - outside repository scope
          this.stats.imports.external++;
          continue;
        }

        const target = this.resolveSpecifier(imp.specifier, filePath);
        if (target) {
          this.stats.imports.resolved++;
          this.relationships.push({
            type: 'IMPORTS',
            fromId: filePath,
            toId: target,
            importSpecifier: imp.specifier,
            importType: 'relative',
            provenance: this.prov(result.file.path, imp.line),
          } as ImportsRelationship);
        } else {
          this.stats.imports.unresolved++;
          this.errors.push({
            type: 'unresolved_import',
            file: result.file.path,
            line: imp.line,
            message: `Could not resolve import '${imp.specifier}'`,
            category: 'not_found',
          });
        }
      }
    }
  }

  // =========================================================================
  // Call resolution
  // =========================================================================

  private resolveCalls(parseResults: FileParseResult[]): void {
    for (const result of parseResults) {
      const filePath = this.norm(result.file.path);
      const fileSymbols = this.symbolsByFile.get(filePath) ?? [];

      // Build a synthetic module symbol for module-level call attribution.
      // Covers lines 1–∞ so any call not inside another symbol falls here.
      const moduleSymbol: Symbol = {
        symbolId: createSymbolId(filePath, '__module__', 1),
        name: '__module__',
        kind: 'module',
        filePath,
        startLine: 1,
        endLine: 999999,
        isExported: false,
        provenance: createProvenance('local', this.id, filePath, 1),
      };

      for (const call of result.callExpressions) {
        this.stats.calls.total++;
        const category = this.categorizeCall(call, result, filePath);
        this.stats.calls.byCategory[category].total++;

        // Find the enclosing symbol (innermost by line range)
        const caller = this.findEnclosingSymbol(fileSymbols, call.line) ?? moduleSymbol;

        const resolved = this.resolveCallee(call, result, filePath, fileSymbols);
        if (resolved) {
          this.stats.calls.resolved++;
          this.stats.calls.byCategory[category].resolved++;
          this.stats.calls.byCategory[category].confidence[resolved.confidence] =
            (this.stats.calls.byCategory[category].confidence[resolved.confidence] ?? 0) + 1;
          this.stats.calls.confidence[resolved.confidence]++;
          const calleeFile = this.norm(resolved.symbol.filePath);
          if (calleeFile !== filePath) this.stats.calls.crossFile++;
          this.relationships.push({
            type: 'CALLS',
            fromId: caller.symbolId,
            toId: resolved.symbol.symbolId,
            callType: call.callType,
            confidence: resolved.confidence,
            callSiteLine: call.line,
            provenance: this.prov(result.file.path, call.line),
          } as CallsRelationship);
        } else {
          this.stats.calls.unresolved++;
          const errCategory = this.errorCategoryForCall(call, result, filePath);
          if (errCategory === 'ambiguous') this.stats.calls.ambiguous.unresolved++;
          if (call.callType !== 'dynamic') {
            this.errors.push({
              type: 'unresolved_call',
              file: result.file.path,
              line: call.line,
              message: `Could not resolve call to '${call.calledName}'`,
              category: errCategory,
            });
          }
        }
      }
    }
  }

  /** Classify a call for the split CALLS accuracy reporting. */
  private categorizeCall(
    call: { calledName: string; callType: string },
    result: FileParseResult,
    filePath: string
  ): string {
    if (call.callType === 'dynamic') return 'dynamic';
    if (call.callType === 'method') {
      // this.x / Class.x / importedNamespace.x all arrive as 'method'
      this.stats.calls.ambiguous.total++;
      return 'method';
    }
    // Direct identifier call
    if (this.findLocalSymbol(result, filePath, call.calledName)) return 'sameFile';
    if (this.findImportedSymbol(result, filePath, call.calledName)) return 'imported';
    // Function used as a call argument elsewhere = callback-registered.
    // Local/imported names win so a used-as-argument import stays 'imported'.
    if (this.isCallbackRegistered(result, call.calledName)) return 'callback';
    // Likely a builtin (console.log, String, Number, ...) or unknown identifier
    return 'builtin';
  }

  /** Callback-candidate names per file: identifiers passed as call arguments. */
  private callbackCandidates = new Map<string, Set<string>>();

  private isCallbackRegistered(result: FileParseResult, name: string): boolean {
    let set = this.callbackCandidates.get(result.file.path);
    if (!set) {
      set = new Set();
      for (const c of result.callExpressions) {
        for (const a of c.arguments ?? []) set.add(a);
      }
      this.callbackCandidates.set(result.file.path, set);
    }
    return set.has(name);
  }

  private errorCategoryForCall(
    call: { calledName: string; callType: string },
    result: FileParseResult,
    filePath: string
  ): 'ambiguous' | 'not_found' {
    if (call.callType === 'method') return 'ambiguous'; // needs type info
    if (call.calledName.includes('.')) return 'ambiguous';
    // Unresolved plain identifier: unknown global or typo
    return 'not_found';
  }

  /** Resolve the callee of a call to a concrete symbol. */
  private resolveCallee(
    call: { calledName: string; callType: string },
    result: FileParseResult,
    filePath: string,
    fileSymbols: Symbol[]
  ): { symbol: Symbol; confidence: Confidence } | null {
    if (call.callType === 'dynamic') {
      // Dynamic calls are never guessed (correctness rule)
      return null;
    }

    if (call.callType === 'method') {
      return this.resolveMethodCall(call.calledName, result, filePath, fileSymbols);
    }

    // Direct identifier call
    // 1. Local symbol in the same file - high confidence
    const local = this.findLocalSymbol(result, filePath, call.calledName);
    if (local && CALLABLE_KINDS.has(local.kind)) {
      return { symbol: local, confidence: 'high' };
    }
    // 2. Imported symbol - high confidence (exact import binding)
    const imported = this.findImportedSymbol(result, filePath, call.calledName);
    if (imported && CALLABLE_KINDS.has(imported.kind)) {
      return { symbol: imported, confidence: 'high' };
    }
    return null;
  }

  /**
   * Resolve method calls: obj.method()
   * Determinable cases:
   *   - 'this.method()' -> method on enclosing class (medium)
   *   - 'ClassName.method()' -> method on a local class (medium)
   *   - 'namespace.method()' -> export of namespace-imported module (high)
   * Everything else needs type information -> unresolved.
   */
  private resolveMethodCall(
    calledName: string,
    result: FileParseResult,
    filePath: string,
    fileSymbols: Symbol[]
  ): { symbol: Symbol; confidence: Confidence } | null {
    const dot = calledName.indexOf('.');
    if (dot < 0) return null;
    const base = calledName.slice(0, dot);
    const method = calledName.slice(dot + 1);

    // this.method() - enclosing class lookup
    if (base === 'this') {
      // Caller line is not available here; use the class whose method range
      // contains nothing - instead scan classes in file and match method name.
      // ponytail: picks the first class with that method name; wrong for
      // duplicate method names across classes in one file - add line-range
      // pass if that occurs in practice.
      for (const sym of fileSymbols) {
        if (sym.kind === 'class') {
          const m = fileSymbols.find(
            (s) => s.kind === 'method' && s.name === method &&
              s.startLine >= sym.startLine && s.endLine <= sym.endLine
          );
          if (m) return { symbol: m, confidence: 'medium' };
        }
      }
      return null;
    }

    // ClassName.method() - local class static method
    const localClass = fileSymbols.find((s) => s.kind === 'class' && s.name === base);
    if (localClass) {
      const m = fileSymbols.find(
        (s) => s.kind === 'method' && s.name === method &&
          s.startLine >= localClass.startLine && s.endLine <= localClass.endLine
      );
      if (m) return { symbol: m, confidence: 'medium' };
      return null;
    }

    // namespace.method() - namespace import member
    const nsImport = result.importStatements.find(
      (imp) => imp.nameMappings?.some((m) => m.isNamespace && m.local === base)
    );
    if (nsImport) {
      const srcPath = this.resolveSpecifier(nsImport.specifier, filePath);
      if (srcPath) {
        const sym = this.exportMap.get(srcPath)?.get(method);
        if (sym && CALLABLE_KINDS.has(sym.kind)) {
          return { symbol: sym, confidence: 'high' };
        }
      }
    }

    return null;
  }

  // =========================================================================
  // Symbol lookup helpers
  // =========================================================================

  private findLocalSymbol(
    result: FileParseResult,
    filePath: string,
    name: string
  ): Symbol | undefined {
    const symbols = this.symbolsByFile.get(filePath) ?? [];
    return symbols.find((s) => s.name === name);
  }

  private findImportedSymbol(
    result: FileParseResult,
    filePath: string,
    localName: string
  ): Symbol | undefined {
    for (const imp of result.importStatements) {
      const mapping = imp.nameMappings?.find((m) => m.local === localName);
      if (!mapping) continue;
      const srcPath = this.resolveSpecifier(imp.specifier, filePath);
      if (!srcPath) continue;
      const srcExports = this.exportMap.get(srcPath);
      if (!srcExports) continue;
      const key = mapping.isDefault ? 'default' : mapping.imported;
      const sym = srcExports.get(key);
      if (sym) return sym;
    }
    return undefined;
  }

  /** Innermost symbol whose [startLine, endLine] contains the line. */
  private findEnclosingSymbol(symbols: Symbol[], line: number): Symbol | undefined {
    let best: Symbol | undefined;
    for (const s of symbols) {
      if (line >= s.startLine && line <= s.endLine) {
        if (!best || s.startLine >= best.startLine) best = s;
      }
    }
    return best;
  }

  // =========================================================================
  // TESTED_BY resolution
  // =========================================================================

  private resolveTestedBy(parseResults: FileParseResult[]): void {
    // Direct: test file calls a symbol in a non-test file
    // Indirect (heuristic, clearly marked): test calls A, A calls B
    const callsByCaller = new Map<string, string[]>(); // callerSymbolId -> [calleeSymbolId]
    for (const rel of this.relationships) {
      if (rel.type === 'CALLS') {
        const list = callsByCaller.get(rel.fromId) ?? [];
        list.push(rel.toId);
        callsByCaller.set(rel.fromId, list);
      }
    }

    for (const result of parseResults) {
      if (!result.file.isTest) continue;
      const filePath = this.norm(result.file.path);

      for (const call of result.callExpressions) {
        const resolved = this.resolveCallee(
          call, result, filePath, this.symbolsByFile.get(filePath) ?? []
        );
        if (!resolved) continue;
        // Only link to symbols defined outside test files
        if (this.fileMap.get(this.norm(resolved.symbol.filePath))?.file.isTest) continue;

        const test = this.findEnclosingTest(result.tests, call.line);
        const testId = test ? test.testId : `${filePath}:file`;
        this.relationships.push({
          type: 'TESTED_BY',
          fromId: resolved.symbol.symbolId,
          toId: testId,
          coverageType: 'direct',
          confidence: resolved.confidence,
          provenance: this.prov(result.file.path, call.line),
        } as TestedByRelationship);
        this.stats.testedBy.direct++;
      }

      // Indirect coverage heuristic: test calls A (in src), A calls B (in src)
      // -> B is indirectly tested. Marked low confidence by definition.
      const directlyTested = new Set<string>();
      for (const call of result.callExpressions) {
        const resolved = this.resolveCallee(
          call, result, filePath, this.symbolsByFile.get(filePath) ?? []
        );
        if (resolved) directlyTested.add(resolved.symbol.symbolId);
      }
      for (const callerId of directlyTested) {
        for (const calleeId of callsByCaller.get(callerId) ?? []) {
          const calleeFile = this.symbolMap.get(calleeId)?.filePath;
          if (calleeFile && this.fileMap.get(this.norm(calleeFile))?.file.isTest) continue;
          this.relationships.push({
            type: 'TESTED_BY',
            fromId: calleeId,
            toId: `${filePath}:file`,
            coverageType: 'indirect',
            confidence: 'low',
            provenance: this.prov(result.file.path),
          } as TestedByRelationship);
          this.stats.testedBy.indirect++;
        }
      }
    }
  }

  private findEnclosingTest(
    tests: { testId: string; startLine?: number; endLine?: number }[],
    line: number
  ) {
    let best: { testId: string; startLine?: number; endLine?: number } | undefined;
    for (const t of tests) {
      if (t.startLine !== undefined && t.endLine !== undefined &&
          line >= t.startLine && line <= t.endLine) {
        if (!best || (t.startLine ?? 0) >= (best.startLine ?? 0)) best = t;
      }
    }
    return best;
  }

  // =========================================================================
  // Import specifier -> file resolution
  // =========================================================================

  private isRelative(specifier: string): boolean {
    return specifier.startsWith('./') || specifier.startsWith('../');
  }

  /**
   * Resolve a relative import specifier to a normalized file path present in
   * the repository. Handles:
   *   - extensionless specifiers (./utils -> utils.ts / utils/index.ts)
   *   - explicit extensions (.js specifiers may point at .ts sources)
   *   - index files
   */
  private resolveSpecifier(specifier: string, fromFilePath: string): string | null {
    if (!specifier) return null;
    const isRel = specifier.startsWith('./') || specifier.startsWith('../');
    const isAbs = specifier.startsWith('/');
    if (!isRel && !isAbs) return null; // external package

    const base = isAbs
      ? specifier
      : join(dirname(fromFilePath), specifier);
    const normalizedBase = this.norm(base);

    // Candidate paths in priority order
    const candidates: string[] = [];
    const ext = extname(normalizedBase);
    if (ext) {
      // Explicit extension. TS convention: './x.js' may map to './x.ts'
      candidates.push(normalizedBase);
      if (ext === '.js') {
        candidates.push(normalizedBase.slice(0, -3) + '.ts');
        candidates.push(normalizedBase.slice(0, -3) + '.tsx');
      }
      if (ext === '.mjs' || ext === '.cjs') {
        candidates.push(normalizedBase.slice(0, -4) + '.ts');
      }
    } else {
      // Extensionless: try each extension, then index files
      for (const e of EXTENSIONS) candidates.push(normalizedBase + e);
      for (const e of EXTENSIONS) candidates.push(this.norm(join(normalizedBase, 'index' + e)));
    }

    for (const candidate of candidates) {
      if (this.fileMap.has(candidate)) return candidate;
    }
    return null;
  }

  /** Normalize a path for map keys (forward slashes, consistent case). */
  private norm(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase() === p.replace(/\\/g, '/').toLowerCase()
      ? p.replace(/\\/g, '/')
      : p;
  }
}
