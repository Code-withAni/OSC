// Test file that exercises source file symbols.
// jest-style test() is used so the parser creates test symbols.
// Bodies are single-line so the source calls fall inside the test's line range
// -> TESTED_BY links to the test symbol (not the file).

import { add, multiply, calculate } from './source.js';

test('adds numbers', () => { console.log(add(1, 2)); });           // CALLS: add(1,2) -> source.add; TESTED_BY: source.add -> this test
test('multiplies numbers', () => { console.log(multiply(2, 3)); }); // CALLS: multiply -> source.multiply; TESTED_BY
test('calculates combined result', () => { console.log(calculate(2, 3)); }); // CALLS: calculate -> source.calculate; TESTED_BY