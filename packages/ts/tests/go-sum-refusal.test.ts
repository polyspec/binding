import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goModGraph, goSumOf, type GoDownload } from '../src/generate/packages.ts';

// B2.550: the release check of crud-ui (C19.153) failed with the error of Go alone, which named no module. The objects
// of `go mod download -json` that Go could not give carry the module path and the version that Go was asked for, so
// the refusal names them with the error of Go (GN-15l).
const JSON_GO = 'github.com/polyspec/json/packages/go';
const goMod = `module github.com/polyspec/crud-ui/packages/validator/go\n\ngo 1.27.3\n\nrequire ${JSON_GO} v0.0.38\n`;
const offline: GoDownload[] = [{ Path: JSON_GO, Version: 'v0.0.38', Error: 'module lookup disabled by GOPROXY=off' }];
const refusal = /go mod download gave no sum of github\.com\/polyspec\/json\/packages\/go v0\.0\.38: module lookup disabled by GOPROXY=off/;

test('B2.550: goSumOf names the module and the version that Go could not give, with the error of Go (GN-15l)', () => {
  assert.throws(() => goSumOf(goMod, offline), refusal);
});

test('B2.550: goModGraph names the module and the version that Go could not give, with the error of Go (GN-15l)', () => {
  assert.throws(() => goModGraph(goMod, () => offline, () => undefined), refusal);
});
