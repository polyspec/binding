// GN-14n, GN-14f (B2.509): the judgement of the run of go-musl-check (scripts/go-musl.sh) of a repository, by the
// rules of make e2e: the events of go test -json of the musl run pass when a test passed and the failed tests are
// those that expected-failures.json of the repository names for go, each with its text; a repository without that
// file passes only when no test failed. Each problem is printed on a line of its own.
//
//   node scripts/go-musl-judge.mts <events of go test -json> <repository>

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expectedFailureProblem, expectedFailuresOf, goFailures } from './e2e-expected.mts';
import { readGoTestEvents } from './go-test-events.mts';

const [events, repo] = process.argv.slice(2);
if (events === undefined || repo === undefined) {
  process.stderr.write('usage: node scripts/go-musl-judge.mts <events of go test -json> <repository>\n');
  process.exit(2);
}
const binding = join(dirname(new URL(import.meta.url).pathname), '..');
const read = readGoTestEvents(readFileSync(events, 'utf8'));
const failed = goFailures(read);
const expected = expectedFailuresOf(repo, binding);
const problems: string[] = [];
if (read.counts.pass.length === 0) problems.push('no test passed on musl');
if (expected === undefined) {
  for (const f of failed) problems.push(`the test ${f.name} failed on musl`);
  if (failed.length === 0 && read.packageFailures.length > 0) problems.push(`go test failed the packages ${read.packageFailures.join(', ')} on musl`);
} else {
  const problem = expectedFailureProblem(failed, expected['go']);
  if (problem !== undefined) problems.push(problem);
}
if (problems.length > 0) {
  process.stderr.write(`go-musl-check: ${problems.join('\ngo-musl-check: ')}\n`);
  process.exit(1);
}
process.stdout.write(`go-musl-check: the failed tests on musl are those of ${expected === undefined ? 'none' : 'expected-failures.json'} (GN-14n)\n`);
