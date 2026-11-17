// GN-14n (B2.509): the judgement of generated tests that must fail. A repository of tests/e2e with
// expected-failures.json names, for each target, the tests of its generated tests that must fail, each with a text
// that its failure holds. A run of the tests of a target passes only when exactly those tests fail, each with its
// text: a named test that passes or does not run, a failure without its text, and a failure of another test fail the
// step, so the fixture checks that a defect of the generator fails a test, and never that a test is left out.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { GoTestEvents } from './go-test-events.mts';

// The one repository that holds expected-failures.json, a fixture built to fail (AGENTS.md).
export const EXPECTED_FAILURES_HOME = 'tests/e2e/falsepass/expected-failures.json';
// The directories that hold no repository of a run: the installed tools and packages, builds and Git.
const NOT_SCANNED = new Set(['.git', 'node_modules', 'var', 'target', 'dist']);

// Each expected-failures.json under a checkout outside tests/e2e/falsepass, by its path from the checkout. A run reads
// the file from the root of the repository that it checks, which may be any directory, so the whole checkout is read.
export function strayExpectedFailures(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!NOT_SCANNED.has(entry.name)) walk(path);
      } else if (entry.name === 'expected-failures.json' && relative(root, path) !== EXPECTED_FAILURES_HOME) found.push(relative(root, path));
    }
  };
  walk(root);
  return found.sort();
}

// The expected failures of a run of the repository repo, by target, or undefined when it has none; binding is the
// tree of binding that the run checks. Only tests/e2e/falsepass of that tree, compared by real path, has them: the
// file in any other repository, such as one outside the tree, fails the run, so no failure is hidden by it.
export function expectedFailuresOf(repo: string, binding: string): Partial<Record<string, ExpectedFailure[]>> | undefined {
  const path = join(repo, 'expected-failures.json');
  if (!existsSync(path)) return undefined;
  const home = join(binding, dirname(EXPECTED_FAILURES_HOME));
  if (!existsSync(home) || realpathSync(repo) !== realpathSync(home)) throw new Error(`${path} lists expected failures, which only ${dirname(EXPECTED_FAILURES_HOME)} of binding may, so no failure of a target is hidden by it (GN-14n)`);
  return (JSON.parse(readFileSync(path, 'utf8')) as { failures: Partial<Record<string, ExpectedFailure[]>> }).failures;
}

export interface ExpectedFailure {
  // The name of the test as its runner reports it.
  test: string;
  // A text that its failure holds.
  reason: string;
}

export interface FailedTest {
  name: string;
  // What the runner printed of the failure.
  text: string;
}

// The name that a failure without a named test of the runner takes, such as a run that ended before its report.
export const RUN_FAILED = '(the run)';

const firstLines = (text: string): string => text.trim().split('\n').slice(0, 3).join(' ').slice(0, 400);

// The reason that the failed tests of a run are not the expected ones, or undefined when they are.
export function expectedFailureProblem(failed: readonly FailedTest[], expected: readonly ExpectedFailure[] | undefined): string | undefined {
  if (expected === undefined || expected.length === 0) return 'expected-failures.json names no failure for the target';
  const problems: string[] = [];
  for (const want of expected) {
    const got = failed.find((f) => f.name === want.test);
    if (got === undefined) problems.push(`the test ${want.test} passed or did not run, but it must fail with "${want.reason}"`);
    else if (!got.text.includes(want.reason)) problems.push(`the test ${want.test} failed without "${want.reason}": ${firstLines(got.text)}`);
  }
  for (const got of failed) if (!expected.some((want) => want.test === got.name)) problems.push(`the test ${got.name} failed, which expected-failures.json does not name: ${firstLines(got.text)}`);
  return problems.length === 0 ? undefined : problems.join('; ');
}

// The failed tests of a run of unittest by its stderr: each block "FAIL: <name> (<path>)" or "ERROR: <name> (<path>)"
// and the traceback below it, up to the next block or the line "Ran <n> tests". A test is named <class>.<method>, since
// methods of two classes may share a name: the path is <module>.<class>.<method> from Python 3.11 and
// <module>.<class> before it.
export function unittestFailures(stderr: string): FailedTest[] {
  const failed: FailedTest[] = [];
  const blocks = stderr.split(/^={20,}$/m).slice(1);
  for (const block of blocks) {
    const head = /^\s*(?:FAIL|ERROR): (\S+)(?: \(([^)]*)\))?/.exec(block);
    if (head === null) continue;
    const method = head[1] ?? '';
    const path = (head[2] ?? '').split('.');
    if (path.at(-1) === method) path.pop();
    const name = path.length >= 2 ? `${path.at(-1) ?? ''}.${method}` : method;
    failed.push({ name, text: block.split(/^-{20,}\nRan \d+ tests? in /m)[0] ?? block });
  }
  return failed;
}

// The failed tests of a run of go test -json, by the name of the test without its package, with its output.
export function goFailures(read: GoTestEvents): FailedTest[] {
  // The name of a Go test starts with Test, and the path of its package may hold dots. A failure whose name holds no
  // .Test, such as one of an example, has no name that expected-failures.json can hold, so the read fails naming it.
  return read.counts.fail.map((name) => {
    const at = name.search(/\.Test/);
    if (at < 0) throw new Error(`go test reported the failure ${name}, whose name holds no .Test, so it is no test that expected-failures.json can name (GN-14n)`);
    return { name: name.slice(at + 1), text: read.outputs.get(name) ?? '' };
  });
}

const unescaped =(text: string): string =>
  text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&#10;', '\n').replaceAll('&#xA;', '\n').replaceAll('&amp;', '&');

// The failed tests of a JUnit log of node --test or PHPUnit: each testcase with a <failure> or an <error>, by its
// name, with the text of the testcase.
export function junitFailures(xml: string): FailedTest[] {
  return xml.split('<testcase ').slice(1).flatMap((testcase) => {
    const body = testcase.split('</testcase>')[0] ?? testcase;
    if (!/<(failure|error)\b/.test(body)) return [];
    return [{ name: unescaped(/\bname="([^"]*)"/.exec(body)?.[1] ?? ''), text: unescaped(body) }];
  });
}
