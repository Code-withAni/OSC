#!/usr/bin/env node
// Simplified parser benchmark runner (plain JS version)
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

// Simple regex-based parser for testing
function parseTypeScriptFile(filePath, content) {
  const symbols = [];
  const imports = [];
  const exports = [];
  const todos = [];

  // Extract functions
  const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = functionPattern.exec(content)) !== null) {
    symbols.push({ name: match[1], kind: 'function' });
  }

  // Extract classes
  const classPattern = /(?:export\s+)?class\s+(\w+)/g;
  while ((match = classPattern.exec(content)) !== null) {
    symbols.push({ name: match[1], kind: 'class' });
  }

  // Extract interfaces
  const interfacePattern = /(?:export\s+)?interface\s+(\w+)/g;
  while ((match = interfacePattern.exec(content)) !== null) {
    symbols.push({ name: match[1], kind: 'interface' });
  }

  // Extract imports
  const importPattern = /import\s+.*from\s+['"]([^'"]+)['"]/g;
  while ((match = importPattern.exec(content)) !== null) {
    imports.push({ specifier: match[1] });
  }

  // Extract exports
  const exportPattern = /export\s+(?:const|let|var|function|class|interface)\s+(\w+)/g;
  while ((match = exportPattern.exec(content)) !== null) {
    exports.push({ name: match[1] });
  }

  // Extract TODOs
  const todoPattern = /\/\/\s*(TODO|FIXME|HACK):?\s*(.+)/g;
  while ((match = todoPattern.exec(content)) !== null) {
    todos.push({ type: match[1], text: match[2].trim() });
  }

  return { symbols, imports, exports, todos };
}

function walkDirectory(dir, callback, excludeDirs = ['node_modules', 'dist', 'build', '.git']) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        walkDirectory(fullPath, callback, excludeDirs);
      }
    } else if (entry.isFile()) {
      const ext = extname(fullPath);
      if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
        callback(fullPath);
      }
    }
  }
}

function runBenchmark(repoPath, repoName) {
  const stats = {
    files: 0,
    symbols: 0,
    imports: 0,
    exports: 0,
    todos: 0,
    errors: 0
  };

  console.log(`\n=== Parsing ${repoName} ===`);

  walkDirectory(repoPath, (filePath) => {
    try {
      const content = readFileSync(filePath, 'utf8');
      const result = parseTypeScriptFile(filePath, content);

      stats.files++;
      stats.symbols += result.symbols.length;
      stats.imports += result.imports.length;
      stats.exports += result.exports.length;
      stats.todos += result.todos.length;
    } catch (error) {
      stats.errors++;
      console.error(`Error parsing ${filePath}: ${error.message}`);
    }
  });

  console.log(`\nResults:`);
  console.log(`  Files processed: ${stats.files}`);
  console.log(`  Symbols found: ${stats.symbols}`);
  console.log(`  Imports: ${stats.imports}`);
  console.log(`  Exports: ${stats.exports}`);
  console.log(`  TODOs: ${stats.todos}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log(`  Avg symbols/file: ${(stats.symbols / stats.files).toFixed(1)}`);

  return stats;
}

// Run on real benchmark repositories
console.log('=== Parser Benchmark Tool ===\n');

const repos = [
  { name: 'commander.js', path: './benchmarks/commander.js' },
  { name: 'date-fns', path: './benchmarks/date-fns' }
];

for (const repo of repos) {
  try {
    runBenchmark(repo.path, repo.name);
  } catch (error) {
    console.log(`Skipping ${repo.name}: ${error.message}`);
  }
}
