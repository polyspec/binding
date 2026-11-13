// The cost of a json value that crosses relay both ways in Node (B2.87, B2.89): carry, which converts the value in by
// json value_in and out by json value_out, against parse(stringify(value)) of json, the path of the text of json
// itself, on a document of one large string and a document of 100000 small strings. Each measurement is the median of
// a fixed number of runs, with the load average of the machine when it was taken; a ratio above the limit prints a
// WARNING line with the value and the limit, and the measurement never fails (make e2e writes BENCH_REPORT).
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as json from '@polyspec/json';
import * as relay from '@polyspec/relay';

const RUNS = 21;
const LIMIT = 1.5;
const report = process.env.BENCH_REPORT;
if (report === undefined || report === '') throw new Error('bench.mjs: BENCH_REPORT names the file of the report');

const documents = [
  ['one large string', `"${'abcdefghijé中'.repeat(100000)}"`],
  ['many small strings', `[${Array.from({ length: 100000 }, () => '"name\\u00e9"').join(',')}]`],
];

function median(run) {
  run();
  const samples = [];
  for (let at = 0; at < RUNS; at += 1) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(RUNS / 2)];
}

const results = [];
for (const [document, source] of documents) {
  const value = json.parse(source);
  const carry = median(() => relay.carry(value));
  const text = median(() => json.parse(json.stringify(value)));
  const ratio = carry / text;
  const loadAverage = loadavg();
  results.push({ language: 'node', document, runs: RUNS, carry_ms: carry, text_ms: text, ratio, load_average: loadAverage });
  process.stdout.write(`node\t${document}\tcarry ${carry.toFixed(3)} ms\ttext ${text.toFixed(3)} ms\tratio ${ratio.toFixed(2)}\tload ${loadAverage.map((l) => l.toFixed(2)).join(' ')}\n`);
  if (ratio > LIMIT) process.stdout.write(`WARNING: node ${document}: carry takes ${ratio.toFixed(2)} times the time of the text path, above the limit ${LIMIT.toFixed(2)}\n`);
}
mkdirSync(dirname(report), { recursive: true });
writeFileSync(`${report}.tmp`, `${JSON.stringify(results, null, 2)}\n`);
renameSync(`${report}.tmp`, report);
