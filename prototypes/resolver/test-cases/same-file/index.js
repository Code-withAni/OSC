export function helper() {
  return 42;
}

export function main() {
  return helper(); // Expected CALLS: main -> helper (high confidence, same file)
}