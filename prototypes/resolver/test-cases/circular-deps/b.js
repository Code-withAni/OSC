// Circular dependency: B imports A, creating a cycle

import { valueA } from './a.js';

export function processB() {
  console.log('B', valueA); // CALLS: processB -> valueA (high confidence)
}

export const valueB = 'from B';