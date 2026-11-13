// GN-14f: the end-to-end check fetches a Go module in the released form at the tag that Go reads for its directory,
// from a repository of the run that Git reads in place of the remote, and a consumer requires it and nothing else.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumerFiles, debugSections, goRemote, requiredVersion } from '../../../scripts/go-release.mts';

test('the tag of a Go module is its directory in the repository and its version (GN-15g)', () => {
  assert.deepEqual(goRemote('github.com/polyspec/sample/packages/go', 'v0.0.1'), { owner: 'polyspec', repository: 'sample', directory: 'packages/go', tag: 'packages/go/v0.0.1' });
  assert.deepEqual(goRemote('github.com/polyspec/crud-ui/packages/validator/go', 'v1.2.3'), { owner: 'polyspec', repository: 'crud-ui', directory: 'packages/validator/go', tag: 'packages/validator/go/v1.2.3' });
  // A module at the root of its repository has the tag of the version alone.
  assert.deepEqual(goRemote('github.com/polyspec/sample', 'v0.0.1'), { owner: 'polyspec', repository: 'sample', directory: '', tag: 'v0.0.1' });
});

test('a Go module that no repository of GitHub holds is refused by name (GN-14f)', () => {
  assert.throws(() => goRemote('example.com/sample/go', 'v0.0.1'), /example\.com\/sample\/go: the Go module is not github\.com\/<owner>\/<repository>/);
  assert.throws(() => goRemote('github.com/polyspec', 'v0.0.1'), /github\.com\/polyspec: the Go module is not github\.com\/<owner>\/<repository>/);
});

test('the version that a go.mod requires of a module is read from either form of the line (GN-15f)', () => {
  assert.equal(requiredVersion('module m\n\ngo 1.27.3\n\nrequire github.com/polyspec/points/packages/go v0.0.0\n\nreplace github.com/polyspec/points/packages/go => ../x\n', 'github.com/polyspec/points/packages/go'), 'v0.0.0');
  assert.equal(requiredVersion('module m\n\nrequire (\n\tgithub.com/polyspec/points/packages/go v1.2.3\n)\n', 'github.com/polyspec/points/packages/go'), 'v1.2.3');
  assert.equal(requiredVersion('module m\n\nrequire github.com/polyspec/points/packages/gone v1.0.0\n', 'github.com/polyspec/points/packages/go'), undefined);
});

test('the consumer requires each module at its version and imports every package of it (GN-14f)', () => {
  const files = consumerFiles('1.27.3', [{ module: 'github.com/polyspec/sample/packages/go', version: 'v0.0.1', packages: ['', 'errors', 'geometry'] }]);
  assert.equal(files.get('go.mod'), 'module example.invalid/consumer\n\ngo 1.27.3\n\nrequire github.com/polyspec/sample/packages/go v0.0.1\n');
  assert.equal(files.get('consumer_test.go'), [
    'package consumer',
    '',
    'import (',
    '\t"testing"',
    '',
    '\t_ "github.com/polyspec/sample/packages/go"',
    '\t_ "github.com/polyspec/sample/packages/go/errors"',
    '\t_ "github.com/polyspec/sample/packages/go/geometry"',
    ')',
    '',
    '// TestLinked passes when the program of the consumer links the static library that each module carries.',
    'func TestLinked(t *testing.T) {}',
    '',
  ].join('\n'));
  assert.deepEqual([...files.keys()], ['go.mod', 'consumer_test.go']);
});

test('the debug sections that llvm-size names in a static library are found by their names and sizes (GN-15g)', () => {
  const sizes = [
    'a.o   (ex /work/libpolyspec_sample_go.a):',
    'section            size   addr',
    '__text            1200      0',
    '__debug_info       340   1200',
    '__debug_str          0   1540',
    'Total             1540',
    '',
    'b.o   (ex /work/libpolyspec_sample_go.a):',
    'section            size   addr',
    '.text              900      0',
    '.debug_line         77    900',
    '.zdebug_abbrev      12    977',
    'Total              989',
  ].join('\n');
  // A section of size 0 holds nothing; each other debug section is named once.
  assert.deepEqual(debugSections(sizes), ['.debug_line', '.zdebug_abbrev', '__debug_info']);
  assert.deepEqual(debugSections('a.o   (ex x.a):\nsection   size   addr\n__text   12   0\n__eh_frame   8   12\nTotal   20\n'), []);
});
