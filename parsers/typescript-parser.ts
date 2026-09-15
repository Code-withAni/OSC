import {
  Parser,
  FileParseResult,
  File,
  Symbol,
  Test,
  TodoMarker,
  ImportStatement,
  ExportStatement,
  CallExpression,
  ParseError,
  SymbolKind,
  MarkerType,
  TestFramework,
  ExportType,
  CallType,
  createProvenance,
  createSymbolId,
  createTestId,
  createTodoMarkerId
} from '../prototypes/common-model';

/**
 * Simple TypeScript/JavaScript parser for benchmarking
 * Uses regex-based extraction for MVP - would be replaced with proper AST parser in production
 */
export class TypeScriptParser implements Parser {
  public readonly id = "typescript-parser:0.1.0";

  /**
   * Parse a single file and extract file-level structural facts.
   * Does NOT resolve import specifiers or call targets.
   */
  parse(filePath: string, content: string): FileParseResult {
    const errors: ParseError[] = [];

    // Detect language
    const language = this.detectLanguage(filePath);

    // Create file node
    const file: File = {
      path: filePath,
      language,
      hash: this.simpleHash(content),
      size: Buffer.byteLength(content, 'utf8'),
      isTest: this.isTestFile(filePath),
      isGenerated: false,
      provenance: createProvenance("local", this.id, filePath)
    };

    // Extract symbols (functions, classes, etc.)
    const symbols = this.extractSymbols(content, filePath);

    // Extract tests
    const tests = this.extractTests(content, filePath);

    // Extract TODO markers
    const todoMarkers = this.extractTodoMarkers(content, filePath);

    // Extract import statements
    const importStatements = this.extractImportStatements(content, filePath);

    // Extract export statements
    const exportStatements = this.extractExportStatements(content, filePath);

    // Extract call expressions
    const callExpressions = this.extractCallExpressions(content, filePath);

    return {
      file,
      symbols,
      tests,
      todoMarkers,
      importStatements,
      exportStatements,
      callExpressions,
      errors
    };
  }

  private detectLanguage(filePath: string): 'javascript' | 'typescript' | 'unknown' {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      return 'typescript';
    }
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      return 'javascript';
    }
    return 'unknown';
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.(test|spec)\.(js|ts)$/,
      /[\\/](test|spec)[\\/]/,
      /\.(test|spec)\.(js|ts)x?$/
    ];
    return testPatterns.some(pattern => pattern.test(filePath));
  }

  private extractSymbols(content: string, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');

    // Regex patterns for different symbol types
    const functionPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
    const arrowFunctionPattern = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
    const methodPattern = /^(?:\s*)(\w+)\s*\([^)]*\)\s*{/gm;
    const classPattern = /^(?:export\s+)?class\s+(\w+)/gm;
    const interfacePattern = /^(?:export\s+)?interface\s+(\w+)/gm;
    const constPattern = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/gm;
    const enumPattern = /^(?:export\s+)?enum\s+(\w+)/gm;

    // Process each pattern
    this.processPattern(content, functionPattern, 'function', symbols, filePath, lines);
    this.processPattern(content, arrowFunctionPattern, 'const', symbols, filePath, lines); // Treat as const for now
    this.processPattern(content, methodPattern, 'method', symbols, filePath, lines);
    this.processPattern(content, classPattern, 'class', symbols, filePath, lines);
    this.processPattern(content, interfacePattern, 'interface', symbols, filePath, lines);
    this.processPattern(content, constPattern, 'const', symbols, filePath, lines);
    this.processPattern(content, enumPattern, 'enum', symbols, filePath, lines);

    return symbols;
  }

  private processPattern(
    content: string,
    pattern: RegExp,
    kind: SymbolKind,
    symbols: Symbol[],
    filePath: string,
    lines: string[]
  ): void {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      // Find line number
      const lineNum = content.substring(0, match.index).split('\n').length;
      const lineContent = lines[lineNum - 1] || '';

      // Estimate end line (simple heuristic)
      let endLine = lineNum;
      if (kind === 'function' || kind === 'method') {
        // Look for closing brace
        const braceContent = content.substring(match.index);
        const braceMatch = braceContent.match(/^[\s\S]*?(?:\}|$)/m);
        if (braceMatch) {
          const linesInMatch = braceMatch[0].split('\n');
          endLine = lineNum + linesInMatch.length - 1;
        }
      } else {
        // For other symbols, assume single line
        endLine = lineNum;
      }

      const symbol: Symbol = {
        symbolId: createSymbolId(filePath, name, lineNum),
        name,
        kind,
        filePath,
        startLine: lineNum,
        endLine,
        isExported: false, // Will be set by resolver
        provenance: createProvenance("local", this.id, filePath, lineNum)
      };

      symbols.push(symbol);
    }
  }

  private extractTests(content: string, filePath: string): Test[] {
    const tests: Test[] = [];
    const lines = content.split('\n');

    // Patterns for test detection
    const testFnPattern = /^(?:it|test)\s*\(\s*['"]([^'"]+)['"]/gm;
    const describePattern = /^(?:describe)\s*\(\s*['"]([^'"]+)['"]/gm;

    let testFramework: TestFramework = 'unknown';
    if (content.includes('jest') || content.includes('describe')) testFramework = 'jest';
    else if (content.includes('mocha')) testFramework = 'mocha';
    else if (content.includes('vitest')) testFramework = 'vitest';

    // Extract test functions
    let match;
    while ((match = testFnPattern.exec(content)) !== null) {
      const testName = match[1];
      const lineNum = content.substring(0, match.index).split('\n').length;

      const test: Test = {
        testId: createTestId(filePath, testName, lineNum),
        testName,
        testFilePath: filePath,
        testFramework,
        startLine: lineNum,
        endLine: lineNum,
        provenance: createProvenance("local", this.id, filePath, lineNum)
      };

      tests.push(test);
    }

    // Also treat the whole file as a test if it's a test file
    if (this.isTestFile(filePath)) {
      const fileTest: Test = {
        testId: createTestId(filePath, `${filePath} (file)`, 1),
        testName: `${filePath} (file)`,
        testFilePath: filePath,
        testFramework,
        startLine: 1,
        endLine: lines.length,
        provenance: createProvenance("local", this.id, filePath, 1)
      };
      tests.push(fileTest);
    }

    return tests;
  }

  private extractTodoMarkers(content: string, filePath: string): TodoMarker[] {
    const markers: TodoMarker[] = [];
    const lines = content.split('\n');

    const todoPattern = /\/\/\s*(TODO|FIXME|HACK|XXX|NOTE):?\s*(.*)/gm;

    let match;
    while ((match = todoPattern.exec(content)) !== null) {
      const typeStr = match[1] as MarkerType;
      const text = match[2].trim();
      const lineNum = content.substring(0, match.index).split('\n').length + 1;

      const marker: TodoMarker = {
        markerId: createTodoMarkerId(filePath, typeStr, lineNum),
        text: match[0], // Full comment
        markerType: typeStr,
        filePath,
        line: lineNum,
        provenance: createProvenance("local", this.id, filePath, lineNum)
      };

      markers.push(marker);
    }

    return markers;
  }

  private extractImportStatements(content: string, filePath: string): ImportStatement[] {
    const imports: ImportStatement[] = [];
    const lines = content.split('\n');

    // ES6 imports
    const es6ImportPattern = /^import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/gm;
    // CommonJS requires
    const requirePattern = /^(?:const|let|var)\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

    let match;
    while ((match = es6ImportPattern.exec(content)) !== null) {
      let importedNames: string[] = [];
      if (match[1]) { // Named imports: import { foo, bar } from './utils'
        importedNames = match[1]
          .split(',')
          .map(name => name.trim())
          .filter(name => name.length > 0);
      } else if (match[2]) { // Namespace import: import * as utils from './utils'
        importedNames = [match[2]];
      } else if (match[3]) { // Default import: import foo from './utils'
        importedNames = [match[3]];
      }

      const specifier = match[4];
      const lineNum = content.substring(0, match.index).split('\n').length + 1;

      const imp: ImportStatement = {
        specifier,
        importedNames,
        line: lineNum
      };

      imports.push(imp);
    }

    // CommonJS
    while ((match = requirePattern.exec(content)) !== null) {
      let importedNames: string[] = [];
      if (match[1]) { // Destructuring: const { foo, bar } = require('./utils')
        importedNames = match[1]
          .split(',')
          .map(name => name.trim())
          .filter(name => name.length > 0);
      } else if (match[2]) { // Namespace: const * as utils = require('./utils')
        importedNames = [match[2]];
      } else if (match[3]) { // Direct: const utils = require('./utils')
        importedNames = [match[3]];
      }

      const specifier = match[4];
      const lineNum = content.substring(0, match.index).split('\n').length + 1;

      const imp: ImportStatement = {
        specifier,
        importedNames,
        line: lineNum
      };

      imports.push(imp);
    }

    return imports;
  }

  private extractExportStatements(content: string, filePath: string): ExportStatement[] {
    const exports: ExportStatement[] = [];
    const lines = content.split('\n');

    // Named exports: export { foo, bar }
    const namedExportPattern = /^export\s+\{[^}]+\}/gm;
    // Export declaration: export function foo() {}
    const exportDeclPattern = /^export\s+(?:function|class|const|let|var|interface|class)\s+(\w+)/gm;
    // Export assignment: export default function foo() {}
    const exportDefaultPattern = /^export\s+default\s+(?:function|class)\s+(\w+)/gm;
    // Export statement: export { foo } from './utils'
    const exportFromPattern = /^export\s+\{[^}]+\}\s+from\s+['"]([^'"]+)['"]/gm;

    let match;
    while ((match = namedExportPattern.exec(content)) !== null) {
      // Extract names from { foo, bar }
      const namesMatch = match[0].match(/\{([^}]+)\}/);
      if (namesMatch) {
        const names = namesMatch[1]
          .split(',')
          .map(name => name.trim())
          .filter(name => name.length > 0);

        for (const name of names) {
          const lineNum = content.substring(0, match.index).split('\n').length + 1;
          const exp: ExportStatement = {
            symbolName: name,
            exportType: 'named',
            line: lineNum
          };
          exports.push(exp);
        }
      }
    }

    // Export declarations
    while ((match = exportDeclPattern.exec(content)) !== null) {
      const symbolName = match[1];
      const lineNum = content.substring(0, match.index).split('\n').length + 1;
      const exp: ExportStatement = {
        symbolName,
        exportType: 'named',
        line: lineNum
      };
      exports.push(exp);
    }

    // Export default
    while ((match = exportDefaultPattern.exec(content)) !== null) {
      const symbolName = match[1];
      const lineNum = content.substring(0, match.index).split('\n').length + 1;
      const exp: ExportStatement = {
        symbolName,
        exportType: 'default',
        line: lineNum
      };
      exports.push(exp);
    }

    // Export from (re-export)
    while ((match = exportFromPattern.exec(content)) !== null) {
      // For re-exports, we'd need to parse the source file to get actual symbol names
      // For MVP, we'll skip detailed parsing of re-exports
      const lineNum = content.substring(0, match.index).split('\n').length + 1;
      // We could extract the specifier and treat it as needing resolution
      // But for now, we'll just note that there's an export from statement
    }

    return exports;
  }

  private extractCallExpressions(content: string, filePath: string): CallExpression[] {
    const calls: CallExpression[] = [];
    const lines = content.split('\n');

    // Simple function call pattern: foo() or obj.method()
    const callPattern = /(\w+(?:\.\w+)+)\s*\(/gm;
    // Simple identifier call: foo()
    const simpleCallPattern = /(?:\b|[^\w$])(\w+)\s*\(/gm;

    let match;
    while ((match = simpleCallPattern.exec(content)) !== null) {
      // Make sure we're not matching keywords like 'if', 'for', 'function'
      const calledName = match[1];
      if (['if', 'for', 'while', 'function', 'return', 'class', 'const', 'let', 'var'].includes(calledName)) {
        continue;
      }

      const lineNum = content.substring(0, match.index).split('\n').length + 1;

      // Determine call type
      let callType: CallType = 'direct';
      const fullMatch = match[0];
      if (fullMatch.includes('.')) {
        callType = 'method';
      }

      const call: CallExpression = {
        calledName,
        callType,
        line: lineNum
      };

      calls.push(call);
    }

    return calls;
  }
}