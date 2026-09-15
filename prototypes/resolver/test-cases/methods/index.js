class Calculator {
  constructor(initialValue) {
    this.value = initialValue;
  }

  add(x) {
    return x + this.getValue(); // CALLS: add -> getValue (medium confidence)
  }

  getValue() {
    return this.value;
  }

  static create() {
    return new Calculator(0); // CALLS: create -> Calculator constructor
  }

  // this.method() - partial: method on this without enclosing class detection
  clone() {
    return new Calculator(this.getValue()); // CALLS: clone -> getValue (medium confidence)
  }
}

const calc = new Calculator(10);
calc.add(5); // top-level call, no enclosing symbol

export { Calculator };