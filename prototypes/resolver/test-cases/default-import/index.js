import helper from './utils.js';

function main() {
  return helper(); // Expected CALLS: main -> utils.default(helper) (high confidence, default import)
}