<?php

// The cost of a json value that crosses relay both ways in PHP (B2.87, B2.89): carry, which converts the value in by
// json value_in and out by json value_out, against parse(stringify(value)) of json, the path of the text of json
// itself, on a document of one large string and a document of 100000 small strings. Each measurement is the median of
// a fixed number of runs, with the load average of the machine when it was taken; a ratio above the limit prints a
// WARNING line with the value and the limit, and the measurement never fails (make e2e writes BENCH_REPORT).

declare(strict_types=1);

use Polyspec\Json as Json;
use Polyspec\Relay as Relay;

const RUNS = 21;
const LIMIT = 1.5;

$report = getenv('BENCH_REPORT');
if (!is_string($report) || $report === '') {
    throw new RuntimeException('bench.php: BENCH_REPORT names the file of the report');
}

$documents = [
    'one large string' => '"' . str_repeat("abcdefghij\u{e9}\u{4e2d}", 100000) . '"',
    'many small strings' => '[' . implode(',', array_fill(0, 100000, '"name\\u00e9"')) . ']',
];

function median(callable $run): float
{
    $run();
    $samples = [];
    for ($at = 0; $at < RUNS; $at++) {
        $start = hrtime(true);
        $run();
        $samples[] = (hrtime(true) - $start) / 1e6;
    }
    sort($samples);
    return $samples[intdiv(RUNS, 2)];
}

$results = [];
foreach ($documents as $document => $source) {
    $value = Json\parse($source);
    $carry = median(static fn () => Relay\carry($value));
    $text = median(static fn () => Json\parse(Json\stringify($value)));
    $ratio = $carry / $text;
    $load = sys_getloadavg();
    $results[] = ['language' => 'php', 'document' => $document, 'runs' => RUNS, 'carry_ms' => $carry, 'text_ms' => $text, 'ratio' => $ratio, 'load_average' => $load];
    printf("php\t%s\tcarry %.3f ms\ttext %.3f ms\tratio %.2f\tload %s\n", $document, $carry, $text, $ratio, implode(' ', array_map(static fn ($l) => sprintf('%.2f', $l), $load)));
    if ($ratio > LIMIT) {
        printf("WARNING: php %s: carry takes %.2f times the time of the text path, above the limit %.2f\n", $document, $ratio, LIMIT);
    }
}
if (!is_dir(dirname($report))) {
    mkdir(dirname($report), 0777, true);
}
file_put_contents($report . '.tmp', json_encode($results, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
rename($report . '.tmp', $report);
