import * as tsNs from 'typescript';
// Handle both TS5 (module.exports API) and possible wrapped shapes
const ts: typeof tsNs = ((tsNs as any).default?.createSourceFile ? (tsNs as any).default : tsNs) as typeof tsNs;
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
  ImportNameMapping,
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
 * TypeScript Compiler API Parser
 * Uses official TypeScript compiler for accurate AST parsing
 */
export class TypeScriptCompilerParser implements Parser {
  public readonly id = "typescript-compiler-api:1.0.0";

  parse(filePath: string, content: string): FileParseResult {
    const errors: ParseError[] = [];

    // Detect language
    const language = this.detectLanguage(filePath);

    // Create source file
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(filePath)
    );

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

    // Extract all information
    this.visitNode(sourceFile, sourceFile, {
      symbols,
      tests,
      todoMarkers,
      importStatements,
      exportStatements,
      callExpressions,
      filePath
    });

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

  private visitNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    context: {
      symbols: Symbol[];
      tests: Test[];
      todoMarkers: TodoMarker[];
      importStatements: ImportStatement[];
      exportStatements: ExportStatement[];
      callExpressions: CallExpression[];
      filePath: string;
    }
  ): void {
    // Extract symbols
    if (ts.isFunctionDeclaration(node) && node.name) {
      context.symbols.push(this.createSymbol(node, node.name.text, 'function', sourceFile, context.filePath));
    } else if (ts.isClassDeclaration(node) && node.name) {
      context.symbols.push(this.createSymbol(node, node.name.text, 'class', sourceFile, context.filePath));
      // Extract methods
      node.members.forEach(member => {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          context.symbols.push(this.createSymbol(member, member.name.text, 'method', sourceFile, context.filePath));
        } else if (ts.isConstructorDeclaration(member)) {
          context.symbols.push(this.createSymbol(member, 'constructor', 'method', sourceFile, context.filePath));
        }
      });
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      context.symbols.push(this.createSymbol(node, node.name.text, 'interface', sourceFile, context.filePath));
    } else if (ts.isEnumDeclaration(node) && node.name) {
      context.symbols.push(this.createSymbol(node, node.name.text, 'enum', sourceFile, context.filePath));
    } else if (ts.isVariableStatement(node)) {
      // Recurse into initializers (may contain call expressions). Don't return early.
      // Module-level variables become symbols:
      const isModuleLevel = node.parent === sourceFile ||
        (node.parent && ts.isModuleBlock(node.parent));
      if (isModuleLevel) {
        node.declarationList.declarations.forEach(decl => {
          if (ts.isIdentifier(decl.name)) {
            const isFunctionLike = decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer));
            context.symbols.push(
              this.createSymbol(decl, decl.name.text, isFunctionLike ? 'function' : 'const', sourceFile, context.filePath)
            );
          }
        });
      }
    }

    // Extract imports
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const importedNames: string[] = [];
      const nameMappings: ImportNameMapping[] = [];
      if (node.importClause) {
        if (node.importClause.name) {
          importedNames.push(node.importClause.name.text);
          nameMappings.push({ local: node.importClause.name.text, imported: 'default', isDefault: true });
        }
        if (node.importClause.namedBindings) {
          if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            importedNames.push(node.importClause.namedBindings.name.text);
            nameMappings.push({ local: node.importClause.namedBindings.name.text, imported: '*', isNamespace: true });
          } else if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach(element => {
              importedNames.push(element.name.text);
              // 'import { foo as bar }': propertyName is 'foo' (source name), name is 'bar' (local)
              const sourceName = element.propertyName?.text ?? element.name.text;
              nameMappings.push({ local: element.name.text, imported: sourceName });
            });
          }
        }
      }
      context.importStatements.push({
        specifier: node.moduleSpecifier.text,
        importedNames,
        line: this.getLineNumber(node, sourceFile),
        nameMappings
      });
    }

    // Extract exports
    if (ts.isExportAssignment(node)) {
      // export default <expr>
      // Use the declared symbol's name when available so the resolver can link it
      let name = 'default';
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        name = expr.text;
      } else if ((ts.isFunctionDeclaration(expr) || ts.isClassDeclaration(expr)) && expr.name) {
        name = expr.name.text;
      }
      context.exportStatements.push({
        symbolName: name,
        exportType: 'default',
        line: this.getLineNumber(node, sourceFile)
      });
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      // export { a, b as c } [from '...']
      const sourceSpecifier = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined;
      node.exportClause.elements.forEach(element => {
        // element.name = exported (public) name; propertyName = local/source name before aliasing
        const sourceName = element.propertyName?.text ?? element.name.text;
        context.exportStatements.push({
          symbolName: element.name.text,
          exportType: 'named',
          line: this.getLineNumber(node, sourceFile),
          sourceSpecifier,
          sourceName
        });
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.exportClause) {
      // export * from '...'
      context.exportStatements.push({
        symbolName: '*',
        exportType: 'named',
        line: this.getLineNumber(node, sourceFile),
        sourceSpecifier: node.moduleSpecifier.text
      });
    } else if (node.modifiers?.some(m => m.kind === tsNs.SyntaxKind.ExportKeyword)) {
      let symbolName = 'unknown';
      if (ts.isFunctionDeclaration(node) && node.name) {
        symbolName = node.name.text;
      } else if (ts.isClassDeclaration(node) && node.name) {
        symbolName = node.name.text;
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        symbolName = node.name.text;
      } else if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(decl => {
          if (ts.isIdentifier(decl.name)) {
            context.exportStatements.push({
              symbolName: decl.name.text,
              exportType: 'named',
              line: this.getLineNumber(node, sourceFile)
            });
          }
        });
        // Do NOT return early — forEachChild below must visit initializers
        // (call expressions inside `export const x = fn()` must be extracted).
      }
      if (symbolName !== 'unknown') {
        const isDefault = node.modifiers?.some(m => m.kind === tsNs.SyntaxKind.DefaultKeyword);
        context.exportStatements.push({
          symbolName,
          exportType: isDefault ? 'default' : 'named',
          line: this.getLineNumber(node, sourceFile)
        });
      }
    }

    // Extract call expressions
    if (ts.isCallExpression(node)) {
      const calledName = this.getCallName(node.expression);
      if (calledName) {
        // Names used as call arguments - candidate callback references.
        // Only identifiers and property accesses (symbol-shaped), not literals.
        const argNames: string[] = [];
        for (const arg of node.arguments) {
          if (ts.isIdentifier(arg)) {
            argNames.push(arg.text);
          } else if (ts.isPropertyAccessExpression(arg)) {
            argNames.push(this.getFullPropertyAccess(arg));
          }
        }
        context.callExpressions.push({
          calledName,
          callType: this.getCallType(node.expression),
          line: this.getLineNumber(node, sourceFile),
          arguments: argNames.length > 0 ? argNames : undefined
        });
      }
    }

    // Extract test cases
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fnName = node.expression.text;
      if (['it', 'test', 'describe'].includes(fnName) && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          context.tests.push({
            testId: createTestId(context.filePath, firstArg.text, this.getLineNumber(node, sourceFile)),
            testName: firstArg.text,
            testFilePath: context.filePath,
            testFramework: this.detectTestFramework(sourceFile.text),
            startLine: this.getLineNumber(node, sourceFile),
            endLine: this.getLineNumber(node, sourceFile),
            provenance: createProvenance("local", this.id, context.filePath, this.getLineNumber(node, sourceFile))
          });
        }
      }
    }

    // Extract TODO/FIXME markers from comments
    const fullText = sourceFile.getFullText();
    const commentRanges = ts.getLeadingCommentRanges(fullText, node.pos) || [];
    commentRanges.forEach(range => {
      const commentText = fullText.substring(range.pos, range.end);
      const todoMatch = commentText.match(/\/\/\s*(TODO|FIXME|HACK|XXX|NOTE):?\s*(.+)/);
      if (todoMatch) {
        const line = sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1;
        context.todoMarkers.push({
          markerId: createTodoMarkerId(context.filePath, todoMatch[1] as any, line),
          text: commentText.trim(),
          markerType: todoMatch[1] as any,
          filePath: context.filePath,
          line,
          provenance: createProvenance("local", this.id, context.filePath, line)
        });
      }
    });

    // Recursively visit children
    ts.forEachChild(node, child => this.visitNode(child, sourceFile, context));
  }

  private createSymbol(
    node: ts.Node,
    name: string,
    kind: SymbolKind,
    sourceFile: ts.SourceFile,
    filePath: string
  ): Symbol {
    const startLine = this.getLineNumber(node, sourceFile);
    const endLine = this.getEndLineNumber(node, sourceFile);
    return {
      symbolId: createSymbolId(filePath, name, startLine),
      name,
      kind,
      filePath,
      startLine,
      endLine,
      isExported: false, // Will be set by resolver
      provenance: createProvenance("local", this.id, filePath, startLine)
    };
  }

  private getCallName(expr: ts.Expression): string | undefined {
    if (ts.isIdentifier(expr)) {
      return expr.text;
    } else if (ts.isPropertyAccessExpression(expr)) {
      return this.getFullPropertyAccess(expr);
    } else if (ts.isElementAccessExpression(expr)) {
      // obj[expr]() / obj[key]() - dynamic dispatch. Emit the source shape so
      // the resolver can label it 'dynamic' and never guess a callee.
      return expr.getText();
    }
    return undefined;
  }

  private getFullPropertyAccess(expr: ts.PropertyAccessExpression): string {
    let parts: string[] = [expr.name.text];
    let current = expr.expression;
    while (ts.isPropertyAccessExpression(current)) {
      parts.unshift(current.name.text);
      current = current.expression;
    }
    if (ts.isIdentifier(current)) {
      parts.unshift(current.text);
    } else if (current.kind === ts.SyntaxKind.ThisKeyword) {
      // `this` is a keyword node, not an Identifier - keep the receiver so the
      // resolver can match this.method() against the enclosing class.
      parts.unshift('this');
    }
    return parts.join('.');
  }

  private getCallType(expr: ts.Expression): CallType {
    if (ts.isPropertyAccessExpression(expr)) {
      return 'method';
    } else if (ts.isIdentifier(expr)) {
      return 'direct';
    }
    return 'dynamic';
  }

  private getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  }

  private getEndLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  }

  private detectLanguage(filePath: string): 'javascript' | 'typescript' | 'unknown' {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
    return 'unknown';
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
    if (filePath.endsWith('.ts')) return ts.ScriptKind.TS;
    if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
    return ts.ScriptKind.JS;
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
