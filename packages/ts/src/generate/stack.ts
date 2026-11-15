// GN-1c, GN-13e: the generation on a thread whose stack holds the nesting of any case value. The generator walks a case
// value by recursion, several frames for each level, and a case may nest a value past the depth limit of its core
// (json gives 513 and 772 levels), more than the stack of the main thread holds. The caller waits for the thread, so
// the generation stays one synchronous call with the result and the refusals of `generate`.

import { isMainThread, MessageChannel, type MessagePort, receiveMessageOnPort, Worker, workerData } from 'node:worker_threads';
import { generate, type Inputs } from './index.ts';
import { Unsupported } from './model.ts';

// The stack of the thread in MiB: room for tens of thousands of levels, far past the nesting of any case.
const STACK_MB = 1024;

type Outcome =
  | { files: [string, string][] }
  | { refusals: string[] }
  | { message: string }
  | { failure: string };

// A failure of the generation that is no refusal, which the caller does not take for a sentence of a target.
export class GenerationFailure extends Error {}

export function generateOnStack(inputs: Inputs): ReturnType<typeof generate> {
  const done = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { generateOnStack: { inputs, port: port2, done } },
    transferList: [port2],
    resourceLimits: { stackSizeMb: STACK_MB },
  });
  // The thread always posts its outcome and then wakes this one, also when the generation fails.
  Atomics.wait(done, 0, 0);
  const outcome = receiveMessageOnPort(port1)?.message as Outcome | undefined;
  port1.close();
  void worker.terminate();
  if (outcome === undefined) throw new GenerationFailure('internal: the generation thread posted no outcome');
  if ('files' in outcome) return new Map(outcome.files);
  if ('refusals' in outcome) throw new Unsupported(outcome.refusals);
  if ('message' in outcome) throw new Error(outcome.message);
  throw new GenerationFailure(outcome.failure);
}

const job = isMainThread ? undefined : (workerData as { generateOnStack?: { inputs: Inputs; port: MessagePort; done: Int32Array } } | null)?.generateOnStack;
if (job !== undefined) {
  let outcome: Outcome;
  try {
    outcome = { files: [...generate(job.inputs)] };
  } catch (error) {
    if (error instanceof Unsupported) outcome = { refusals: error.refusals };
    else if (error instanceof Error && error.constructor === Error) outcome = { message: error.message };
    else outcome = { failure: error instanceof Error ? (error.stack ?? error.message) : String(error) };
  }
  job.port.postMessage(outcome);
  job.port.close();
  Atomics.store(job.done, 0, 1);
  Atomics.notify(job.done, 0);
}
