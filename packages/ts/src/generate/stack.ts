// GN-1c, GN-13e: the generation on a thread whose stack holds the nesting of any case value. The generator walks a case
// value by recursion, several frames for each level, and a case may nest a value past the depth limit of its core
// (json gives 513 and 772 levels), more than the stack of the main thread holds. The caller waits for the thread, so
// the generation stays one synchronous call with the result and the refusals of `generate`.
//
// B2.542: the process keeps one such thread and gives it each generation in turn. A thread that loads this module as
// TypeScript leaves the address space of its type stripping in the process when it ends, about 1 GiB, and a thread for
// each generation grew a process past what Linux lets it fork. A thread that ends while it holds a generation fails
// that generation with its cause (failHeldRequest), and the next generation starts a new thread; nothing is sent again.

import { isMainThread, MessageChannel, type MessagePort, parentPort, receiveMessageOnPort, Worker, workerData } from 'node:worker_threads';
import { generate, type Inputs } from './index.ts';
import { Unsupported } from './model.ts';

// The stack of the thread in MiB: room for tens of thousands of levels, far past the nesting of any case.
const STACK_MB = 1024;

type Outcome =
  | { files: [string, string][] }
  | { refusals: string[] }
  | { message: string }
  | { failure: string }
  | { ended: string };

// A generation that the thread holds: the port of its outcome and the word that wakes the caller.
interface Held {
  port: MessagePort;
  done: Int32Array;
}

// A failure of the generation that is no refusal, which the caller does not take for a sentence of a target.
export class GenerationFailure extends Error {}

let thread: Worker | undefined;

// The generation thread of this process, or undefined before the first generation and after the thread ended.
export function generationThread(): Worker | undefined {
  return thread;
}

function liveThread(): Worker {
  // A Worker that has ended has the threadId -1.
  if (thread === undefined || thread.threadId < 0) {
    thread = new Worker(new URL(import.meta.url), { workerData: { generationThread: true }, resourceLimits: { stackSizeMb: STACK_MB } });
    // The thread waits for generations and does not keep the process alive.
    thread.unref();
  }
  return thread;
}

export function generateOnStack(inputs: Inputs): ReturnType<typeof generate> {
  const done = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = liveThread();
  worker.postMessage({ inputs, port: port2, done }, [port2]);
  // The thread always posts its outcome and then wakes this one, also when the generation fails or the thread ends.
  Atomics.wait(done, 0, 0);
  const outcome = receiveMessageOnPort(port1)?.message as Outcome | undefined;
  port1.close();
  if (outcome === undefined) throw new GenerationFailure('internal: the generation thread posted no outcome');
  if ('files' in outcome) return new Map(outcome.files);
  if ('refusals' in outcome) throw new Unsupported(outcome.refusals);
  if ('message' in outcome) throw new Error(outcome.message);
  if ('ended' in outcome) {
    if (thread === worker) thread = undefined;
    throw new GenerationFailure(outcome.ended);
  }
  throw new GenerationFailure(outcome.failure);
}

// The thread ended while it held a generation: that generation fails with the exit code, and its caller wakes.
export function failHeldRequest(held: Held, code: number): void {
  held.port.postMessage({ ended: `the generation thread ended (code ${code}) before its generation did` } satisfies Outcome);
  held.port.close();
  Atomics.store(held.done, 0, 1);
  Atomics.notify(held.done, 0);
}

if (!isMainThread && (workerData as { generationThread?: boolean } | null)?.generationThread === true) {
  let held: Held | undefined;
  process.on('exit', (code) => {
    if (held !== undefined) failHeldRequest(held, code);
  });
  parentPort?.on('message', (request: Held & { inputs: Inputs }) => {
    held = { port: request.port, done: request.done };
    let outcome: Outcome;
    try {
      outcome = { files: [...generate(request.inputs)] };
    } catch (error) {
      if (error instanceof Unsupported) outcome = { refusals: error.refusals };
      else if (error instanceof Error && error.constructor === Error) outcome = { message: error.message };
      else outcome = { failure: error instanceof Error ? (error.stack ?? error.message) : String(error) };
    }
    held = undefined;
    request.port.postMessage(outcome);
    request.port.close();
    Atomics.store(request.done, 0, 1);
    Atomics.notify(request.done, 0);
  });
}
