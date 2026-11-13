"""The cost of a json value that crosses relay both ways in Python (B2.87, B2.89): carry, which converts the value in
by json value_in and out by json value_out, against parse(stringify(value)) of json, the path of the text of json
itself, on a document of one large string and a document of 100000 small strings. Each measurement is the median of a
fixed number of runs, with the load average of the machine when it was taken; a ratio above the limit prints a WARNING
line with the value and the limit, and the measurement never fails (make e2e writes BENCH_REPORT)."""

import json as report_json
import os
import statistics
import time

import polyspec.json as json
import polyspec.relay as relay

RUNS = 21
LIMIT = 1.5
REPORT = os.environ["BENCH_REPORT"]

DOCUMENTS = [
    ("one large string", '"' + "abcdefghijé中" * 100000 + '"'),
    ("many small strings", "[" + ",".join(['"name\\u00e9"'] * 100000) + "]"),
]


def median(run) -> float:
    run()
    samples = []
    for _ in range(RUNS):
        start = time.perf_counter()
        run()
        samples.append((time.perf_counter() - start) * 1000)
    return statistics.median(samples)


results = []
for document, source in DOCUMENTS:
    value = json.parse(source)
    carry = median(lambda: relay.carry(value))
    text = median(lambda: json.parse(json.stringify(value)))
    ratio = carry / text
    load = list(os.getloadavg())
    results.append({"language": "python", "document": document, "runs": RUNS, "carry_ms": carry, "text_ms": text, "ratio": ratio, "load_average": load})
    print(f"python\t{document}\tcarry {carry:.3f} ms\ttext {text:.3f} ms\tratio {ratio:.2f}\tload {' '.join(f'{l:.2f}' for l in load)}")
    if ratio > LIMIT:
        print(f"WARNING: python {document}: carry takes {ratio:.2f} times the time of the text path, above the limit {LIMIT:.2f}")
os.makedirs(os.path.dirname(REPORT), exist_ok=True)
with open(REPORT + ".tmp", "w", encoding="utf-8") as file:
    report_json.dump(results, file, indent=2)
    file.write("\n")
os.replace(REPORT + ".tmp", REPORT)
