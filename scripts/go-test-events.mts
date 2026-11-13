// GN-14a: the events of go test -json. The run counts the tests that passed, failed and were skipped, prints the
// output of the tests and of the builds, and names a package that failed without a failed test by the output of its
// build: a package that does not build gives that output only in build-output events, which name it by ImportPath.

export interface GoTestEvents {
  counts: { pass: string[]; fail: string[]; skip: string[] };
  // The packages that failed as a whole, in the order of their events.
  packageFailures: string[];
  // The output of each build, by the ImportPath of its events.
  builds: Map<string, string>;
  // The output that the run prints: the lines that are no event, the output of the builds and of the tests.
  printed: string;
}

interface Event {
  Action: string;
  Package?: string;
  ImportPath?: string;
  Test?: string;
  Output?: string;
}

export function readGoTestEvents(stdout: string): GoTestEvents {
  const read: GoTestEvents = { counts: { pass: [], fail: [], skip: [] }, packageFailures: [], builds: new Map(), printed: '' };
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) {
      if (line !== '') read.printed += `${line}\n`;
      continue;
    }
    const event = JSON.parse(line) as Event;
    if (event.Action === 'build-output' && event.Output !== undefined) {
      const path = event.ImportPath ?? '';
      read.builds.set(path, `${read.builds.get(path) ?? ''}${event.Output}`);
      read.printed += event.Output;
      continue;
    }
    if (event.Action === 'output' && event.Output !== undefined) read.printed += event.Output;
    const name = `${event.Package ?? ''}.${event.Test ?? ''}`;
    if (event.Test !== undefined && (event.Action === 'pass' || event.Action === 'fail' || event.Action === 'skip')) read.counts[event.Action].push(name);
    if (event.Test === undefined && event.Action === 'fail') read.packageFailures.push(event.Package ?? '');
  }
  return read;
}

// The cause of a run whose packages failed without a failed test: the packages and the output of each failed build,
// one line each. A run with a failed test names its cause by the tests, so it has none here.
export function goPackageFailure(read: GoTestEvents, status: number | null): string | undefined {
  if (read.packageFailures.length === 0 || read.counts.fail.length > 0) return undefined;
  const builds = [...read.builds].map(([path, output]) => `: ${path}: ${output.trim().split('\n').join(' ')}`).join('');
  return `go test failed the packages ${read.packageFailures.join(', ')} (status ${String(status)})${builds}`;
}
