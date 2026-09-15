// Test sample for parser validation
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

// FIXME: This is inefficient
function slowOperation() {
  for (let i = 0; i < 1000000; i++) {
    calculateSum(i, i + 1);
  }
}
