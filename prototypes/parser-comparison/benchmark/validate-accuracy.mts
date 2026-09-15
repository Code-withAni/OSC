#!/usr/bin/env node
// Ground-truth accuracy validation: precision/recall per parser against gold standards
import { readFileSync } from 'fs';

const goldFiles = [
  './prototypes/parser-comparison/benchmark/gold-commander-argument.json',
  './prototypes/parser-comparison/benchmark/gold-datefns-format.json'
];

const parsers = [
  { name: 'TypeScript Compiler API', load: async () => (await import('../typescript-compiler-api/parser.js')).TypeScriptCompilerParser },
  { name: 'Babel', load: async () => (await import('../babel/parser.js')).BabelParser }
];

function prf(matched, extracted, expectedTotal) {
  const precision = extracted > 0 ? matched / extracted : 0;
  const recall = expectedTotal > 0 ? matched / expectedTotal : 0;
  return { precision, recall, matched, extracted, expectedTotal };
}

function scoreSymbols(actual, expected) {
  // Match on (name, kind). Line numbers checked separately for reporting only.
  const expectedKeys = new Set(expected.map(s => `${s.name}|${s.kind}`));
  const actualKeys = new Set(actual.map(s => `${s.name}|${s.kind}`));
  let matched = 0;
  for (const key of expectedKeys) if (actualKeys.has(key)) matched++;

  // False positives: extracted symbols not in gold (excluding getters/duplicate overloads noise)
  const falsePositives = [...actualKeys].filter(k => !expectedKeys.has(k));
  // False negatives: gold symbols missed
  const falseNegatives = [...expectedKeys].filter(k => !actualKeys.has(k));

  return {
    ...prf(matched, actualKeys.size, expectedKeys.size),
    falsePositives,
    falseNegatives
  };
}

function scoreImports(actual, expected) {
  const expectedSpecs = new Set(expected.map(i => i.specifier));
  const actualSpecs = new Set(actual.map(i => i.specifier));
  let matched = 0;
  for (const s of expectedSpecs) if (actualSpecs.has(s)) matched++;
  const falsePositives = [...actualSpecs].filter(s => !expectedSpecs.has(s));
  const falseNegatives = [...expectedSpecs].filter(s => !expectedSpecs.has(s));
  return { ...prf(matched, actualSpecs.size, expectedSpecs.size), falsePositives, falseNegatives };
}

function scoreExports(actual, expected) {
  const expectedNames = new Set(expected.map(e => e.name));
  const actualNames = new Set(actual.map(e => e.symbolName));
  let matched = 0;
  for (const n of expectedNames) if (actualNames.has(n)) matched++;
  const falsePositives = [...actualNames].filter(n => !expectedNames.has(n));
  const falseNegatives = [...expectedNames].filter(n => !actualNames.has(n));
  return { ...prf(matched, actualNames.size, expectedNames.size), falsePositives, falseNegatives };
}

async function main() {
  console.log('='.repeat(80));
  console.log('GROUND-TRUTH ACCURACY VALIDATION');
  console.log('='.repeat(80));
  const report = {};

  for (const parserDef of parsers) {
    const ParserClass = await parserDef.load();
    const parser = new ParserClass();
    report[parserDef.name] = {};

    for (const goldPath of goldFiles) {
      const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
      const content = readFileSync(`./benchmarks/${gold.repo}/${gold.file}`, 'utf8');
      const result = parser.parse(gold.file, content);

      const symbolScore = scoreSymbols(result.symbols, gold.expected.symbols);
      const importScore = scoreImports(result.importStatements, gold.expected.imports);
      const exportScore = scoreExports(result.exportStatements, gold.expected.exports);
      const methodScore = (() => {
        const expectedMethods = gold.expected.symbols.filter(s => s.kind === 'method');
        const actualMethods = result.symbols.filter(s => s.kind === 'method');
        const expectedNames = new Set(expectedMethods.map(m => m.name));
        let matched = 0;
        for (const m of actualMethods) if (expectedNames.has(m.name)) matched++;
        return prf(matched, actualMethods.length, expectedMethods.length);
      })();

      report[parserDef.name][`${gold.repo}:${gold.file}`] = { symbolScore, importScore, exportScore, methodScore, callSites: result.callExpressions.length, errors: result.errors.length };

      const pct = (x) => `${(x * 100).toFixed(0)}%`;
      console.log(`\n--- ${parserDef.name} on ${gold.repo}/${gold.file} ---`);
      console.log(`Symbols:      P=${pct(symbolScore.precision)} R=${pct(symbolScore.recall)} (${symbolScore.matched}/${symbolScore.expectedTotal} gold matched, ${symbolScore.extracted} extracted)`);
      console.log(`Methods:      P=${pct(methodScore.precision)} R=${pct(methodScore.recall)} (${methodScore.matched}/${methodScore.expectedTotal})`);
      console.log(`Imports:      P=${pct(importScore.precision)} R=${pct(importScore.recall)} (${importScore.matched}/${importScore.expectedTotal})`);
      console.log(`Exports:      P=${pct(exportScore.precision)} R=${pct(exportScore.recall)} (${exportScore.matched}/${exportScore.expectedTotal})`);
      console.log(`Call sites extracted: ${result.callExpressions.length} (unresolved, structural only)`);
      if (symbolScore.falsePositives.length) console.log(`Symbol false positives: ${symbolScore.falsePositives.join(', ')}`);
      if (symbolScore.falseNegatives.length) console.log(`Symbol missed (recall gaps): ${symbolScore.falseNegatives.join(', ')}`);
      if (importScore.falsePositives.length) console.log(`Import false positives: ${importScore.falsePositives.join(', ')}`);
      if (importScore.falseNegatives.length) console.log(`Imports missed: ${importScore.falseNegatives.join(', ')}`);
      if (exportScore.falsePositives.length) console.log(`Export false positives: ${exportScore.falsePositives.join(', ')}`);
      if (exportScore.falseNegatives.length) console.log(`Exports missed: ${exportScore.falseNegatives.join(', ')}`);
    }
  }

  // Machine-readable output for results.md
  const { writeFileSync } = await import('fs');
  writeFileSync('./prototypes/parser-comparison/benchmark/accuracy-results.json', JSON.stringify(report, null, 2));
  console.log('\nSaved: prototypes/parser-comparison/benchmark/accuracy-results.json');
}

main().catch(err => { console.error(err); process.exit(1); });
