/**
 * A timer for measuring performance. call start() *with a label, please*, then call finish(). easy.
 */
export default class Timer {
  begin: number;
  end: number;
  label: string;
  constructor() {
    this.begin = 0;
    this.end = 0;
    this.label = '';
  }
  /**
   * @param {string} label what should the timer call this when it prints it
   */
  start(label: string) {
    this.label = label;
    this.begin = performance.now();
  }
  finish() {
    this.end = performance.now();
    console.log(`Timer: ${this.label} took ${this.end - this.begin}ms`);
  }
}
