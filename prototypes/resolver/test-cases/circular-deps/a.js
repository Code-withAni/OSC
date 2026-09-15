// Circular dependency: A imports B, B imports A

import { processB } from './b.js';

export function processA() {
  console.log('A');
  processB(); // CALLS: processA -> processB (high confidence, but in circular chain)
}

export const valueA = 'from A';