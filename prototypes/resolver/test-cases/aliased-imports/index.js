import { helper as h } from './utils.js';

function main() {
  return h(); // Expected CALLS: main -> utils.helper (high confidence, aliased import)
}