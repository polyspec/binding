// GN-14f, GN-15g: scripts/go-musl.sh, the run of the consumer of the released form of a Go module on musl. The cases run
// the script with stand-ins on PATH: a docker that runs the commands of the container on this machine with the
// variables that it was given and the work directory as WORK_ROOT, and an apk, wget, sha256sum, tar and go of the
// case, so no case starts a container or a build.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

const top = new URL('../../../', import.meta.url).pathname;
const script = join(top, 'scripts/go-musl.sh');

// The events of go test -json of a build that the linker stops, as go 1.27 writes them.
const EVENTS = [
  '{"ImportPath":"example.invalid/consumer.test","Action":"build-output","Output":"# example.invalid/consumer.test\\n"}',
  '{"ImportPath":"example.invalid/consumer.test","Action":"build-output","Output":"/usr/lib/gcc/aarch64-alpine-linux-musl/14.2.0/../../../../aarch64-alpine-linux-musl/bin/ld: cannot find -lunwind: No such file or directory\\n"}',
  '{"ImportPath":"example.invalid/consumer.test","Action":"build-fail"}',
  '{"Action":"start","Package":"example.invalid/consumer"}',
  '{"Action":"output","Package":"example.invalid/consumer","Output":"FAIL\\texample.invalid/consumer [build failed]\\n"}',
  '{"Action":"fail","Package":"example.invalid/consumer","Elapsed":0,"FailedBuild":"example.invalid/consumer.test"}',
].join('\n');

function box(t: TestContext, consumer: boolean): { work: string; run: () => { status: number | null; output: string } } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-go-musl-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  const work = join(root, 'work');
  mkdirSync(bin);
  mkdirSync(work);
  if (consumer) mkdirSync(join(work, 'go-release/consumer'), { recursive: true });
  const tool = (name: string, body: string): void => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  // docker info prints the arch; docker run exports each -e, sets WORK_ROOT to the directory of -v, and runs sh -c.
  tool('docker', `if [ "$1" = info ]; then echo aarch64; exit 0; fi
[ "$1" = run ] || exit 0
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    -e) shift; export "$1" ;;
    -v) shift; WORK_ROOT_HOST=\${1%%:*} ;;
    --name) shift ;;
    --rm) ;;
    sh) shift; shift; break ;;
    *) ;;
  esac
  shift
done
export WORK_ROOT="$WORK_ROOT_HOST"
exec sh -c "$1"`);
  for (const name of ['apk', 'wget', 'sha256sum', 'tar']) tool(name, 'exit 0');
  tool('go', `if [ "$1" = list ]; then exit 0; fi
cat <<'EVENTS'
${EVENTS}
EVENTS
exit 1`);
  const lock = join(root, 'mise.lock');
  writeFileSync(lock, '[tools.go."platforms.linux-arm64"]\nchecksum = "sha256:00"\nurl = "https://example.invalid/go.tar.gz"\n');
  const toolchain = join(root, 'toolchain.json');
  writeFileSync(toolchain, '{\n  "goMusl": {\n    "image": "alpine:3.22@sha256:00",\n    "gcc": "14.2.0-r6",\n    "musl-dev": "1.2.5-r13"\n  }\n}\n');
  return {
    work,
    run: () => {
      const ran = spawnSync('sh', [script, work, lock, toolchain], { encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin` } });
      return { status: ran.status, output: `${ran.stdout}${ran.stderr}` };
    },
  };
}

test('B2.416: go-musl-check prints the output of each build-output event, the error of the linker included, and fails the build (GN-14f)', (t) => {
  const ran = box(t, true).run();
  assert.notEqual(ran.status, 0, ran.output);
  assert.match(ran.output, /ld: cannot find -lunwind: No such file or directory/);
  assert.match(ran.output, /# example\.invalid\/consumer\.test/);
  assert.match(ran.output, /\(musl\): 0 passed, 0 failed, exit 1/);
});

test('B2.417: go-musl-check names a work directory without the consumer of a released form and starts no container (GN-14k, GN-14f)', (t) => {
  const b = box(t, false);
  const ran = b.run();
  assert.equal(ran.status, 2, ran.output);
  assert.match(ran.output, new RegExp(`go-musl-check: ${b.work} holds no released form of a Go module \\(go-release/consumer\\)`));
  assert.doesNotMatch(ran.output, /can't cd/);
});
