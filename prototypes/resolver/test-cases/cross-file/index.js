import { helper } from './utils.js';

function main() {
  return helper(); // Expected CALLS: main -> utils.helper (high confidence, imported)
}