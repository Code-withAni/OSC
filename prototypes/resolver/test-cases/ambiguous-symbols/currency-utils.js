// Two different modules both export "format"
// The resolver must handle ambiguous symbols without inventing relationships

export function format(value) {
  return value.toFixed(2);
}