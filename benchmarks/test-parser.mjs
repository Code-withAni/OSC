// Simple test script for TypeScript parser (ES module)
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Since the parser is in TypeScript, let's create a minimal inline test
// that demonstrates what the parser should extract

const testContent = `
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface Config {
  name: string;
  version: string;
}

export class FileManager {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async readConfig(): Promise<Config> {
    const content = await readFile(join(this.basePath, 'config.json'), 'utf-8');
    return JSON.parse(content);
  }

  getPath(fileName: string): string {
    return join(this.basePath, fileName);
  }
}

export function calculateSum(a: number, b: number): number {
  return a + b;
}

// TODO: Add error handling
export async function processFile(path: string): Promise<void> {
  const manager = new FileManager('./data');
  const config = await manager.readConfig();
  console.log(config.name);
}
`;

console.log('=== Parser Validation Test ===\n');
console.log('Expected extractions from test sample:\n');

// Expected results
const expected = {
  symbols: [
    { name: 'Config', kind: 'interface', line: 4 },
    { name: 'FileManager', kind: 'class', line: 9 },
    { name: 'constructor', kind: 'method', line: 12 },
    { name: 'readConfig', kind: 'method', line: 16 },
    { name: 'getPath', kind: 'method', line: 21 },
    { name: 'calculateSum', kind: 'function', line: 26 },
    { name: 'processFile', kind: 'function', line: 31 }
  ],
  imports: [
    { specifier: 'fs/promises', names: ['readFile'], line: 2 },
    { specifier: 'path', names: ['join'], line: 3 }
  ],
  exports: [
    { name: 'Config', type: 'named', line: 4 },
    { name: 'FileManager', type: 'named', line: 9 },
    { name: 'calculateSum', type: 'named', line: 26 },
    { name: 'processFile', type: 'named', line: 31 }
  ],
  calls: [
    { called: 'readFile', line: 17 },
    { called: 'join', line: 17 },
    { called: 'JSON.parse', line: 18 },
    { called: 'join', line: 22 },
    { called: 'FileManager', line: 32 },
    { called: 'manager.readConfig', line: 33 },
    { called: 'console.log', line: 34 }
  ],
  todos: [
    { type: 'TODO', text: 'Add error handling', line: 30 }
  ]
};

console.log('Symbols (7 expected):');
expected.symbols.forEach(s => console.log(`  - ${s.name} (${s.kind}) at line ${s.line}`));

console.log('\nImports (2 expected):');
expected.imports.forEach(i => console.log(`  - ${i.specifier}: ${i.names.join(', ')}`));

console.log('\nExports (4 expected):');
expected.exports.forEach(e => console.log(`  - ${e.name} (${e.type})`));

console.log('\nFunction calls (7+ expected):');
expected.calls.forEach(c => console.log(`  - ${c.called}() at line ${c.line}`));

console.log('\nTODO markers (1 expected):');
expected.todos.forEach(t => console.log(`  - ${t.type}: ${t.text}`));

console.log('\n--- Parser Implementation Status ---');
console.log('✓ TypeScript parser exists: parsers/typescript-parser.ts');
console.log('✓ Common model exists: prototypes/common-model.ts');
console.log('✓ Test sample created: benchmarks/test-sample.ts');
console.log('⚠ Need to compile TypeScript to run actual benchmark');
console.log('⚠ Need to clone benchmark repositories at specified commits');
console.log('\nNext steps:');
console.log('1. Set up TypeScript compilation (tsconfig.json + tsc)');
console.log('2. Clone commander.js at ba6d13ddb4243e5913367734f8c159089ffe7834');
console.log('3. Clone date-fns at 18cbd436f1428d0f45f89f710df65f62546c42f0');
console.log('4. Run: node benchmarks/run-parser-benchmark.js');