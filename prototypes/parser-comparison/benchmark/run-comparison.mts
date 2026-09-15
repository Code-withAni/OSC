#!/usr/bin/env node
// Parser comparison benchmark runner
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname } from 'path';

/**
 * Benchmark runner for parser comparison
 * Tests TypeScript Compiler API, Babel, and regex baseline
 */

interface ParserResult {
  parserId: string;
  files: number;
  symbols: number;
  methods: number;
  functions: number;
  classes: number;
  interfaces: number;
  imports: number;
  exports: number;
  calls: number;
  todos: number;
  tests: number;
  errors: number;
  parseTimeMs: number;
  memoryMB: number;
}

function walkDirectory(dir: string, callback: (filePath: string) => void) {
  const excludeDirs = ['node_modules', 'dist', 'build', '.git', 'coverage', 'tmp'];

  function walk(currentPath: string) {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = extname(fullPath);
          if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
            callback(fullPath);
          }
        }
      }
    } catch (error) {
      // Skip permission errors
    }
  }

  walk(dir);
}

async function benchmarkParser(
  parserName: string,
  parserModule: any,
  repoPath: string
): Promise<ParserResult> {
  console.log(`\nRunning ${parserName}...`);

  const result: ParserResult = {
    parserId: parserName,
    files: 0,
    symbols: 0,
    methods: 0,
    functions: 0,
    classes: 0,
    interfaces: 0,
    imports: 0,
    exports: 0,
    calls: 0,
    todos: 0,
    tests: 0,
    errors: 0,
    parseTimeMs: 0,
    memoryMB: 0
  };

  const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const startTime = Date.now();

  let fileCount = 0;
  walkDirectory(repoPath, (filePath) => {
    fileCount++;
    if (fileCount % 100 === 0) {
      process.stdout.write(`\r  Progress: ${fileCount} files...`);
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      const parseResult = parserModule.parse(filePath, content);

      result.files++;
      result.symbols += parseResult.symbols.length;
      result.imports += parseResult.importStatements.length;
      result.exports += parseResult.exportStatements.length;
      result.calls += parseResult.callExpressions.length;
      result.todos += parseResult.todoMarkers.length;
      result.tests += parseResult.tests.length;
      result.errors += parseResult.errors.length;

      // Count by kind
      parseResult.symbols.forEach((sym: any) => {
        if (sym.kind === 'method') result.methods++;
        else if (sym.kind === 'function') result.functions++;
        else if (sym.kind === 'class') result.classes++;
        else if (sym.kind === 'interface') result.interfaces++;
      });

    } catch (error: any) {
      result.errors++;
    }
  });

  const endTime = Date.now();
  const endMem = process.memoryUsage().heapUsed / 1024 / 1024;

  result.parseTimeMs = endTime - startTime;
  result.memoryMB = endMem - startMem;

  process.stdout.write(`\r  Completed: ${result.files} files in ${result.parseTimeMs}ms\n`);

  return result;
}

function printResults(results: ParserResult[], repoName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`BENCHMARK RESULTS: ${repoName}`);
  console.log('='.repeat(80));

  // Create comparison table
  const headers = ['Metric', ...results.map(r => r.parserId)];
  const metrics = [
    ['Files Parsed', ...results.map(r => r.files.toString())],
    ['Parse Time (ms)', ...results.map(r => r.parseTimeMs.toString())],
    ['Memory (MB)', ...results.map(r => r.memoryMB.toFixed(1))],
    ['---', ...results.map(() => '---')],
    ['Total Symbols', ...results.map(r => r.symbols.toString())],
    ['  Functions', ...results.map(r => r.functions.toString())],
    ['  Methods', ...results.map(r => r.methods.toString())],
    ['  Classes', ...results.map(r => r.classes.toString())],
    ['  Interfaces', ...results.map(r => r.interfaces.toString())],
    ['Imports', ...results.map(r => r.imports.toString())],
    ['Exports', ...results.map(r => r.exports.toString())],
    ['Call Sites', ...results.map(r => r.calls.toString())],
    ['TODO Markers', ...results.map(r => r.todos.toString())],
    ['Tests', ...results.map(r => r.tests.toString())],
    ['Errors', ...results.map(r => r.errors.toString())],
    ['---', ...results.map(() => '---')],
    ['Avg Symbols/File', ...results.map(r => (r.symbols / r.files).toFixed(1))],
    ['ms/File', ...results.map(r => (r.parseTimeMs / r.files).toFixed(2))]
  ];

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const vals = [h, ...metrics.map(m => m[i])];
    return Math.max(...vals.map(v => v.length)) + 2;
  });

  // Print table
  console.log('\n' + headers.map((h, i) => h.padEnd(colWidths[i])).join(''));
  console.log(colWidths.map(w => '-'.repeat(w)).join(''));

  metrics.forEach(row => {
    console.log(row.map((val, i) => val.padEnd(colWidths[i])).join(''));
  });

  console.log();
}

async function main() {
  console.log('='.repeat(80));
  console.log('AST PARSER COMPARISON BENCHMARK');
  console.log('='.repeat(80));
  console.log('\nThis benchmark compares:');
  console.log('  1. TypeScript Compiler API (official TS parser)');
  console.log('  2. Babel (popular JS/TS parser)');
  console.log('  3. Regex baseline (reference only)');
  console.log('\nBenchmark repositories:');
  console.log('  - commander.js (small CLI library)');
  console.log('  - date-fns (medium functional library)');

  const repos = [
    { name: 'commander.js', path: './benchmarks/commander.js' },
    { name: 'date-fns', path: './benchmarks/date-fns' }
  ];

  for (const repo of repos) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Processing: ${repo.name}`);
    console.log('='.repeat(80));

    const results: ParserResult[] = [];

    // Test each parser
    try {
      const { TypeScriptCompilerParser } = await import('../typescript-compiler-api/parser.js');
      const tsParser = new TypeScriptCompilerParser();
      results.push(await benchmarkParser('TypeScript Compiler API', tsParser, repo.path));
    } catch (error: any) {
      console.error(`Failed to load TypeScript Compiler API parser: ${error.message}`);
    }

    try {
      const { BabelParser } = await import('../babel/parser.js');
      const babelParser = new BabelParser();
      results.push(await benchmarkParser('Babel', babelParser, repo.path));
    } catch (error: any) {
      console.error(`Failed to load Babel parser: ${error.message}`);
    }

    // Regex baseline (from existing code)
    try {
      const regexParser = {
        parse: (filePath: string, content: string) => {
          const symbols: any[] = [];
          const imports: any[] = [];
          const exports: any[] = [];
          const todos: any[] = [];
          const calls: any[] = [];

          // Simple regex extraction
          const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
          const classPattern = /(?:export\s+)?class\s+(\w+)/g;
          const interfacePattern = /(?:export\s+)?interface\s+(\w+)/g;
          const importPattern = /import\s+.*from\s+['"]([^'"]+)['"]/g;
          const exportPattern = /export\s+(?:const|let|var|function|class|interface)\s+(\w+)/g;
          const todoPattern = /\/\/\s*(TODO|FIXME|HACK):?\s*(.+)/g;

          let match;
          while ((match = functionPattern.exec(content))) symbols.push({ kind: 'function' });
          while ((match = classPattern.exec(content))) symbols.push({ kind: 'class' });
          while ((match = interfacePattern.exec(content))) symbols.push({ kind: 'interface' });
          while ((match = importPattern.exec(content))) imports.push({});
          while ((match = exportPattern.exec(content))) exports.push({});
          while ((match = todoPattern.exec(content))) todos.push({});

          return {
            symbols,
            importStatements: imports,
            exportStatements: exports,
            todoMarkers: todos,
            callExpressions: calls,
            tests: [],
            errors: []
          };
        }
      };
      results.push(await benchmarkParser('Regex (baseline)', regexParser, repo.path));
    } catch (error: any) {
      console.error(`Failed to run regex baseline: ${error.message}`);
    }

    if (results.length > 0) {
      printResults(results, repo.name);

      // Save results
      const outputPath = `./prototypes/parser-comparison/benchmark/results-${repo.name.replace('/', '-')}.json`;
      writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\nResults saved to: ${outputPath}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('BENCHMARK COMPLETE');
  console.log('='.repeat(80));
  console.log('\nNext steps:');
  console.log('  1. Review accuracy against gold standard');
  console.log('  2. Analyze method extraction completeness');
  console.log('  3. Evaluate call-site extraction quality');
  console.log('  4. Choose parser for Phase 1 implementation');
}

main().catch(console.error);
