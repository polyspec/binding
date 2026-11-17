// The go command of a command of binding that starts Go (GN-15l, GN-19f, B2.456). binding starts Go in two places: for
// the go.sum of a go.mod that requires a release (`go mod download`, binding check and binding scaffold), and for the
// consumer that proves the commit of a Go module (`go mod tidy`, `go test`, `go clean`, binding release-go-module).
// Both take the command from here, so a machine without it gets one sentence that says why it is needed and names the
// tool, the option and the variable, and never the error of a program that did not start.

import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

// How a caller gives the command: the option of the CLI and the variable of the release recipes (GN-19h).
const HOW = 'install Go, or name the go command with --go <command>, the value of $(GO) of the release recipes (GN-19h)';

const isProgram = (path: string): boolean => {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

// The words of the go command, or the sentence of its refusal. `given` holds the words of --go, and without it the
// command is the `go` of PATH. A program with a directory in its name is that file; any other is looked for in the
// directories of PATH of `env`, the environment that the command is started with. `need` says why the caller starts Go,
// and comes first in the sentence. A caller asks only when it is about to start Go, so a run that needs no Go never
// reads PATH for it.
export function goCommand(given: readonly string[] | undefined, env: Readonly<Record<string, string | undefined>>, need: string): { command: [string, ...string[]] } | { refusal: string } {
  const [program = 'go', ...words] = given ?? [];
  const of = given === undefined ? '' : ' of --go';
  if (program.includes('/')) {
    if (isProgram(program)) return { command: [program, ...words] };
    return { refusal: `${need}, and the go command \`${program}\`${of} is not found: ${HOW}` };
  }
  const found = (env['PATH'] ?? '').split(delimiter).some((dir) => dir !== '' && isProgram(join(dir, program)));
  if (found) return { command: [program, ...words] };
  return { refusal: `${need}, and the go command \`${program}\`${of} is not found on PATH: ${HOW}` };
}
