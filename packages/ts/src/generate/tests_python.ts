// The generated unittest module of the Python binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function.

import type { Model } from './model.ts';
import { POISON_ENTRY, callsCode, Unsupported, cleanupWarning, errorUnitOfKind, hookCall, isInternal, langName, memberName, unitOf, takesNull, nativeRoundTrip, awaits, machineFunction } from './model.ts';
import { internalModule } from './python.ts';
import { foreignReaders, foreignClassNames, pythonForeignRead } from './value_class.ts';
import type { Unit } from '../contract.ts';
import { heldTests } from './tests_held.ts';
import { type CallbackHow, type Context, type MadeForm, type Receiver, callArgs, caseRefusal, caseSnake, checkCaseNames, callbackArg, callbackReachingArgs, isPath, isPlain, madeLines, callables, bytesKind, caseValue, fromJson, isNumber, placeholder, fixtureValues, fixturesOf, aliasCases, HOST_VALUES, aliasRepresentative, expectedErrno, judgesCallbackResult, raisingCases, refusedKeyMap, unsafeKeyMap, resultCases, expectedText, pythonTokens, tokenForms, samePairs, sampleReceiver, refusesNull, stringCases, textKind, wrapText, functionFixturesOf, type After, FIXTURE_RAISED, awaitsFunction, callbackCases, stepExpected, caseFilesOf, BYTE_NAME_LINUX, caseListenerOf, serviceSteps, type CaseService } from './samples.ts';
import type { Arg, Fn } from './model.ts';
import { bracketDepth, pyHeader, pyString } from './text.ts';
import { CASE_JSON_STRING_GOLDENS } from './samples.ts';

// GN-13l: native JSON string quoting preserves valid Unicode and rejects surrogate replacement.
const PYTHON_CASE_TEXT_PATH = `

def _case_json_string(value: str) -> str:
    value.encode("utf-8", errors="strict")
    return json.dumps(value, ensure_ascii=False)


def _case_text_path(root: str, relative: str, json_string: bool) -> str:
    path = os.path.join(root, relative)
    quoted = _case_json_string(path)
    return quoted if json_string else path
`;

const PYTHON_CASE_TEXT_GOLDENS = `
    def test_gn13l_case_json_string_golden_bytes(self) -> None:
        for input_hex, expected_hex in (
${CASE_JSON_STRING_GOLDENS.map(({ inputHex, expectedHex }) => `            ("${inputHex}", "${expectedHex}"),`).join('\n')}
        ):
            with self.subTest(input_hex=input_hex):
                value = bytes.fromhex(input_hex).decode("utf-8")
                self.assertEqual(_case_json_string(value).encode("utf-8").hex(), expected_hex)
`;

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['float("nan")', 'float("inf")', 'float("-inf")', '1.5', 'True', '"7"', '-1', '2**53', '2**64'],
  int: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**53', '-(2**53)', '2**63'],
  int64: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**63'],
  float: ['True', '"7"', '1'],
};

// G-5: the callback fixture. A call that no row answers is recorded and raises, so a core that swallows the exception
// still fails the test, which reads the record.
const PYTHON_FIXTURE = `

class _UnexpectedCall(Exception):
    """A call that no row of a callback fixture answers (G-5)."""


def _fixture(members, rows):
    unexpected = []
    calls = []
    left = list(rows)

    def member(name):
        def call(self, *args):
            calls.append((name, args))
            for row in left:
                if row[0] == name and _same(args, row[1]):
                    if row[3]:
                        left.remove(row)
                    if row[4] is not None:
                        raise row[4]
                    return row[2]
            unexpected.append((name, args))
            raise _UnexpectedCall(f"{name}{args!r}")

        return call

    return type("Fixture", (), {name: member(name) for name in members})(), unexpected, calls
`;

// GN-13e: whether a result is the value of a case: the same type at every level, a dict with the same entries in the
// same order, NaN where the case has NaN, and a record with the same fields.
const PYTHON_SAME = `

def _same(actual, expected):
    if isinstance(expected, float) and expected != expected:
        return isinstance(actual, float) and actual != actual
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return len(actual) == len(expected) and all(
            _same(key, other_key) and _same(value, other_value)
            for (key, value), (other_key, other_value) in zip(actual.items(), expected.items())
        )
    if isinstance(expected, (list, tuple)):
        return len(actual) == len(expected) and all(_same(item, other) for item, other in zip(actual, expected))
    if dataclasses.is_dataclass(expected):
        return all(_same(getattr(actual, field.name), getattr(expected, field.name)) for field in dataclasses.fields(expected))
    return actual == expected
`;

// GN-13e, B2.121: _same with a branch that compares two instances of a value class of another repository, or of a map
// class of its owner, by what the members of its in row read (_read_foreign).
const pythonSame = (foreign: string[]): string => (foreign.length === 0 ? PYTHON_SAME : PYTHON_SAME.replace(
  '    return actual == expected\n',
  `    if isinstance(expected, (${foreign.map((c) => `${c},`).join(' ')})):\n        return _read_foreign(actual) == _read_foreign(expected)\n    return actual == expected\n`,
));

// G-5: what a call gives: its result, or the class and the kind of its failure.
// GN-13u: the cleanup call of an instance that a test made, at the end of the test; its result is not judged.
const PYTHON_CLOSED = `

def _closed(made, cleanup):
    try:
        getattr(made, cleanup)()
    except Exception:  # noqa: BLE001, S110
        pass
`;

const PYTHON_OUTCOME = `

def _outcome(call):
    try:
        return ("result", call())
    except Exception as error:
        return ("error", type(error), getattr(error, "kind", None))
`;

// GN-6af: what a test compares of an instance of a value class without core_type: its class and the values that it
// keeps, by the names of its properties.
const PYTHON_KEPT = `

def _kept(instance, names):
    return (type(instance), *(getattr(instance, name) for name in names))
`;

// GN-13n: the arguments that the function fixtures of the test in progress keep by name.
const PYTHON_BOUND = `

# GN-13n: the arguments that the function fixtures of the test in progress keep by name.
_bound: dict[str, object] = {}
`;

// GN-6ae: the exception that a function fixture of the test in progress raises.
const PYTHON_RAISED = `

# GN-6ae: the exception that a function fixture of the test in progress raises.
_raised: list[BaseException] = []
`;

// GN-6y: the directory of a test, in which a case resolves its relative paths; unittest makes an instance per test,
// and the directory is removed at its end.
const PYTHON_CASE_PATH = `
    def _case_path(self, relative: str) -> str:
        if not hasattr(self, "_case_dir"):
            self._case_dir = tempfile.TemporaryDirectory()
            self.addCleanup(self._case_dir.cleanup)
            self._case_root = os.path.realpath(self._case_dir.name)
        return os.path.join(self._case_root, *relative.split("/"))
`;

// GN-13i: a file of a case, written inside the directory of the test with the directories of its path before the values
// of the case are made; its bytes are given as hex.
const PYTHON_CASE_FILE = `
    def _case_file(self, relative: str, content: str) -> None:
        path = self._case_path(relative)
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as file:
            file.write(bytes.fromhex(content))
`;

// GN-13i: a file of a case whose name is bytes that are no Unicode, through the str of those bytes that os.fsdecode gives
// on Linux.
const PYTHON_CASE_BYTE_FILE = `
    def _case_byte_file(self, relative: str, content: str) -> None:
        self._case_file(os.fsdecode(bytes.fromhex(relative)), content)
`;

// GN-13i: the lines that write the files of a case, first in the body of its test.
// GN-13r: then the line that starts the listener of the case.
const caseFileLines = (files: unknown, listener?: unknown): string => `${caseFilesOf(files).some((file) => file.name !== undefined) ? `\n        if sys.platform != "linux":\n            self.skipTest(${pyString(BYTE_NAME_LINUX)})` : ''}${caseFilesOf(files).map((file) => (file.name === undefined ? `\n        self._case_file(${pyString(file.path)}, ${pyString(file.hex)})` : `\n        self._case_byte_file(${pyString(file.name)}, ${pyString(file.hex)})`)).join('')}${caseListenerOf(listener) === undefined ? '' : '\n        self._case_listener()'}`;

// GN-13r: the listener of a case, a child process of the interpreter of the test, because a call that holds the GIL
// would keep a thread of the test from closing the connection. It writes its port as one line, which the test reads
// before it makes the values of the case, and the cleanup of the test kills it and waits for its end.
const PYTHON_CASE_LISTENER_SERVER = `

_CASE_LISTENER_SERVER = (
    "import socket, sys\\n"
    "server = socket.create_server(('127.0.0.1', 0))\\n"
    "sys.stdout.write(f'{server.getsockname()[1]}\\\\n')\\n"
    "sys.stdout.flush()\\n"
    "while True:\\n"
    "    connection, _ = server.accept()\\n"
    "    connection.close()\\n"
)

# GN-13r: the port of the listener of the test in progress.
_case_listener: dict[str, str] = {}
`;
const PYTHON_CASE_LISTENER = `
    def _case_listener(self) -> None:
        server = subprocess.Popen([sys.executable, "-I", "-c", _CASE_LISTENER_SERVER], stdout=subprocess.PIPE, text=True)

        def stop() -> None:
            server.kill()
            server.wait()
            if server.stdout is not None:
                server.stdout.close()
            _case_listener.pop("port", None)

        self.addCleanup(stop)
        port = "" if server.stdout is None else server.stdout.readline().strip()
        if not port.isdigit():
            self.fail(f"G-5: the listener of the case did not start: it exited with {server.wait()} (GN-13r)")
        _case_listener["port"] = port
`;

// GN-13j: the address of the service of a case, which the test run gives in an environment variable, and the program of
// the state of the service, which the test runs with a step, the scope of the case and a JSON text on its input and
// waits for; a missing variable or a status that is not 0 fails the test.
const PYTHON_SERVICE = `


def _service_address(service: str, variable: str) -> str:
    address = os.environ.get(variable, "")
    if address == "":
        raise AssertionError(f"G-5: the service {service} of the case has no address: the test run sets the environment variable {variable} (GN-13j)")
    return address


def _service_state(service: str, variable: str, step: str, scope: str, value: str) -> None:
    program = os.environ.get(variable, "")
    if program == "":
        raise AssertionError(f"G-5: the service {service} of the case has no program of its state: the test run sets the environment variable {variable} (GN-13j)")
    done = subprocess.run([program, step, scope], input=value.encode(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    if done.returncode != 0:
        raise AssertionError(f"G-5: {step} of the service {service} for {scope} exited with {done.returncode}: {done.stdout.decode(errors='replace')} (GN-13j)")
`;

// GN-13q: the peer session of the service of a case, a child process of the program of its state that runs while the
// test runs: the test writes the JSON text of each step as one line and reads the line ready, closes its input at the
// end and waits for its exit; the cleanup of the test kills a peer that it did not end, and waits for it.
const PYTHON_PEER = `


_peers: dict[str, subprocess.Popen[bytes]] = {}


def _service_peer_ready(service: str, scope: str, step: str) -> None:
    peer = _peers[scope]
    assert peer.stdout is not None
    line = peer.stdout.readline()
    if line == b"ready\\n":
        return
    if line == b"":
        del _peers[scope]
        status = peer.wait()
        raise AssertionError(f"G-5: {step} of the peer of the service {service} for {scope} ended before ready with {status} (GN-13q)")
    raise AssertionError(f"G-5: {step} of the peer of the service {service} for {scope} wrote {line!r} in place of ready (GN-13q)")


def _service_peer_write(scope: str, value: str) -> None:
    peer = _peers[scope]
    assert peer.stdin is not None
    try:
        peer.stdin.write(value.encode() + b"\\n")
        peer.stdin.flush()
    except BrokenPipeError:
        # The peer ended; the line that it did not write tells the step.
        pass


def _service_peer(case: unittest.TestCase, service: str, variable: str, scope: str, value: str) -> None:
    program = os.environ.get(variable, "")
    if program == "":
        raise AssertionError(f"G-5: the service {service} of the case has no program of its state: the test run sets the environment variable {variable} (GN-13j)")
    try:
        _peers[scope] = subprocess.Popen([program, "peer", scope], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    except OSError as error:
        raise AssertionError(f"G-5: the peer of the service {service} for {scope} did not start: {error} (GN-13q)") from error
    case.addCleanup(_service_peer_stop, scope)
    _service_peer_write(scope, value)
    _service_peer_ready(service, scope, "peer")


def _service_peer_next(service: str, scope: str, value: str) -> None:
    _service_peer_write(scope, value)
    _service_peer_ready(service, scope, "next")


def _service_peer_end(service: str, scope: str) -> None:
    peer = _peers.pop(scope)
    assert peer.stdin is not None and peer.stdout is not None
    peer.stdin.close()
    status = peer.wait()
    peer.stdout.close()
    if status != 0:
        raise AssertionError(f"G-5: the peer of the service {service} for {scope} exited with {status} (GN-13q)")


def _service_peer_stop(scope: str) -> None:
    peer = _peers.pop(scope, None)
    if peer is None:
        return
    peer.kill()
    peer.wait()
    for stream in (peer.stdin, peer.stdout):
        if stream is not None:
            stream.close()
`;

const pyState = (service: CaseService, state: string, step: string, scope: string, value: string): string =>
  `_service_state(${pyString(service.id)}, ${pyString(state)}, ${pyString(step)}, ${pyString(scope)}, ${pyString(value)})`;

// GN-13j: the lines of the service of a case: its address and its setup first in the body of its test, after its
// files, and its check at the end.
const serviceStart = (service: unknown): string => {
  const steps = serviceSteps(service, 'python');
  if (steps === undefined) return '';
  return `\n        _service_address(${pyString(steps.service.id)}, ${pyString(steps.service.address)})${steps.setup === undefined ? '' : `\n        ${pyState(steps.service, steps.setup.state, 'setup', steps.scope, steps.setup.value)}`}${steps.peer === undefined ? '' : `\n        _service_peer(self, ${pyString(steps.service.id)}, ${pyString(steps.peer.state)}, ${pyString(steps.scope)}, ${pyString(steps.peer.value)})`}`;
};
const serviceEnd = (service: unknown): string => {
  const steps = serviceSteps(service, 'python');
  const peer = steps?.peer === undefined ? '' : `\n        _service_peer_end(${pyString(steps.service.id)}, ${pyString(steps.scope)})`;
  return `${peer}${steps?.check === undefined ? '' : `\n        ${pyState(steps.service, steps.check.state, 'check', steps.scope, steps.check.value)}`}`;
};

// GN-6aq: a future that was cancelled before the call, or one that is never cancelled.
const PYTHON_FUTURE = `
    def _future(self, cancelled: bool) -> concurrent.futures.Future[object]:
        future: concurrent.futures.Future[object] = concurrent.futures.Future()
        if cancelled:
            future.cancel()
        return future
`;

export function pythonTests(model: Model, module: string): string {
  checkCaseNames(model, caseSnake, false);
  const foreignModules = new Set<string>();
  // GN-6r: a name of an internal unit is called in the module of the internal names of its module, which the test
  // imports when it is not the root module.
  const internalModules = new Set<string>();
  const ref = (unit: Unit | undefined): string => {
    if (unit === undefined || !isInternal(unit)) return 'pkg.';
    if (unit.module !== '') internalModules.add(internalModule(unit.module));
    return `pkg.${internalModule(unit.module)}.`;
  };
  // GN-6s, GN-13f: a member of another repository that an instance value names, through the module of its package.
  const owned = (fn: Fn): string | undefined => {
    if (fn.library === undefined) return undefined;
    if (fn.unit.module !== '') throw new Unsupported(`${fn.member.id} of ${fn.library} is in the module ${fn.unit.module}, which a case calls only in the root module (GN-6s, GN-13f)`);
    foreignModules.add(fn.library);
    return `foreign_${fn.library.replaceAll('-', '_')}.`;
  };
  const enumUnit = (name: string): Unit | undefined => model.enums.find((u) => langName('python', u.name, 'class') === name);
  // GN-13l: only actual generation scopes and cached helper metadata carry the immutable case root.
  let caseTextUses = 0;
  let methodMark = 0;
  let usesFunctools = false;
  const expressionMarks: number[] = [];
  const rootExpressions = new Set<string>();
  const rootNeeded = (): boolean => {
    const mark = expressionMarks.at(-1);
    return mark !== undefined && caseTextUses > mark;
  };
  const withRoot = (expression: string, needed: boolean): string => {
    if (needed) {
      rootExpressions.add(expression);
      caseTextUses += 1;
    }
    return expression;
  };
  const useExpression = (expression: string): string => withRoot(expression, rootExpressions.has(expression));
  const caseTextExpression = (make: () => string): string => {
    const mark = caseTextUses;
    expressionMarks.push(mark);
    try {
      const expression = make();
      if (caseTextUses > mark) rootExpressions.add(expression);
      return expression;
    } finally {
      expressionMarks.pop();
    }
  };
  const ctx: Context = { lang: 'python', caseTextExpression, caseTextPath: (relative, jsonString) => {
    caseTextUses += 1;
    return `_case_text_path(_case_text_root, ${pyString(relative)}, ${jsonString ? 'True' : 'False'})`;
  }, enumRef: (name, value) => `${ref(enumUnit(name))}${name}(${pyString(value)})`,
    casePath: (relative) => `self._case_path(${pyString(relative)})`,
    cancelNew: (fired) => `self._future(${fired ? 'True' : 'False'})`,
    serviceAddress: (service) => `_service_address(${pyString(service.id)}, ${pyString(service.address)})`,
    listenerPort: '_case_listener["port"]',
    // GN-6s: an error unit of the owner of a callback unit of another repository, through the module of its package.
    errorNew: (unit, kind, message, library) => {
      if (library !== undefined) foreignModules.add(library);
      return `${library === undefined ? 'pkg' : `foreign_${library.replaceAll('-', '_')}`}.${langName('python', unit.name, 'class')}(${pyString(message)}, ${pyString(kind)})`;
    },
    callbackNew: (unit, how) => {
      const body = 'missing' in how ? '' : 'raise' in how ? `lambda self, *args: (_ for _ in ()).throw(${how.raise})` : how.returns === 'wrong' ? 'lambda self, *args: object()' : 'lambda self, *args: None';
      const members = 'missing' in how ? '' : (unit.members ?? []).filter((m) => m.default === undefined).map((m) => `${pyString(langName('python', m.name, 'callable'))}: ${body}`).join(', ');
      return `type(${pyString(langName('python', unit.name, 'class'))}, (), {${members}})()`;
    },
    // T-3, GN-6c: a record of another repository is the class of the package of that repository, which the test
    // imports; the package of this contract exports no name of it.
    recordNew: (unit, fields) => {
      const library = model.foreignRecords.find((r) => r.unit === unit)?.library;
      if (library !== undefined) foreignModules.add(library);
      const owner = library === undefined ? ref(unit) : `foreign_${library.replaceAll('-', '_')}.`;
      return `${owner}${langName('python', unit.name, 'class')}(${(unit.fields ?? []).map((f, i) => `${langName('python', f.name, 'variable')}=${fields[i] ?? ''}`).join(', ')})`;
    },
    // GN-6x: a class of another repository, through the module of the owner's package.
    foreignClass: (library, unit) => {
      foreignModules.add(library);
      return `foreign_${library.replaceAll('-', '_')}.${langName('python', unit.name, 'class')}`;
    },
  };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  // E-2: the exact class of a kind is the class of the error unit that its row names, or the class of its category.
  // E-2, B-4: the exact class of a failure of a case: the class of the error unit of its kind, or of its category.
  const exactClass = (raises: { kind: string; category: string }): string => {
    const unit = errorUnitOfKind(model, raises.kind);
    return unit === undefined ? cls(raises.category) : langName('python', unit.unit.name, 'class');
  };
  const out: string[] = [];
  const methodRoots: boolean[] = [];
  const append = (...blocks: string[]): number => {
    methodRoots.push(...blocks.map(() => caseTextUses > methodMark));
    methodMark = caseTextUses;
    return out.push(...blocks);
  };
  let usesFixture = false;
  // GN-6z: a function value of a case is a fixture whose one member is the call itself (__call__).
  type Made = { fixture: { arg: Arg }; name: string; values: { members: string[]; rows: string[][]; calls: string[][] | undefined } };
  const withFunctions = (fixtures: Made[], fn: Fn, id: string, args: Map<Arg, unknown>): Made[] => [
    ...fixtures,
    ...functionFixturesOf(model, ctx, fn, id, args, '__call__').map((f, i) => ({ fixture: { arg: f.arg }, name: `function_${String(i)}`, values: { members: f.members, rows: f.rows, calls: undefined } })),
  ];
  let usesErrno = false;
  // The expression that calls a member: a function, a static member or the constructor of a class, or a method or
  // property of an instance that a factory makes (T-5).
  ctx.objectNew = (factory, args) => invoke(factory, args, '');
  // GN-13f: a receiver as one expression; an instance value is made in a function of the module that the expression
  // calls.
  const helpers: string[] = [];
  // GN-13u, B-10: open makes an instance that the test drops without its cleanup call, so it is not closed at the end.
  const made = (receiver: Receiver, value: (arg: Fn['args'][number]) => string | undefined, open = false): string => {
    const mark = caseTextUses;
    if (isPlain(receiver)) {
      const expression = invoke(receiver.factory, callArgs(model, ctx, receiver.factory, value), '');
      return withRoot(expression, caseTextUses > mark);
    }
    const built = steps.apart(() => madeLines(model, open ? { ...madeForm, closing: undefined } : madeForm, receiver));
    const needed = caseTextUses > mark;
    const helper = `_made_${helpers.length}`;
    // GN-13s: a step that calls a helper of the test case (self._case_path, self._future) takes the test case as self.
    const takesSelf = [...built.lines, built.expr].some((line) => /\bself\./.test(line));
    const params = [...(takesSelf ? ['self'] : []), ...(needed ? ['_case_text_root'] : [])].join(', ');
    helpers.push(`\n\ndef ${helper}(${params}):  # noqa: ANN202\n${built.lines.map((line) => `    ${line}\n`).join('')}    return ${built.expr}\n`);
    return withRoot(`${helper}(${params})`, needed);
  };
  ctx.instanceNew = (receiver) => made(receiver, (arg) => caseValue(model, ctx, arg, receiver.args));
  // GN-13e: the parser of Python refuses brackets nested 200 deep, so a value that reaches DEEP is a local variable of a
  // function of the module, which the next step takes; the values inside a function of an instance value are its own.
  const DEEP = 50;
  let pending: string[] = [];
  let deepFunctions = 0;
  const steps = {
    depth: 0,
    bind: (expr: string): string => {
      if (bracketDepth(expr) <= DEEP) return expr;
      const name = `step_${pending.length}`;
      pending.push(`${name} = ${expr}`);
      return name;
    },
    done: (expr: string): string => {
      const last = steps.bind(expr);
      if (pending.length === 0) return last;
      const helper = `_deep_${deepFunctions++}`;
      const needed = rootNeeded();
      helpers.push(`\n\ndef ${helper}(${needed ? '_case_text_root' : ''}):  # noqa: ANN202\n${pending.map((line) => `    ${line}\n`).join('')}    return ${last}\n`);
      pending = [];
      return withRoot(`${helper}(${needed ? '_case_text_root' : ''})`, needed);
    },
    drop: (): void => {
      pending = [];
    },
    apart: <T>(make: () => T): T => {
      const [depth, kept] = [steps.depth, pending];
      steps.depth = 0;
      pending = [];
      try {
        return make();
      } finally {
        steps.depth = depth;
        pending = kept;
      }
    },
  };
  ctx.steps = steps;
  // GN-6aa: a callback value inside another value is the object of a fixture, whose unexpected call raises.
  ctx.fixtureNew = (values) => {
    usesFixture = true;
    return `_fixture((${values.members.map((m) => `${m},`).join(' ')}), [${values.rows.map((row) => `(${row.join(', ')})`).join(', ')}])[0]`;
  };
  // GN-6z: a function value inside another value is the callable of a fixture, whose unexpected call raises.
  ctx.functionNew = (rows) => {
    usesFixture = true;
    return `_fixture(("__call__",), [${rows.map((row) => `(${row.join(', ')})`).join(', ')}])[0]`;
  };
  // GN-13f: the statements that make the receiver of a case, each on a line of the test, and its expression.
  const madeForm: MadeForm = {
    ctx,
    invoke: (fn, args, receiver) => invoke(fn, args, receiver),
    bind: (local, expr) => `${local} = ${expr}`,
    name: (local) => local,
    run: (expr) => expr,
    fails: (expr, kind, what) => {
      usesOutcome = true;
      return `assert _outcome(lambda: ${expr})[::2] == ("error", ${pyString(kind)}), ${pyString(`G-5: ${what}`)}`;
    },
    pick: (expr, step) => 'present' in step ? expr : ('field' in step ? `${expr}.${step.field}` : `${expr}[${'index' in step ? step.index : step.tuple}]`),
    arm: (local, member, faults) => `${local} = _native._arm_faults(${pyString(member)}, ${pyString(faults)})`,
    left: (local, what) => `assert _native._fault_left(${local}) == [], ${pyString(`G-5: ${what}`)}`,
    state: (service, state, step, scope, value) => pyState(service, state, step, scope, value),
    peerNext: (service, scope, value) => `_service_peer_next(${pyString(service.id)}, ${pyString(scope)}, ${pyString(value)})`,
    closing: (name, cleanup) => {
      usesClosed = true;
      return `self.addCleanup(_closed, ${name}, ${pyString(langName('python', cleanup.member.name, 'callable'))})`;
    },
  };
  const receiverOfCase = (receiver: Receiver | undefined): { lines: string; expr: string } => {
    if (receiver === undefined) return { lines: '', expr: '' };
    const built = madeLines(model, madeForm, receiver);
    return { lines: built.lines.map((line) => `\n        ${line}`).join(''), expr: built.expr };
  };
  let usesOutcome = false;
  let usesClosed = false;
  let usesKept = false;
  let usesAsyncio = false;
  let usesThreads = false;
  // GN-6m: the members whose test of a closed loop is written, one per member.
  const closedLoop = new Set<Fn>();
  let usesSame = false;
  let usesTokens = false;
  const invoke = (fn: Fn, args: string, receiver: string): string => {
    useExpression(args);
    useExpression(receiver);
    const hook = hookCall('python', fn, receiver);
    if (hook !== undefined) return hook;
    const member = langName('python', fn.member.name, 'callable');
    const prefix = owned(fn) ?? ref(fn.unit);
    const cls = `${prefix}${langName('python', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `${prefix}${member}(${args})`;
    if (fn.kind === 'constructor') return `${cls}(${args})`;
    if (fn.kind === 'static') return `${cls}.${member}(${args})`;
    if (fn.kind === 'property') return `${receiver}.${member}`;
    return `${receiver}.${member}(${args})`;
  };
  // GN-6ae: the call of the awaited form of a member that waits, a<name>, which gives an awaitable.
  const invokeAwaited = (fn: Fn, args: string, receiver: string): string => {
    const member = `a${langName('python', fn.member.name, 'callable')}`;
    const prefix = owned(fn) ?? 'pkg.';
    if (fn.kind === 'function') return `${prefix}${member}(${args})`;
    if (fn.kind === 'static') return `${prefix}${langName('python', fn.unit.name, 'class')}.${member}(${args})`;
    return `${receiver}.${member}(${args})`;
  };
  // GN-6ae: the function of a function fixture is a function of the module, because a lambda holds no statement: each
  // step calls a method on one of its arguments, and a step that names a result requires it, whose failure is an
  // exception of the function; it then returns its result, raises the instance of an error unit, or raises the
  // exception that the test of the case holds. A fixture with awaits is a coroutine function, whose steps await the
  // awaited form of a member that waits. Two fixtures of one body are one function.
  let usesRaised = false;
  let usesBound = false;
  const functions = new Map<string, { name: string; needsRoot: boolean }>();
  const functionExpression = (helper: { name: string; needsRoot: boolean }): string => {
    if (!helper.needsRoot) return helper.name;
    usesFunctools = true;
    return withRoot(`functools.partial(${helper.name}, _case_text_root)`, true);
  };
  // GN-13n: the arguments that function fixtures keep by name, in the store of the module.
  ctx.boundValue = (name) => {
    usesBound = true;
    return `_bound[${pyString(name)}]`;
  };
  ctx.boundSet = (name, expr) => `${ctx.boundValue?.(name) ?? ''} = ${expr}`;
  ctx.machineFunctionNew = (fixture) => {
    const kept = fixture.names.map((name, i) => `${ctx.boundValue?.(name) ?? ''} = args[${i}]`);
    const lines = [...kept, ...fixture.steps.flatMap((step, i) => {
      const on = typeof step.on === 'number' ? `args[${step.on}]` : (ctx.boundValue?.(step.on) ?? '');
      const call = fixture.awaits && awaits(step.fn) ? `await ${invokeAwaited(step.fn, step.args, on)}` : invoke(step.fn, step.args, on);
      // GN-13o: a step that names raises fails with that kind.
      if (step.raises !== undefined) return [madeForm.fails(call, step.raises, `step ${i} fails with ${step.raises}`)];
      if (step.expected === undefined) return [call];
      if ('refused' in step.expected) return [`raise AssertionError(${pyString(step.expected.refused)})`];
      usesSame = true;
      return [`result_${i} = ${call}`, `expected_${i} = ${step.expected.text}`, `if not _same(result_${i}, expected_${i}):`, `    raise AssertionError(f"{result_${i}!r} is not {expected_${i}!r}")`];
    })];
    usesRaised ||= 'exception' in fixture.end;
    lines.push('result' in fixture.end ? `return ${fixture.end.result}` : 'raise' in fixture.end ? `raise ${fixture.end.raise}` : 'raise _raised[0]');
    const needsRoot = rootNeeded();
    const body = `${fixture.awaits ? 'async ' : ''}def NAME(${needsRoot ? '_case_text_root, ' : ''}*args):  # noqa: ANN002, ANN202\n${lines.map((line) => `    ${line}\n`).join('')}`;
    const known = functions.get(body);
    if (known !== undefined) return functionExpression(known);
    const name = `_function_${functions.size}`;
    const helper = { name, needsRoot };
    functions.set(body, helper);
    helpers.push(`\n\n${body.replace('NAME', name)}`);
    return functionExpression(helper);
  };
  // GN-6ae: the call of a case: a case whose function fixture names awaits runs the awaited form on an event loop.
  const caseCall = (fn: Fn, args: string, receiver: string, given: Map<Fn['args'][number], unknown>): string => {
    if (!awaitsFunction(given)) return invoke(fn, args, receiver);
    usesAsyncio = true;
    return `asyncio.run(${invokeAwaited(fn, args, receiver)})`;
  };
  // GN-6ae: after a case of a member that takes a callback or a function, the table of the crate keeps nothing that
  // was thrown, which the entry point of thrown-count-test counts.
  const kept = (fn: Fn): string => {
    if (!callsCode(model, fn)) return '';
    return '\n        self.assertEqual(_native._thrown_count(), 0)';
  };
  // GN-6ae: the calls of after of a case, each on the receiver of the case, with the result that the case names.
  const afterChecks = (after: After[] | undefined, held: string): string =>
    (after ?? []).map((call, i) => {
      // GN-13o: a call on an argument that a function fixture kept, and a call that fails with a kind.
      const on = call.on === undefined ? held : (ctx.boundValue?.(call.on) ?? '');
      if (call.raises !== undefined) return `\n        ${madeForm.fails(invoke(call.fn, callArgs(model, ctx, call.fn, (arg) => caseValue(model, ctx, arg, call.args)), on), call.raises, `after ${i} fails with ${call.raises}`)}`;
      const receiver = on;
      const expected = stepExpected(model, ctx, call.fn, call.result);
      if ('refused' in expected) return `\n        self.fail(${pyString(expected.refused)})`;
      usesSame = true;
      return `\n        after_${i} = ${invoke(call.fn, callArgs(model, ctx, call.fn, (arg) => caseValue(model, ctx, arg, call.args)), receiver)}\n        expected_${i} = ${expected.text}\n        self.assertTrue(_same(after_${i}, expected_${i}), f"{after_${i}!r} is not {expected_${i}!r}")`;
    }).join('');
  for (const fn of callables(model)) {
    methodMark = caseTextUses;
    const name = fn.kind === 'function' ? langName('python', fn.member.name, 'callable') : `${langName('python', fn.unit.name, 'variable')}_${fn.kind === 'constructor' ? 'new' : langName('python', fn.member.name, 'callable')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample, (arg) => caseValue(model, ctx, arg, sample.args));
    const target = (args: string): string => invoke(fn, args, recv);
    const call = (override: Map<unknown, string>): string =>
      target(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type)));
    const reachable = fn.receiver === undefined || sample !== undefined;
    for (const arg of reachable ? fn.args : []) {
      methodMark = caseTextUses;
      const number = isNumber(arg.type);
      const argName = langName('python', arg.name, 'variable');
      if (number !== undefined) {
        append(`
    def test_b2_${name}_${argName}_refuses_what_is_not_${number}(self) -> None:
        for bad in [${(BAD_NUMBERS[number] ?? []).join(', ')}]:
            with self.subTest(bad=bad):
                with self.assertRaises(pkg.${cls('value')}) as caught:
                    ${call(new Map([[arg, 'bad']]))}
                self.assertIs(type(caught.exception), pkg.${cls('value')})
                self.assertEqual(caught.exception.kind, "invalid_number")`);
      }
      const refused = refusedKeyMap(model, ctx, arg.type);
      if (refused !== undefined) {
        append(`
    def test_t2_${name}_${argName}_refuses_a_${refused.kind}_key(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, refused.value]]))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
      }
      const unsafeKey = unsafeKeyMap(model, ctx, arg.type);
      if (unsafeKey !== undefined) {
        append(`
    def test_b2_${name}_${argName}_refuses_a_key_outside_the_safe_integers(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, unsafeKey]]))}
        self.assertEqual(caught.exception.kind, "invalid_number")`);
      }
      // GN-13d: an optional or a value type takes null as a value, so only another type refuses it.
      if (refusesNull(arg) && !takesNull(model, arg.type)) {
        append(`
    def test_u2_${name}_${argName}_takes_none_as_a_value(self) -> None:
        with self.assertRaises((pkg.${cls('value')}, pkg.${cls('type')})) as caught:
            ${call(new Map([[arg, 'None']]))}
        self.assertIn(caught.exception.kind, ("invalid_argument_type", "invalid_number", "invalid_text"))`);
      }
      // GN-6y: a path with a NUL byte is kind invalid_path, and a value that os.fsencode refuses by its type is kind
      // invalid_argument_type.
      if (isPath(arg.type)) {
        append(`
    def test_t1_${name}_${argName}_refuses_a_nul_byte(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, '"a\\x00b"']]))}
        self.assertEqual(caught.exception.kind, "invalid_path")

    def test_t1_${name}_${argName}_refuses_what_is_no_path(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, '1']]))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
      }
      const bytes = bytesKind(arg.type);
      if (bytes !== undefined) {
        append(`
    def test_t7_${name}_${argName}_refuses_what_is_not_${bytes === 'source' ? 'a_text_or_bytes' : 'bytes'}(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, '1']]))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
      }
      if (bytes === 'source') {
        append(`
    def test_b3_${name}_${argName}_refuses_an_unpaired_surrogate(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, '"\\ud800"']]))}
        self.assertEqual(caught.exception.kind, "invalid_text")`);
      }
      // U-7: a kind of an alias's in function reaches the caller of a member that takes the alias.
      const refusedValue = aliasRepresentative(model, ctx, arg.type);
      if (refusedValue !== undefined) {
        append(`
    def test_u7_${name}_${argName}_gives_the_kind_of_${langName('python', refusedValue.kase.alias.unit.name, 'variable')}(self) -> None:
        with self.assertRaises(pkg.${cls(refusedValue.kase.category)}) as caught:
            ${call(new Map([[arg, refusedValue.value]]))}
        self.assertIs(type(caught.exception), pkg.${exactClass(refusedValue.kase)})
        self.assertEqual(caught.exception.kind, ${pyString(refusedValue.kase.kind)})`);
      }
      const text = textKind(arg.type);
      if (text !== undefined) {
        const bad = text === 'latin1' ? pyString('Ā') : '"\\ud800"';
        append(`
    def test_b3_${name}_${argName}_refuses_${text === 'latin1' ? 'a_character_above_u00ff' : 'an_unpaired_surrogate'}(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, wrapText(arg.type, bad)]]))}
        self.assertEqual(caught.exception.kind, "invalid_text")`);
      }
    }
    // GN-6ae: a parameter of a function type takes a callable, and any other value is kind invalid_callback; the plain
    // form of a member whose function may return an awaitable has no event loop to await it on, which is the same kind
    // with a message that names the awaited form.
    for (const arg of reachable ? fn.args : []) {
      methodMark = caseTextUses;
      if (!machineFunction(arg.type)) continue;
      const argName = langName('python', arg.name, 'variable');
      append(`
    def test_gn6ae_${name}_${argName}_refuses_what_is_no_callable(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, '1']]))}
        self.assertEqual(caught.exception.kind, "invalid_callback")`);
      if (!arg.type.function.async_allowed || fn.machine !== true) continue;
      const awaitable = ctx.machineFunctionNew?.({ names: [], parameters: arg.type.function.parameters.length, awaits: true, steps: [], end: { result: 'None' } }) ?? '';
      append(`
    def test_gn6ae_${name}_${argName}_refuses_an_awaitable_without_an_event_loop(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, awaitable]]))}
        self.assertEqual(caught.exception.kind, "invalid_callback")
        self.assertIn(${pyString(`a${langName('python', fn.member.name, 'callable')}`)}, str(caught.exception))`);
    }
    // GN-6af: an instance of a value class without core_type has no equality of its own in Python, so the two calls of
    // its constructor are compared by the class of the instance and by what it keeps, read through its properties.
    const keptClass = fn.kind === 'constructor' ? model.kept.find((k) => k.unit.id === fn.unit.id) : undefined;
    const keptNames = keptClass?.fields.flatMap((f) => (f.property === undefined ? [] : [pyString(langName('python', f.property.name, 'variable'))])) ?? [];
    const observed = (made: string): string => (keptClass === undefined ? made : `_kept(${made}, (${keptNames.map((n) => `${n},`).join(' ')}))`);
    for (const pair of reachable ? samePairs(model, ctx, fn) : []) {
      methodMark = caseTextUses;
      usesOutcome = true;
      usesKept ||= keptClass !== undefined;
      // GN-13z: the outcomes are compared by _same, which reads an instance of a value class of another repository by
      // the members of its in row, because its class need not declare __eq__ (B2.358).
      usesSame = true;
      const argName = langName('python', pair.arg.name, 'variable');
      append(`
    def test_${pair.rule === 'U-2' ? `u2_${name}_${argName}_left_out_is_its_default` : `t1_${name}_${argName}_takes_a_text_as_its_utf8_bytes`}(self) -> None:
        left = _outcome(lambda: ${observed(target(callArgs(model, ctx, fn, pair.left)))})
        right = _outcome(lambda: ${observed(target(callArgs(model, ctx, fn, pair.right)))})
        self.assertTrue(_same(left, right), f"{left!r} is not {right!r}")`);
    }
    for (const kase of raisingCases(model, fn)) {
      methodMark = caseTextUses;
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        append(`
    def test_b4_${name}_${caseSnake(kase.id)}(self) -> None:
        self.fail(${pyString(refusal)})`);
        continue;
      }
      const receiverMade = receiverOfCase(kase.receiver);
      // GN-13f: the receiver is made before the block that expects the failure, so a receiver that cannot be made fails
      // the test: a receiver that no line made yet is held. GN-6ae: a case with after holds its receiver, which the
      // calls of after observe.
      // A receiver whose factory raises the kind of the case is made inside, since the case may fail there.
      const heldReceiver = kase.faults === undefined && receiverMade.expr !== '' && (kase.after !== undefined || (receiverMade.lines === '' && kase.receiverFails === undefined));
      if (heldReceiver) receiverMade.lines += `\n        receiver = ${receiverMade.expr}`;
      const receiver = heldReceiver ? 'receiver' : receiverMade.expr;
      // G-5: a callback parameter is the fixture of the case, whose record of calls the test reads after the call.
      const fixtures = withFunctions(fixturesOf(model, fn, kase.id, kase.args).map((fixture, i) => ({ fixture, name: `fixture_${i}`, values: fixtureValues(model, ctx, fixture) })), fn, kase.id, kase.args);
      usesFixture ||= fixtures.length > 0;
      const tuple = (items: string[]): string => `(${items.map((item) => `${item},`).join(' ')})`;
      const before = fixtures.map((f) => `\n        ${f.name}, ${f.name}_unexpected, ${f.name}_calls = _fixture(${tuple(f.values.members)}, [${f.values.rows.map((row) => `(${row.join(', ')})`).join(', ')}])`).join('');
      const after = fixtures
        .map((f) => `\n        self.assertEqual(${f.name}_unexpected, [])${f.values.calls === undefined ? '' : `\n        self.assertEqual(${f.name}_calls, [${f.values.calls.map((call) => `(${call.join(', ')})`).join(', ')}])`}`)
        .join('');
      const caseArg = (arg: Fn['args'][number]): string | undefined => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.name;
      };
      // G-5: a case that arms faults makes its receiver and arguments first, so no call but the one under test runs
      // between the arming and that call, and requires every armed fault to have fired.
      const locals = kase.faults === undefined ? [] : [...(receiver === '' ? [] : [['receiver', receiver]]), ...fn.args.flatMap((arg, i) => { const value = caseArg(arg); return value === undefined ? [] : [[`arg_${i}`, value]]; })];
      const arming = kase.faults === undefined ? '' : `${locals.map(([local, value]) => `\n        ${local} = ${value}`).join('')}\n        armed = _native._arm_faults(${pyString(fn.member.id)}, ${pyString(kase.faults)})`;
      const armedCall = invoke(fn, callArgs(model, ctx, fn, (arg) => (caseArg(arg) === undefined ? undefined : `arg_${fn.args.indexOf(arg)}`)), receiver === '' ? '' : 'receiver');
      const errno = expectedErrno(kase);
      usesErrno ||= errno !== null && 'symbol' in errno;
      append(`
    def test_b4_${name}_${caseSnake(kase.id)}(self) -> None:${caseFileLines(kase.files, kase.listener)}${serviceStart(kase.service)}${receiverMade.lines}${before}${arming}
        with self.assertRaises(pkg.${cls(kase.raises.category)}) as caught:
            ${kase.faults === undefined ? caseCall(fn, callArgs(model, ctx, fn, caseArg), receiver, kase.args) : armedCall}${kase.faults === undefined ? '' : '\n        self.assertEqual(_native._fault_left(armed), [])'}
        error = caught.exception
        self.assertIs(type(error), pkg.${exactClass(kase.raises)})
        self.assertIsInstance(error, ${pythonBaseOf(kase.raises.category)})
        self.assertEqual(error.kind, ${pyString(kase.raises.kind)})
${kase.raises.status === undefined ? '' : `        self.assertEqual(error.status, ${kase.raises.status === null ? 'None' : String(kase.raises.status)})\n`}        ${errno === null ? 'self.assertIsNone(error.errno)' : `self.assertEqual(error.errno, ${'symbol' in errno ? `errno.${errno.symbol}` : String(errno.value)})`}${after}${afterChecks(kase.after, 'receiver')}${serviceEnd(kase.service)}${kept(fn)}`);
    }
    // GN-6ae: a case whose function fixture raises an exception of the language gets the same object.
    for (const kase of callbackCases(model, fn)) {
      methodMark = caseTextUses;
      const id = caseSnake(kase.id);
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        append(`
    def test_gn6ae_${name}_${id}(self) -> None:
        self.fail(${pyString(refusal)})`);
        continue;
      }
      const receiverMade = receiverOfCase(kase.receiver);
      const call = caseCall(fn, callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args)), receiverMade.expr === '' ? '' : 'receiver', kase.args);
      usesRaised = true;
      append(`
    def test_gn6ae_${name}_${id}(self) -> None:${caseFileLines(kase.files, kase.listener)}${serviceStart(kase.service)}${receiverMade.lines}${receiverMade.expr === '' ? '' : `\n        receiver = ${receiverMade.expr}`}
        raised = LookupError(${pyString(FIXTURE_RAISED)})
        _raised[:] = [raised]
        with self.assertRaises(LookupError) as caught:
            ${call}
        self.assertIs(caught.exception, raised)${afterChecks(kase.after, 'receiver')}${serviceEnd(kase.service)}${kept(fn)}`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      methodMark = caseTextUses;
      if (kase.refused !== undefined) {
        append(`
    def test_gn13e_${name}_${caseSnake(kase.id)}(self) -> None:
        self.fail(${pyString(kase.refused)})`);
        continue;
      }
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        append(`
    def test_gn13e_${name}_${caseSnake(kase.id)}(self) -> None:
        self.fail(${pyString(refusal)})`);
        continue;
      }
      const fixtures = withFunctions(fixturesOf(model, fn, kase.id, kase.args).map((fixture, i) => ({ fixture, name: `fixture_${i}`, values: fixtureValues(model, ctx, fixture) })), fn, kase.id, kase.args);
      usesFixture ||= fixtures.length > 0;
      const tuple = (items: string[]): string => `(${items.map((item) => `${item},`).join(' ')})`;
      const before = fixtures.map((f) => `\n        ${f.name}, ${f.name}_unexpected, ${f.name}_calls = _fixture(${tuple(f.values.members)}, [${f.values.rows.map((row) => `(${row.join(', ')})`).join(', ')}])`).join('');
      const after = fixtures
        .map((f) => `\n        self.assertEqual(${f.name}_unexpected, [])${f.values.calls === undefined ? '' : `\n        self.assertEqual(${f.name}_calls, [${f.values.calls.map((call) => `(${call.join(', ')})`).join(', ')}])`}`)
        .join('');
      const receiverMade = receiverOfCase(kase.receiver);
      // GN-6ae: a case with after holds its receiver, which the calls of after observe.
      if (kase.after !== undefined && receiverMade.expr !== '') {
        receiverMade.lines += `\n        receiver = ${receiverMade.expr}`;
        receiverMade.expr = 'receiver';
      }
      const receiver = receiverMade.expr;
      const call = caseCall(fn, callArgs(model, ctx, fn, (arg) => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.name;
      }), receiver, kase.args);
      // GN-6m: a<name> of a member with wait process_wait drops its result when its loop was closed before its thread
      // ended. The test keeps the thread of the call from starting until the loop is closed, then starts and joins
      // it, and requires that no exception escaped a thread.
      if (fn.member.wait === 'process_wait' && fixtures.length === 0 && !closedLoop.has(fn)) {
        closedLoop.add(fn);
        usesAsyncio = true;
        usesThreads = true;
        const plain = invoke(fn, callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args)), receiver === '' ? '' : 'subject');
        const awaited = plain.replace(/(\.)([a-z_0-9]+)\(/, (_all, dot: string, member: string) => `${dot}a${member}(`);
        append(`
    def test_gn6m_${name}_drops_its_result_when_its_loop_is_closed(self) -> None:${caseFileLines(kase.files, kase.listener)}${serviceStart(kase.service)}${receiverMade.lines}${receiver === '' ? '' : `\n        subject = ${receiver}`}
        escaped = []
        started = []
        thread_class = threading.Thread

        class Later(thread_class):
            def start(self) -> None:
                started.append(self)

        loop = asyncio.new_event_loop()
        with unittest.mock.patch.object(threading, "Thread", Later), unittest.mock.patch.object(threading, "excepthook", escaped.append):
            task = loop.create_task(${awaited})
            loop.call_soon(loop.stop)
            loop.run_forever()
            task.cancel()
            loop.run_until_complete(asyncio.gather(task, return_exceptions=True))
            loop.close()
            for thread in started:
                thread_class.start(thread)
                thread.join()
        self.assertEqual(len(started), 1)
        self.assertEqual(escaped, [])`);
      }
      const expected = kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      usesSame ||= expected !== undefined && 'text' in expected;
      usesTokens ||= expected !== undefined && 'tokens' in expected;
      const check = expected === undefined
        ? `\n        ${call}`
        : 'refused' in expected
          ? `\n        self.fail(${pyString(expected.refused)})`
          : 'tokens' in expected
            ? expected.round === undefined
              ? `\n        self.assertEqual(_tokens(${call}), json.loads(${pyString(expected.tokens)}))`
              : `\n        result = ${call}\n        expected = json.loads(${pyString(expected.tokens)})\n        self.assertEqual(_tokens(result), expected)\n        self.assertEqual(_tokens(_native._alias_round_${langName('python', expected.round, 'variable')}(result)), expected)`
            : `\n        result = ${call}\n        expected = ${expected.text}\n        self.assertTrue(_same(result, expected), f"{result!r} is not {expected!r}")`;
      append(`
    def test_gn13e_${name}_${caseSnake(kase.id)}(self) -> None:${caseFileLines(kase.files, kase.listener)}${serviceStart(kase.service)}${receiverMade.lines}${before}${check}${after}${afterChecks(kase.after, 'receiver')}${serviceEnd(kase.service)}${kept(fn)}`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    const callback = callbackArg(model, fn);
    // GN-13y: the other arguments of a case that reaches the callback, where one exists.
    const reaching = callbackReachingArgs(model, fn);
    const cbUnit = callback === undefined ? undefined : unitOf(model, callback.type);
    if (callback !== undefined && cbUnit !== undefined && reachable) {
      const with_ = (how: CallbackHow): string =>
        target(callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, how) : reaching === undefined ? placeholder(model, ctx, arg.type, true) : caseValue(model, ctx, arg, reaching))));
      append(`
    def test_k2_${name}_refuses_a_callback_without_its_members(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${with_({ missing: true })}
        self.assertEqual(caught.exception.kind, "invalid_callback")${!fn.failure ? '' : `

    def test_k2_${name}_lets_the_exception_of_a_callback_through(self) -> None:
        raised = LookupError("raised by the callback")
        with self.assertRaises(LookupError) as caught:
            ${with_({ raise: 'raised' })}
        self.assertIs(caught.exception, raised)`}${fn.failure && judgesCallbackResult(model, cbUnit) ? `

    def test_k2_${name}_refuses_a_callback_result_of_another_type(self) -> None:
        with self.assertRaises((${model.classes.map((c) => `pkg.${c.name}`).join(', ')})) as caught:
            ${with_({ returns: 'wrong' })}
        self.assertIn(caught.exception.kind, ("invalid_argument_type", "invalid_number", "invalid_text"))` : ''}`);
      // GN-6q: a member that reaches language code calls the callback on the worker thread of asyncio.to_thread.
      if (fn.reaches === true) {
        usesAsyncio = true;
        const args = callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, { raise: 'raised' }) : reaching === undefined ? placeholder(model, ctx, arg.type, true) : caseValue(model, ctx, arg, reaching)));
        const awaited = invoke(fn, args, recv).replace(/(\.)([a-z_0-9]+)\(/, (_all, dot: string, member: string) => `${dot}a${member}(`);
        append(`
    def test_gn6q_${name}_awaits_a_callback_on_the_thread_of_to_thread(self) -> None:
        raised = LookupError("raised by the callback")
        with self.assertRaises(LookupError) as caught:
            asyncio.run(${awaited})
        self.assertIs(caught.exception, raised)`);
      }
    }
    // GN-6z: a value of a function type that is not callable is refused as it enters.
    const functionArg = fn.args.find((a) => typeof a.type === 'object' && 'function' in a.type && !machineFunction(a.type));
    if (functionArg !== undefined && reachable) {
      append(`
    def test_gn6z_${name}_refuses_a_${langName('python', functionArg.name, 'variable')}_that_is_not_callable(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${target(callArgs(model, ctx, fn, (arg) => (arg === functionArg ? '0' : placeholder(model, ctx, arg.type, true))))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
    }
    for (const kase of stringCases(model, fn)) {
      methodMark = caseTextUses;
      append(`
    def test_n4_${name}_${caseSnake(kase.id)}(self) -> None:${receiverOfCase(kase.receiver).lines}
        self.assertEqual(${invoke(fn, '', receiverOfCase(kase.receiver).expr)}, ${pyString(kase.result)})`);
    }
    // N-4: a hook takes the arguments of the language's protocol, so it has no G-7 test. A member without parameters is
    // a function of no arguments in CPython, which says so for a positional and for a keyword argument; a constructor
    // without parameters is the __new__ of PyO3, which counts the positional arguments and names the keyword.
    if (fn.kind === 'property' || fn.special !== undefined || !reachable) continue;
    const bare = fn.args.length === 0;
    const pyo3New = bare && fn.kind === 'constructor';
    const extra = pyo3New ? 'takes 0 positional arguments' : bare ? 'takes no arguments' : 'positional';
    const unknown = pyo3New ? 'unexpected keyword argument' : bare ? 'takes no keyword arguments' : 'unexpected keyword';
    append(`
    def test_g7_${name}_counts_and_names_its_arguments(self) -> None:${fn.args.every((a) => a.default !== undefined) ? '' : `
        with self.assertRaisesRegex(TypeError, "missing"):
            ${target('')}`}
        with self.assertRaisesRegex(TypeError, "${extra}"):
            ${target(callArgs(model, ctx, fn, values, 'None'))}
        with self.assertRaisesRegex(TypeError, "${unknown}"):
            ${target([callArgs(model, ctx, fn, values), 'not_a_parameter=1'].filter((a) => a !== '').join(', '))}`);
  }
  // B-5c (GN-6h): a poisoned object is refused at every place, and an instance at a write place and another is busy.
  const held = heldTests(model, ctx, invoke, 'held');
  const refused = (category: string, kind: string, call: string): string => `
        with self.assertRaises(pkg.${cls(category)}) as caught:
            ${call}
        self.assertIs(type(caught.exception), pkg.${cls(category)})
        self.assertEqual(caught.exception.kind, ${pyString(kind)})`;
  for (const test of held.poison) {
    append(`
    def test_b5c_${langName('python', test.object.unit.name, 'variable')}_refuses_a_poisoned_object(self) -> None:
        held = ${test.instance}${[`_native.${POISON_ENTRY.python}(held)`, test.receiver, test.parameter].filter((call) => call !== undefined).map((call) => refused('internal', 'internal', call)).join('')}`);
  }
  for (const test of held.busy) {
    append(`
    def test_b5c_${langName('python', test.fn.unit.name, 'variable')}_${langName('python', test.fn.member.name, 'callable')}_refuses_the_instance_at_two_places(self) -> None:
        held = ${test.instance}${test.armed === undefined ? '' : `\n        armed = _native._arm_faults(${pyString(test.fn.member.id)}, ${pyString(test.armed.faults)})`}${refused('busy', 'busy', test.call)}${test.after === undefined ? '' : `\n        ${test.after}`}${test.armed === undefined ? '' : `
        # GN-8a: the refused call did not reach the core, so the next call takes the arming.${refused(test.armed.category, test.armed.kind, test.armed.again)}
        self.assertEqual(_native._fault_left(armed), [])`}`);
  }
  // GN-6o: a method with the receiver self leaves its object consumed, whatever the call gives.
  for (const fn of callables(model).filter((f) => f.receiver === 'self')) {
    methodMark = caseTextUses;
    const sample = sampleReceiver(model, fn);
    if (sample === undefined) continue;
    usesOutcome = true;
    const args = callArgs(model, ctx, fn, (arg) => placeholder(model, ctx, arg.type));
    append(`
    def test_gn6o_${langName('python', fn.unit.name, 'variable')}_${langName('python', fn.member.name, 'callable')}_consumes_its_object(self) -> None:
        held = ${made(sample, (arg) => caseValue(model, ctx, arg, sample.args))}
        _outcome(lambda: ${invoke(fn, args, 'held')})
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${invoke(fn, args, 'held')}
        self.assertEqual(caught.exception.kind, "consumed")`);
  }
  // GN-6p, B-10: an object destroyed without its cleanup call warns with ResourceWarning, and after it does not.
  let usesWarnings = false;
  for (const object of model.objects) {
    const cleanup = object.cleanup;
    const sample = cleanup === undefined ? undefined : sampleReceiver(model, cleanup);
    if (cleanup === undefined || sample === undefined) continue;
    usesWarnings = true;
    usesOutcome = true;
    const variable = langName('python', object.unit.name, 'variable');
    const callName = langName('python', cleanup.member.name, 'callable');
    const recv = made(sample, (arg) => caseValue(model, ctx, arg, sample.args), true);
    const warned = 'self.assertEqual([str(w.message) for w in caught if issubclass(w.category, ResourceWarning)], ';
    append(`
    def test_b10_${variable}_warns_without_${callName}(self) -> None:
        held = ${recv}
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            del held
        ${warned}[${pyString(cleanupWarning(langName('python', object.unit.name, 'class'), memberName('python', cleanup)))}])

    def test_b10_${variable}_does_not_warn_after_${callName}(self) -> None:
        held = ${recv}
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _outcome(lambda: ${invoke(cleanup, callArgs(model, ctx, cleanup, (arg) => placeholder(model, ctx, arg.type)), 'held')})
            del held
        ${warned}[])`);
  }
  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  for (const kase of aliasCases(model)) {
    methodMark = caseTextUses;
    const errno = expectedErrno(kase);
    usesErrno ||= errno !== null && 'symbol' in errno;
    append(`
    def test_u7_${langName('python', kase.alias.unit.name, 'variable')}_in_${caseSnake(kase.id)}(self) -> None:
        with self.assertRaises(pkg.${cls(kase.category)}) as caught:
            _native._alias_in_${langName('python', kase.alias.unit.name, 'variable')}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)})
        self.assertIs(type(caught.exception), pkg.${exactClass(kase)})
        self.assertEqual(caught.exception.kind, ${pyString(kase.kind)})${kase.raises.status === undefined ? '' : `\n        self.assertEqual(caught.exception.status, ${kase.raises.status === null ? 'None' : String(kase.raises.status)})`}
        ${errno === null ? 'self.assertIsNone(caught.exception.errno)' : `self.assertEqual(caught.exception.errno, ${'symbol' in errno ? `errno.${errno.symbol}` : String(errno.value)})`}`);
  }
  // G-5: a value of the language of the sort date (HOST_VALUES) is a date of the module datetime.
  const usesDatetime = out.some((line) => line.includes(HOST_VALUES.date.python));
  // GN-6u: an object goes through the native row and back as the same object, and the binding keeps no reference to it.
  const roundTrip = nativeRoundTrip(model.contract, 'python');
  const roundFn = roundTrip === undefined ? undefined : model.functions.find((f) => f.member.id === roundTrip.id);
  if (roundFn !== undefined) {
    const name = langName('python', roundFn.member.name, 'variable');
    const same = (value: string): string => invoke(roundFn, value, '');
    append(`
    def test_gn6u_${name}_gives_back_the_same_object_and_releases_it(self) -> None:
        ${same('_Subject()')}
        subject = _Subject()
        before = sys.getrefcount(subject)
        self.assertIs(${same('subject')}, subject)
        ${same('_Subject()')}
        self.assertEqual(sys.getrefcount(subject), before)
        alive = weakref.ref(subject)
        del subject
        self.assertIsNone(alive())`);
  }
  if (caseTextUses > 0) {
    methodMark = caseTextUses;
    const relative = 'owned-text-witness/file';
    const rootCallback = (): string => caseTextExpression(() => {
      const value = ctx.caseTextPath?.(relative, false);
      if (value === undefined) throw new Unsupported('GN-13l: the Python case-root callback is missing');
      const callback = ctx.machineFunctionNew?.({ names: [], parameters: 0, awaits: false, steps: [], end: { result: value } });
      if (callback === undefined) throw new Unsupported('GN-13l: the Python function-fixture callback is missing');
      return callback;
    });
    const callback = rootCallback();
    const cachedCallback = rootCallback();
    append(`
    def test_gn13l_composed_callback_uses_old_file_root(self) -> None:
        self._case_file(${pyString(relative)}, "${'726F6F74207769746E657373'.toLowerCase()}")
        callback = ${callback}
        cached_callback = ${cachedCallback}
        for path in (callback(), cached_callback()):
            self.assertEqual(path, self._case_path(${pyString(relative)}))
            with open(path, "rb") as file:
                self.assertEqual(file.read().hex(), "${'726F6F74207769746E657373'.toLowerCase()}")`);
  }
  const usesCaseTextPath = caseTextUses > 0;
  const renderedOut = out.map((block, i) => methodRoots[i] === true
    ? block.replace(/(\n    def test_[^\n]*:\n)/g, '$1        _case_text_root = os.path.dirname(self._case_path("."))\n')
    : block);
  const usesByteFile = out.some((block) => block.includes('self._case_byte_file('));
  const usesCaseFile = usesByteFile || out.some((block) => block.includes('self._case_file('));
  const usesCasePath = usesCaseTextPath || usesCaseFile || out.some((block) => block.includes('self._case_path('));
  const usesFuture = out.some((block) => block.includes('self._future('));
  // GN-13j: the helpers of a service are module functions, which the lines of a test and of a made value call.
  const usesService = [...out, ...helpers].some((block) => /\b_service_(address|state)\(/.test(block));
  // GN-13q: the helpers of a peer session, which the lines of a test with a peer call.
  const usesPeer = [...out, ...helpers].some((block) => /\b_service_peer\(/.test(block));
  // GN-13r: the listener of a case, a child process that the test starts.
  const usesListener = out.some((block) => block.includes('self._case_listener()'));
  // GN-13e, B2.121: _same reads an instance of a value class of another repository through its in row.
  // GN-13bb: a fixture compares the arguments of a call by _same.
  usesSame ||= usesFixture;
  const readers = usesSame ? foreignReaders(model, 'python') : [];
  const foreignClasses = foreignClassNames(readers, ctx.foreignClass as (library: string, unit: Unit) => string);
  const foreignRead = pythonForeignRead(readers, ctx.foreignClass as (library: string, unit: Unit) => string);
  // GN-13e, GN-6ar: the classes that a result of an alias holds; a class of another repository is read through the
  // package of its owner, which the test imports.
  const forms = usesTokens ? tokenForms(model, 'python') : [];
  for (const form of forms) if (form.library !== undefined) foreignModules.add(form.library);
  return `${pyHeader()}
"""The generated tests of the binding (G-5)."""

${usesAsyncio ? 'import asyncio\n' : ''}${usesFuture ? 'import concurrent.futures\n' : ''}${usesSame ? 'import dataclasses\n' : ''}${usesDatetime ? 'import datetime\n' : ''}${usesErrno ? 'import errno\n' : ''}${usesFunctools ? 'import functools\n' : ''}${usesCasePath || usesService ? 'import os\n' : ''}${usesService || usesListener ? 'import subprocess\n' : ''}${usesCasePath ? 'import tempfile\n' : ''}${usesTokens || usesCaseTextPath ? 'import json\n' : ''}${usesTokens ? 'import struct\n' : ''}${roundFn === undefined && !usesListener && !usesByteFile ? '' : 'import sys\n'}${usesThreads ? 'import threading\n' : ''}import unittest
${usesThreads ? 'import unittest.mock\n' : ''}${usesWarnings ? 'import warnings\n' : ''}${roundFn === undefined ? '' : 'import weakref\n'}
import ${module} as pkg
${[...internalModules].sort().map((m) => `import ${module}.${m}\n`).join('')}${[...foreignModules].map((library) => `import ${(model.foreign.get(library)?.packages['python'] as { module: string } | undefined)?.module ?? library} as foreign_${library.replaceAll('-', '_')}\n`).join('')}from ${module} import _native
${usesFixture ? PYTHON_FIXTURE : ''}${usesOutcome ? PYTHON_OUTCOME : ''}${usesClosed ? PYTHON_CLOSED : ''}${usesKept ? PYTHON_KEPT : ''}${usesSame ? `${pythonSame(foreignClasses)}${foreignRead}` : ''}${roundFn === undefined ? '' : PYTHON_SUBJECT}${usesTokens ? pythonTokens(forms) : ''}${usesRaised ? PYTHON_RAISED : ''}${usesBound ? PYTHON_BOUND : ''}${usesService ? PYTHON_SERVICE : ''}${usesPeer ? PYTHON_PEER : ''}${usesListener ? PYTHON_CASE_LISTENER_SERVER : ''}${usesCaseTextPath ? PYTHON_CASE_TEXT_PATH : ''}${helpers.join('')}

class GeneratedTest(unittest.TestCase):${usesCasePath ? PYTHON_CASE_PATH : ''}${usesCaseTextPath ? PYTHON_CASE_TEXT_GOLDENS : ''}${usesCaseFile ? PYTHON_CASE_FILE : ''}${usesByteFile ? PYTHON_CASE_BYTE_FILE : ''}${usesListener ? PYTHON_CASE_LISTENER : ''}${usesFuture ? PYTHON_FUTURE : ''}
    def test_b7_a_panic_is_kind_internal(self) -> None:
        with self.assertRaises(pkg.${cls('internal')}) as caught:
            _native._panic_test()
        self.assertEqual(caught.exception.kind, "internal")
        self.assertIsInstance(caught.exception, RuntimeError)
${renderedOut.join('\n')}


if __name__ == "__main__":
    unittest.main()
`;
}

// GN-6u: the subject of the round-trip test, an instance of a class of the test, since a built-in value may be
// interned or cached.
const PYTHON_SUBJECT = `

class _Subject:
    """An object that only the test makes."""
`;

const pythonBaseOf = (category: string): string =>
  ({ value: 'ValueError', type: 'TypeError', io: 'OSError', store: 'RuntimeError', busy: 'RuntimeError', internal: 'RuntimeError' })[category] ?? 'Exception';
