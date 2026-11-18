// B2.542 (generator GN-1c): a process keeps one generation thread and gives it each generation in turn, a generation
// leaves nothing in it that changes a later one, and a thread that ends gives way to a new one for the next
// generation. A thread that ends while it holds a generation fails that generation with its cause through
// failHeldRequest, which its 'exit' listener calls; the test calls it on a held request of its own. The inputs are the copies of http-cookie and php-serialization under tests/fixtures/consumers.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import type { Inputs } from '../src/generate/index.ts';
import { failHeldRequest, generateOnStack, generationThread } from '../src/generate/stack.ts';

const consumer = (path: string): any => JSON.parse(readFileSync(new URL(`fixtures/consumers/${path}`, import.meta.url), 'utf8'));

const inputsOf = (name: string, coreLib: string): Inputs => {
  const contract = consumer(`${name}/interface.json`);
  const files = [...new Set((contract.cases as { file: string }[]).map((row) => row.file))];
  return { contract, caseFiles: new Map(files.map((file) => [file, consumer(`${name}/${file}`)])), version: '0.0.0', coreLib, targets: ['typescript'] };
};

const cookie = (): Inputs => inputsOf('http-cookie', 'polyspec_http_cookie');
const serialization = (): Inputs => inputsOf('php-serialization', 'polyspec_php_serialization');

test('B2.542: every generation of a process runs on the one generation thread', () => {
  generateOnStack(cookie());
  const first = generationThread();
  assert.notEqual(first, undefined, 'a generation leaves its thread for the next one');
  generateOnStack(serialization());
  generateOnStack(cookie());
  assert.equal(generationThread(), first, 'the later generations ran on the same thread');
});

test('B2.542: a generation gives the same files after another generation as before it', () => {
  const before = generateOnStack(cookie());
  generateOnStack(serialization());
  const after = generateOnStack(cookie());
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [path, body] of before) assert.equal(String(after.get(path)), String(body), path);
});

test('B2.542: a thread that ends while it holds a generation fails that generation with its cause', async () => {
  const done = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const woken = Atomics.waitAsync(done, 0, 0);
  failHeldRequest({ port: port2, done }, 7);
  assert.equal(await woken.value, 'ok', 'the waiting side is woken');
  assert.deepEqual(receiveMessageOnPort(port1)?.message, { ended: 'the generation thread ended (code 7) before its generation did' });
  port1.close();
});

test('B2.542: after the generation thread ends, the next generation starts a new one and succeeds', async () => {
  const expected = generateOnStack(cookie());
  const ended = generationThread();
  assert.notEqual(ended, undefined);
  await ended?.terminate();
  const out = generateOnStack(cookie());
  assert.notEqual(generationThread(), ended, 'a new thread');
  assert.deepEqual([...out.keys()].sort(), [...expected.keys()].sort());
});
