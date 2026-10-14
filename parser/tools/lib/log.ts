/** Tiny console helpers so pipeline steps read consistently in a terminal. */

const COLOR = process.stdout.isTTY === true && !process.env.NO_COLOR;
const ESC = String.fromCharCode(27);
const esc = (code: string) => (COLOR ? `${ESC}[${code}m` : '');
const BOLD = esc('1');
const GREEN = esc('32');
const YELLOW = esc('33');
const RED = esc('31');
const RESET = esc('0');

let failures = 0;
const problems: string[] = [];

export function step(name: string): void {
  process.stdout.write(`\n${BOLD}-- ${name}${RESET}\n`);
}

export function info(msg: string): void {
  process.stdout.write(`   ${msg}\n`);
}

export function ok(msg: string): void {
  process.stdout.write(`   ${GREEN}ok${RESET}   ${msg}\n`);
}

export function warn(msg: string): void {
  process.stdout.write(`   ${YELLOW}warn${RESET} ${msg}\n`);
}

export function fail(msg: string): void {
  failures++;
  problems.push(msg);
  process.stdout.write(`   ${RED}FAIL${RESET} ${msg}\n`);
}

/** Soft assertion: records a failure but lets the run continue to collect more. */
export function check(condition: boolean, msg: string): boolean {
  if (condition) ok(msg);
  else fail(msg);
  return condition;
}

export function checkEqual(actual: unknown, expected: unknown, label: string): boolean {
  const same = actual === expected;
  return check(same, `${label}: ${String(actual)}${same ? '' : ` (expected ${String(expected)})`}`);
}

/**
 * Reports a mismatch as a warning rather than a failure. Used for values a
 * Steam workshop update can legitimately change (file sizes, offsets, counts) —
 * we want loud drift detection, not a broken build.
 */
export function checkSoft(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) ok(`${label}: ${String(actual)}`);
  else warn(`${label}: ${String(actual)} (expected ${String(expected)} - VPK may have been updated)`);
}

export function failureCount(): number {
  return failures;
}

export function exitIfFailed(): void {
  if (failures > 0) {
    process.stdout.write(`\n${RED}${failures} check(s) failed:${RESET}\n`);
    for (const p of problems) process.stdout.write(`  - ${p}\n`);
    process.exit(1);
  }
}
