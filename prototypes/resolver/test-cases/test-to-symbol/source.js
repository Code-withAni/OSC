// Source file with functions to be tested

export function add(a, b) {
  return a + b;
}

export function multiply(a, b) {
  return a * b;
}

export function calculate(a, b) {
  return add(a, b) + multiply(a, b); // CALLS: calculate -> add, multiply
}