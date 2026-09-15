import { TypeScriptParser } from '../parsers/typescript-parser';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';

interface BenchmarkResults {
  totalFiles: number;
  parsedFiles: number;
  symbolCount: number;
  importCount: number;
  exportCount: number;
  callCount: number;
  todoCount: number;
  testCount: number;
  parseErrors: number;
  languageBreakdown: {
    javascript: number;
    typescript: number;
    unknown: number;
  };
  fileTypeBreakdown: {
    source: number;
    test: number;
    config: number;
  };
}

class ParserBenchmark {
  private parser: TypeScriptParser;
  private results: BenchmarkResults;

  constructor() {
    this.parser = new TypeScriptParser();
    this.results = {
      totalFiles: 0,
      parsedFiles: 0,
      symbolCount: 0,
      importCount: 0,
      exportCount: 0,
      callCount: 0,
      todoCount: 0,
      testCount: 0,
      parseErrors: 0,
      languageBreakdown: { javascript: 0, typescript: 0, unknown: 0 },
      fileTypeBreakdown: { source: 0, test: 0, config: 0 }
    };
  }

  /**
   * Run benchmark on a directory
   */
  async runBenchmark(directoryPath: string, repoName: string): Promise<BenchmarkResults> {
    console.log(`\n=== Running Parser Benchmark on ${repoName} ===`);
    console.log(`Directory: ${directoryPath}`);

    // Reset results
    this.results = {
      totalFiles: 0,
      parsedFiles: 0,
      symbolCount: 0,
      importCount: 0,
      exportCount: 0,
      callCount: 0,
      todoCount: 0,
      testCount: 0,
      parseErrors: 0,
      languageBreakdown: { javascript: 0, typescript: 0, unknown: 0 },
      fileTypeBreakdown: { source: 0, test: 0, config: 0 }
    };

    // Walk directory and process files
    await this.walkDirectory(directoryPath, (filePath) => {
      this.processFile(filePath);
    });

    // Print results
    this.printResults(repoName);
    return this.results;
  }

  /**
   * Walk directory recursively and process each file
   */
  private async walkDirectory(dir: string, callback: (filePath: string) => void): Promise<void> {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and dist/build directories
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') {
          continue;
        }
        await this.walkDirectory(fullPath, callback);
      } else if (entry.isFile()) {
        // Only process JS/TS files for parsing benchmark
        const ext = extname(fullPath);
        if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
          callback(fullPath);
        }
      }
    }
  }

  /**
   * Process a single file
   */
  private processFile(filePath: string): void {
    this.results.totalFiles++;

    try {
      const content = readFileSync(filePath, 'utf8');
      const result = this.parser.parse(filePath, content);

      // Update counters
      this.results.parsedFiles++;
      this.results.symbolCount += result.symbols.length;
      this.results.importCount += result.importStatements.length;
      this.results.exportCount += result.exportStatements.length;
      this.results.callCount += result.callExpressions.length;
      this.results.todoCount += result.todoMarkers.length;
      this.results.testCount += result.tests.length;

      // Language breakdown
      switch (result.file.language) {
        case 'javascript':
          this.results.languageBreakdown.javascript++;
          break;
        case 'typescript':
          this.results.languageBreakdown.typescript++;
          break;
        default:
          this.results.languageBreakdown.unknown++;
          break;
      }

      // File type breakdown
      if (result.file.isTest) {
        this.results.fileTypeBreakdown.test++;
      } else {
        this.results.fileTypeBreakdown.source++;
      }

      // Errors
      this.results.parseErrors += result.errors.length;

      if (result.errors.length > 0) {
        console.warn(`  ${filePath}: ${result.errors.length} parse errors`);
        for (const error of result.errors) {
          console.warn(`    - ${error.message}`);
        }
      }
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
      this.results.parseErrors++;
    }
  }

  /**
   * Print benchmark results
   */
  private printResults(repoName: string): void {
    console.log(`\n--- Results for ${repoName} ---`);
    console.log(`Total files processed: ${this.results.totalFiles}`);
    console.log(`Successfully parsed: ${this.results.parsedFiles} (${((this.results.parsedFiles / this.results.totalFiles) * 100).toFixed(1)}%)`);
    console.log(`Parse errors: ${this.results.parseErrors}`);
    console.log(`\nLanguage breakdown:`);
    console.log(`  JavaScript: ${this.results.languageBreakdown.javascript}`);
    console.log(`  TypeScript: ${this.results.languageBreakdown.typescript}`);
    console.log(`  Unknown: ${this.results.languageBreakdown.unknown}`);
    console.log(`\nFile type breakdown:`);
    console.log(`  Source files: ${this.results.fileTypeBreakdown.source}`);
    console.log(`  Test files: ${this.results.fileTypeBreakdown.test}`);
    console.log(`  Config/other: ${this.results.fileTypeBreakdown.config}`);
    console.log(`\nExtracted facts:`);
    console.log(`  Symbols: ${this.results.symbolCount}`);
    console.log(`  Import statements: ${this.results.importCount}`);
    console.log(`  Export statements: ${this.results.exportCount}`);
    console.log(`  Call expressions: ${this.results.callCount}`);
    console.log(`  TODO markers: ${this.results.todoCount}`);
    console.log(`  Upward test references: ${this.results.testCount}`);

    // Calculate rates
    if (this.results.parsedFiles > 0) {
      console.log(`\nPer-file averages:`);
      console.log(`  Symbols per file: ${(this.results.symbolCount / this.results.parsedFiles).toFixed(1)}`);
      console.log(`  Imports per file: ${(this.results.importCount / this.results.parsedFiles).toFixed(1)}`);
      console.log(`  Exports per file: ${(this.results.exportCount / this.results.parsedFiles).toFixed(1)}`);
      console.log(`  Calls per file: ${(this.results.callCount / this.results.parsedFiles).toFixed(1)}`);
    }
  }
}

// If run directly, execute benchmarks
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new ParserBenchmark();

  // Define benchmark repositories from the manifest
  const repos = [
    {
      name: 'commander.js',
      path: './benchmarks/commander.js' // Would need to be cloned
    },
    {
      name: 'date-fns',
      path: './benchmarks/date-fns' // Would need to be cloned
    }
  ];

  console.log('Open Source Contribution Intelligence - Parser Benchmark');
  console.log('====================================================');

  // For now, just show what we would benchmark
  console.log('\nNote: To run actual benchmarks, clone the repositories at the specified commits:');
  console.log('- commander.js: ba6d13ddb4243e5913367734f8c159089ffe7834');
  console.log('- date-fns: 18cbd436f1428d0f45f89f710df65f62546c42f0');
  console.log('\nThen run: npx ts-node benchmarks/run-parser-benchmark.ts');
}