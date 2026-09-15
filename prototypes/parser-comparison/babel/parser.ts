import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { readFileSync } from 'fs';
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
  TestFramework,
  ExportType,
  CallType,
  createProvenance,
  createSymbolId,
  createTestId,
  createTodoMarkerId
} from '../../common-model';

/**
 * Babel Parser
 * Uses Babel for JavaScript/TypeScript parsing
 */
export class BabelParser implements Parser {
  public readonly id = "babel-parser:1.0.0";

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

    const symbols: Symbol[] = [];
    const tests: Test[] = [];
    const todoMarkers: TodoMarker[] = [];
    const importStatements: ImportStatement[] = [];
    const exportStatements: ExportStatement[] = [];
    const callExpressions: CallExpression[] = [];

    try {
      // Parse with Babel
      const ast = parse(content, {
        sourceType: 'module',
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'dynamicImport'
        ],
        errorRecovery: true
      });

      // Extract TODO markers from comments
      if (ast.comments) {
        ast.comments.forEach(comment => {
          const todoMatch = comment.value.match(/\s*(TODO|FIXME|HACK|XXX|NOTE):?\s*(.+)/);
          if (todoMatch) {
            const line = comment.loc?.start.line || 0;
            todoMarkers.push({
              markerId: createTodoMarkerId(filePath, todoMatch[1] as any, line),
              text: `//${comment.value.trim()}`,
              markerType: todoMatch[1] as any,
              filePath,
              line,
              provenance: createProvenance("local", this.id, filePath, line)
            });
          }
        });
      }

      // Traverse AST
      traverse(ast, {
        // Function declarations
        FunctionDeclaration: (path) => {
          if (path.node.id) {
            symbols.push({
              symbolId: createSymbolId(filePath, path.node.id.name, path.node.loc?.start.line || 0),
              name: path.node.id.name,
              kind: 'function',
              filePath,
              startLine: path.node.loc?.start.line || 0,
              endLine: path.node.loc?.end.line || 0,
              isExported: false,
              provenance: createProvenance("local", this.id, filePath, path.node.loc?.start.line)
            });
          }
        },

        // Class declarations
        ClassDeclaration: (path) => {
          if (path.node.id) {
            symbols.push({
              symbolId: createSymbolId(filePath, path.node.id.name, path.node.loc?.start.line || 0),
              name: path.node.id.name,
              kind: 'class',
              filePath,
              startLine: path.node.loc?.start.line || 0,
              endLine: path.node.loc?.end.line || 0,
              isExported: false,
              provenance: createProvenance("local", this.id, filePath, path.node.loc?.start.line)
            });

            // Extract methods
            path.node.body.body.forEach(member => {
              if (member.type === 'ClassMethod' && member.key.type === 'Identifier') {
                const methodName = member.kind === 'constructor' ? 'constructor' : member.key.name;
                symbols.push({
                  symbolId: createSymbolId(filePath, methodName, member.loc?.start.line || 0),
                  name: methodName,
                  kind: 'method',
                  filePath,
                  startLine: member.loc?.start.line || 0,
                  endLine: member.loc?.end.line || 0,
                  isExported: false,
                  provenance: createProvenance("local", this.id, filePath, member.loc?.start.line)
                });
              }
            });
          }
        },

        // Method signatures in .d.ts files (TSDeclareMethod, not ClassMethod)
        TSDeclareMethod: (path) => {
          if (path.node.key.type === 'Identifier') {
            const methodName = path.node.kind === 'constructor' ? 'constructor' : path.node.key.name;
            symbols.push({
              symbolId: createSymbolId(filePath, methodName, path.node.loc?.start.line || 0),
              name: methodName,
              kind: 'method',
              filePath,
              startLine: path.node.loc?.start.line || 0,
              endLine: path.node.loc?.end.line || 0,
              isExported: false,
              provenance: createProvenance("local", this.id, filePath, path.node.loc?.start.line)
            });
          }
        },

        // Interface/Type declarations (TypeScript)
        TSInterfaceDeclaration: (path) => {
          symbols.push({
            symbolId: createSymbolId(filePath, path.node.id.name, path.node.loc?.start.line || 0),
            name: path.node.id.name,
            kind: 'interface',
            filePath,
            startLine: path.node.loc?.start.line || 0,
            endLine: path.node.loc?.end.line || 0,
            isExported: false,
            provenance: createProvenance("local", this.id, filePath, path.node.loc?.start.line)
          });
        },

        // Enum declarations
        TSEnumDeclaration: (path) => {
          symbols.push({
            symbolId: createSymbolId(filePath, path.node.id.name, path.node.loc?.start.line || 0),
            name: path.node.id.name,
            kind: 'enum',
            filePath,
            startLine: path.node.loc?.start.line || 0,
            endLine: path.node.loc?.end.line || 0,
            isExported: false,
            provenance: createProvenance("local", this.id, filePath, path.node.loc?.start.line)
          });
        },

        // Variable declarations (const/let/var with function values)
        VariableDeclaration: (path) => {
          // Only module-level variables are symbols; function-local variables are not
          if (path.getFunctionParent() !== null) return;
          path.node.declarations.forEach(decl => {
            if (decl.id.type === 'Identifier') {
              const isFunctionLike = decl.init &&
                (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression');
              symbols.push({
                symbolId: createSymbolId(filePath, decl.id.name, decl.loc?.start.line || 0),
                name: decl.id.name,
                kind: isFunctionLike ? 'function' : 'const',
                filePath,
                startLine: decl.loc?.start.line || 0,
                endLine: decl.loc?.end.line || 0,
                isExported: false,
                provenance: createProvenance("local", this.id, filePath, decl.loc?.start.line)
              });
            }
          });
        },

        // Import declarations
        ImportDeclaration: (path) => {
          const importedNames: string[] = [];
          path.node.specifiers.forEach(spec => {
            if (spec.type === 'ImportDefaultSpecifier') {
              importedNames.push(spec.local.name);
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              importedNames.push(spec.local.name);
            } else if (spec.type === 'ImportSpecifier') {
              importedNames.push(spec.local.name);
            }
          });
          importStatements.push({
            specifier: path.node.source.value,
            importedNames,
            line: path.node.loc?.start.line || 0
          });
        },

        // Export declarations
        ExportNamedDeclaration: (path) => {
          if (path.node.declaration) {
            if (path.node.declaration.type === 'FunctionDeclaration' && path.node.declaration.id) {
              exportStatements.push({
                symbolName: path.node.declaration.id.name,
                exportType: 'named',
                line: path.node.loc?.start.line || 0
              });
            } else if (path.node.declaration.type === 'ClassDeclaration' && path.node.declaration.id) {
              exportStatements.push({
                symbolName: path.node.declaration.id.name,
                exportType: 'named',
                line: path.node.loc?.start.line || 0
              });
            } else if (path.node.declaration.type === 'VariableDeclaration') {
              path.node.declaration.declarations.forEach(decl => {
                if (decl.id.type === 'Identifier') {
                  exportStatements.push({
                    symbolName: decl.id.name,
                    exportType: 'named',
                    line: path.node.loc?.start.line || 0
                  });
                }
              });
            } else if (path.node.declaration.type === 'TSInterfaceDeclaration') {
              exportStatements.push({
                symbolName: path.node.declaration.id.name,
                exportType: 'named',
                line: path.node.loc?.start.line || 0
              });
            }
          } else if (path.node.specifiers && path.node.specifiers.length > 0) {
            // Export list: export { a, b as c } [from '...']
            path.node.specifiers.forEach(spec => {
              if (spec.type === 'ExportSpecifier') {
                // Report the exported (possibly aliased) name
                exportStatements.push({
                  symbolName: spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value,
                  exportType: 'named',
                  line: path.node.loc?.start.line || 0
                });
              }
            });
          }
        },

        ExportDefaultDeclaration: (path) => {
          exportStatements.push({
            symbolName: 'default',
            exportType: 'default',
            line: path.node.loc?.start.line || 0
          });
        },

        // Call expressions
        CallExpression: (path) => {
          const calledName = this.getCallName(path.node.callee);
          if (calledName) {
            callExpressions.push({
              calledName,
              callType: this.getCallType(path.node.callee),
              line: path.node.loc?.start.line || 0
            });

            // Check for test calls
            if (['it', 'test', 'describe'].includes(calledName) && path.node.arguments.length > 0) {
              const firstArg = path.node.arguments[0];
              if (firstArg.type === 'StringLiteral') {
                tests.push({
                  testId: createTestId(filePath, firstArg.value, path.node.loc?.start.line || 0),
                  testName: firstArg.value,
                  testFilePath: filePath,
                  testFramework: this.detectTestFramework(content),
                  startLine: path.node.loc?.start.line || 0,
                  endLine: path.node.loc?.end.line || 0,
                  provenance: createProvenance("local", this.id, filePath, path.node.loc?.start.line)
                });
              }
            }
          }
        }
      });

    } catch (error: any) {
      errors.push({
        file: filePath,
        message: error.message,
        fatal: true
      });
    }

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

  private getCallName(callee: any): string | undefined {
    if (callee.type === 'Identifier') {
      return callee.name;
    } else if (callee.type === 'MemberExpression') {
      return this.getFullMemberExpression(callee);
    }
    return undefined;
  }

  private getFullMemberExpression(expr: any): string {
    const parts: string[] = [];
    let current = expr;
    while (current.type === 'MemberExpression') {
      if (current.property.type === 'Identifier') {
        parts.unshift(current.property.name);
      }
      current = current.object;
    }
    if (current.type === 'Identifier') {
      parts.unshift(current.name);
    }
    return parts.join('.');
  }

  private getCallType(callee: any): CallType {
    if (callee.type === 'MemberExpression') {
      return 'method';
    } else if (callee.type === 'Identifier') {
      return 'direct';
    }
    return 'dynamic';
  }

  private detectLanguage(filePath: string): 'javascript' | 'typescript' | 'unknown' {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
    return 'unknown';
  }

  private isTestFile(filePath: string): boolean {
    return /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(filePath) || /[\\/](test|spec)[\\/]/.test(filePath);
  }

  private detectTestFramework(content: string): TestFramework {
    if (content.includes('jest') || content.includes('describe')) return 'jest';
    if (content.includes('mocha')) return 'mocha';
    if (content.includes('vitest')) return 'vitest';
    return 'unknown';
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}
