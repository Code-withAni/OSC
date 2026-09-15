import { helper } from './middle.js';

function main() {
  return helper(); // Expected CALLS: main -> utils.helper (high confidence, via re-export chain)
}