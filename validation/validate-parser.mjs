#!/usr/bin/env node
// Simple validation script for parser gold standard
import { readFileSync } from 'fs';
import { join } from 'path';

async function runValidation() {
  console.log('=== Parser Validation Script ===\n');

  // Load gold standard
  const goldStandardPath = './validation/gold-standard/test-sample.json';
  let goldStandard;
  try {
    const goldContent = readFileSync(goldStandardPath, 'utf8');
    goldStandard = JSON.parse(goldContent);
    console.log(`✓ Loaded gold standard: ${goldStandardPath}\n`);
  } catch (error) {
    console.error(`✗ Failed to load gold standard: ${error.message}`);
    return;
  }

  // Load test file
  const testFilePath = goldStandard.file;
  let content;
  try {
    content = readFileSync(testFilePath, 'utf8');
    console.log(`✓ Loaded test file: ${testFilePath}\n`);
  } catch (error) {
    console.error(`✗ Failed to load test file: ${error.message}`);
    return;
  }

  // Simple parser (same as in run-benchmark-simple.mjs)
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

  // Parse the file
  const actual = parseTypeScriptFile(testFilePath, content);

  // Compare results
  console.log('=== VALIDATION RESULTS ===\n');

  // Symbols validation
  console.log('1. SYMBOLS:');
  const expectedSymbols = goldStandard.expected.symbols;
  let symbolCorrect = 0;
  expectedSymbols.forEach(expected => {
    const actualMatch = actual.symbols.find(s =>
      s.name === expected.name && s.kind === expected.kind
    );
    const isCorrect = !!actualMatch;
    if (isCorrect) symbolCorrect++;

    console.log(`  ${isCorrect ? '✓' : '✗'} ${expected.name} (${expected.kind}) at line ${expected.line}`);
    if (!isCorrect) {
      console.log(`      Expected: ${expected.name} (${expected.kind})`);
      console.log(`      Actual: Not found or incorrect`);
    }
  });
  console.log(`  Score: ${symbolCorrect}/${expectedSymbols.length} (${((symbolCorrect/expectedSymbols.length)*100).toFixed(1)}%)\n`);

  // Imports validation
  console.log('2. IMPORTS:');
  const expectedImports = goldStandard.expected.imports;
  let importCorrect = 0;
  expectedImports.forEach(expected => {
    const actualMatch = actual.imports.find(i =>
      i.specifier === expected.specifier
    );
    const isCorrect = !!actualMatch;
    if (isCorrect) importCorrect++;

    console.log(`  ${isCorrect ? '✓' : '✗'} from '${expected.specifier}'`);
    if (!isCorrect) {
      console.log(`      Expected import from '${expected.specifier}'`);
      console.log(`      Actual imports: ${actual.imports.map(i => `'${i.specifier}'`).join(', ')}`);
    }
  });
  console.log(`  Score: ${importCorrect}/${expectedImports.length} (${((importCorrect/expectedImports.length)*100).toFixed(1)}%)\n`);

  // Exports validation
  console.log('3. EXPORTS:');
  const expectedExports = goldStandard.expected.exports;
  let exportCorrect = 0;
  expectedExports.forEach(expected => {
    const actualMatch = actual.exports.find(e =>
      e.name === expected.name
    );
    const isCorrect = !!actualMatch;
    if (isCorrect) exportCorrect++;

    console.log(`  ${isCorrect ? '✓' : '✗'} export '${expected.name}'`);
    if (!isCorrect) {
      console.log(`      Expected export: '${expected.name}'`);
      console.log(`      Actual exports: ${actual.exports.map(e => `'${e.name}'`).join(', ')}`);
    }
  });
  console.log(`  Score: ${exportCorrect}/${expectedExports.length} (${((exportCorrect/expectedExports.length)*100).toFixed(1)}%)\n`);

  // TODOs validation
  console.log('4. TODO MARKERS:');
  const expectedTodos = goldStandard.expected.todos;
  let todoCorrect = 0;
  expectedTodos.forEach(expected => {
    const actualMatch = actual.todos.find(t =>
      t.type === expected.type && t.text.includes(expected.text.split(' ')[0])
    );
    const isCorrect = !!actualMatch;
    if (isCorrect) todoCorrect++;

    console.log(`  ${isCorrect ? '✓' : '✗'} ${expected.type}: ${expected.text}`);
    if (!isCorrect) {
      console.log(`      Expected: ${expected.type}: ${expected.text}`);
      console.log(`      Actual TODOs: ${actual.todos.map(t => `${t.type}: ${t.text}`).join('; ')}`);
    }
  });
  console.log(`  Score: ${todoCorrect}/${expectedTodos.length} (${((todoCorrect/expectedTodos.length)*100).toFixed(1)}%)\n`);

  // Overall score
  const totalExpected = expectedSymbols.length + expectedImports.length + expectedExports.length + expectedTodos.length;
  const totalCorrect = symbolCorrect + importCorrect + exportCorrect + todoCorrect;
  const overallScore = (totalCorrect / totalExpected) * 100;

  console.log('=== OVERALL RESULT ===');
  console.log(`Overall Score: ${totalCorrect}/${totalExpected} (${overallScore.toFixed(1)}%)`);
  console.log(`\nValidation complete.`);

  return {
    overallScore,
    symbolScore: (symbolCorrect/expectedSymbols.length)*100,
    importScore: (importCorrect/expectedImports.length)*100,
    exportScore: (exportCorrect/expectedExports.length)*100,
    todoScore: (todoCorrect/expectedTodos.length)*100
  };
}

runValidation().catch(console.error);