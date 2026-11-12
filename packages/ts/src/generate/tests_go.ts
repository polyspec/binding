// The generated Go tests of the Go binding (G-5), run by go test against the static library: B-3 (a text that is not
// UTF-8), the enum check of T-6 (a value that is not one of the constants), B-4 (every contract case that raises: the
// exact error type of E-7, the kind, the status and the errno) and B-7 (the panic entry point, with the build tag
// polyspec_panic_test). B-2 and G-7 hold by the Go types and the compiler: a Go uint64 holds no -1, NaN or fraction,
// and a call with a missing, extra or unknown argument does not compile (E-7).

import type { Type } from '../contract.ts';
import { type Model, langName, unitOf } from './model.ts';
import { goBytes, goErrorTypes, goHeader, goImport, goName, goPackage, goParam, goString } from './go.ts';
import { raisingCases } from './samples.ts';


interface Values {
  model: Model;
  pkg: string;
  usesPtr: boolean;
}

// A Go value of a contract type, as the external test package writes it.
function goTypeName(v: Values, type: Type): string {
  if (typeof type === 'string') {
    return ({ bool: 'bool', int: 'int64', int64: 'int64', uint: 'uint64', float: 'float64', text: 'string', latin1: 'string', bytes: '[]byte' } as Record<string, string>)[type] ?? '';
  }
  if ('list' in type) return `[]${goTypeName(v, type.list)}`;
  if ('map' in type) return `*${v.pkg}.Map[${goTypeName(v, type.map)}]`;
  if ('optional' in type) return `*${goTypeName(v, type.optional)}`;
  if ('tuple' in type) return `[${type.tuple.length}]${goTypeName(v, type.tuple[0] ?? 'none')}`;
  const unit = unitOf(v.model, type);
  return `${v.pkg}.${goName(unit?.name ?? [])}`;
}

function placeholder(v: Values, type: Type): string {
  if (typeof type === 'string') return ({ bool: 'false', text: '"a"', latin1: '"a"', bytes: 'nil' } as Record<string, string>)[type] ?? '0';
  if ('list' in type || 'optional' in type || 'map' in type) return 'nil';
  const unit = unitOf(v.model, type);
  const first = unit?.variants?.[0];
  if (unit?.kind === 'enum' && first !== undefined) return `${v.pkg}.${goName(unit.name)}${goName(first.name)}`;
  if (unit?.kind === 'record') return `${v.pkg}.${goName(unit.name)}{${(unit.fields ?? []).map((f) => `${goName(f.name)}: ${placeholder(v, f.type)}`).join(', ')}}`;
  throw new Error(`no Go placeholder for ${JSON.stringify(type)}`);
}

// A case value (JSON) as a Go value: latin1 text is a string of one byte per character (B-8).
function fromJson(v: Values, type: Type, value: unknown): string {
  if (value === null) return 'nil';
  if (typeof type === 'string') {
    if (type === 'text') return goString(String(value));
    if (type === 'latin1') return goBytes([...String(value)].map((c) => c.codePointAt(0) ?? 0));
    if (type === 'bool') return String(value === true);
    if (['uint', 'int', 'int64', 'float'].includes(type)) return String(value);
    throw new Error(`no Go case value of the type ${type}`);
  }
  if ('optional' in type) {
    v.usesPtr = true;
    const inner = fromJson(v, type.optional, value);
    const typed = typeof type.optional === 'string' && ['uint', 'int', 'int64', 'float'].includes(type.optional) ? `${goTypeName(v, type.optional)}(${inner})` : inner;
    return `ptr(${typed})`;
  }
  if ('list' in type) return `${goTypeName(v, type)}{${(value as unknown[]).map((item) => fromJson(v, type.list, item)).join(', ')}}`;
  if ('map' in type) {
    // T-2: the entries of the case in their order.
    const sets = Object.entries(value as Record<string, unknown>).map(([key, item]) => `m.Set(${goString(key)}, ${fromJson(v, type.map, item)}); `).join('');
    return `func() ${goTypeName(v, type)} { m := &${v.pkg}.Map[${goTypeName(v, type.map)}]{}; ${sets}return m }()`;
  }
  const unit = unitOf(v.model, type);
  if (unit?.kind === 'enum') {
    const variant = (unit.variants ?? []).find((x) => x.value === value);
    return variant === undefined ? `${v.pkg}.${goName(unit.name)}(${goString(String(value))})` : `${v.pkg}.${goName(unit.name)}${goName(variant.name)}`;
  }
  if (unit?.kind === 'record') {
    const fields = value as Record<string, unknown>;
    return `${v.pkg}.${goName(unit.name)}{${(unit.fields ?? []).map((f) => `${goName(f.name)}: ${fromJson(v, f.type, fields[langName('python', f.name, 'variable')] ?? null)}`).join(', ')}}`;
  }
  throw new Error(`no Go case value of the type ${JSON.stringify(type)}`);
}

const testName = (words: string[]): string => words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).replace(/_$/, "")).join("");

export function goTests(model: Model, module: string): string | undefined {
  const fns = model.functions.filter((f) => f.module === module);
  if (fns.length === 0) return undefined;
  const pkg = goPackage(model.contract, module);
  const v: Values = { model, pkg, usesPtr: false };
  const types = Object.fromEntries(goErrorTypes(model.contract));
  const out: string[] = [];
  for (const fn of fns) {
    const name = langName('go', fn.member.name, 'callable');
    const results = fn.returns === 'none' ? 0 : typeof fn.returns === 'object' && 'tuple' in fn.returns ? fn.returns.tuple.length : 1;
    const blanks = Array.from({ length: results }, () => '_').join(', ');
    const assign = results === 0 ? 'err :=' : `${blanks}, err :=`;
    const call = (value: (p: { name: never; type: Type }, i: number) => string): string =>
      `${pkg}.${name}(${fn.params.map((p, i) => value(p as never, i)).join(', ')})`;
    // Each parameter or record field that a test replaces: its Go path and type.
    const slots: { label: string; type: Type; replace: (value: string) => string }[] = [];
    fn.params.forEach((p, i) => {
      const unit = unitOf(model, p.type);
      slots.push({ label: goParam(p.name), type: p.type, replace: (value) => call((q, j) => (j === i ? value : placeholder(v, q.type))) });
      if (unit?.kind === 'record') {
        for (const field of unit.fields ?? []) {
          const fieldsText = (unit.fields ?? []).map((f) => `${goName(f.name)}: ${f === field ? '__VALUE__' : placeholder(v, f.type)}`).join(', ');
          slots.push({
            label: `${goParam(p.name)}.${goName(field.name)}`,
            type: field.type,
            replace: (value) => call((q, j) => (j === i ? `${pkg}.${goName(unit.name)}{${fieldsText.replace('__VALUE__', value)}}` : placeholder(v, q.type))),
          });
        }
      }
    });
    for (const slot of slots) {
      let base = slot.type;
      let wrap = (value: string): string => value;
      if (typeof base === 'object' && 'optional' in base) {
        v.usesPtr = true;
        base = base.optional;
        const outer = wrap;
        wrap = (value) => outer(`ptr(${value})`);
      }
      if (typeof base === 'object' && 'list' in base) {
        const listType = goTypeName(v, base);
        base = base.list;
        const outer = wrap;
        wrap = (value) => outer(`${listType}{${value}}`);
      }
      if (base === 'text') {
        out.push(`
func TestB3${name}Refuses${testName(slot.label.split('.'))}ThatIsNotUTF8(t *testing.T) {
	${assign} ${slot.replace(wrap('"\\xff"'))}
	var failure *liberrors.${types['value'] ?? ''}
	if !errors.As(err, &failure) || failure.Kind() != "invalid_text" {
		t.Fatalf("B-3: %#v", err)
	}
}`);
      }
      const unit = unitOf(model, base);
      if (unit?.kind === 'enum') {
        out.push(`
func TestT6${name}Refuses${testName(slot.label.split('.'))}ThatIsNoConstant(t *testing.T) {
	${assign} ${slot.replace(wrap(`${pkg}.${goName(unit.name)}("\\x00")`))}
	var failure *liberrors.${types['type'] ?? ''}
	if !errors.As(err, &failure) || failure.Kind() != "invalid_argument_type" {
		t.Fatalf("T-6: %#v", err)
	}
}`);
      }
    }
    const cases = raisingCases(model, fn);
    if (cases.length > 0) {
      const runs = cases.map((kase) => {
        const args = fn.params.map((p) => {
          const unit = unitOf(model, p.type);
          if (unit?.kind === 'record') {
            const fields = Object.fromEntries([...kase.args].filter(([a]) => a.field).map(([a, value]) => [langName('python', a.name, 'variable'), value]));
            return fromJson(v, p.type, fields);
          }
          const found = [...kase.args].find(([a]) => !a.field && a.name === p.name);
          return fromJson(v, p.type, found?.[1] ?? null);
        });
        const type = Object.fromEntries(goErrorTypes(model.contract))[kase.raises.category] ?? '';
        const status = kase.raises.status === null ? 'if _, ok := failure.Status(); ok {' : `if status, ok := failure.Status(); !ok || status != ${kase.raises.status} {`;
        return `
	t.Run(${goString(kase.id)}, func(t *testing.T) {
		${assign} ${pkg}.${name}(${args.join(', ')})
		failure, ok := err.(*liberrors.${type})
		if !ok || failure.Kind() != ${goString(kase.raises.kind)} {
			t.Fatalf("B-4: %#v", err)
		}
		${status}
			t.Fatalf("B-4: the status of %#v", err)
		}
		if _, ok := failure.Errno(); ok {
			t.Fatalf("B-4: the errno of %#v", err)
		}
	})`;
      });
      out.push(`
func TestB4${name}(t *testing.T) {${runs.join('')}
}`);
    }
  }
  const own = [[goImport(model.contract, 'errors'), 'liberrors'], [goImport(model.contract, module), pkg]].sort(([a], [b]) => ((a ?? '') < (b ?? '') ? -1 : 1));
  const imports = ['"errors"', '"testing"', '', ...own.map(([path, alias]) => `${alias ?? ''} "${path ?? ''}"`)];
  const needsErrors = out.some((t) => t.includes('errors.As('));
  const list = imports.filter((i) => i !== '"errors"' || needsErrors);
  const ptr = v.usesPtr ? '\n\n// ptr is a pointer to a value, for an optional argument.\nfunc ptr[T any](value T) *T { return &value }' : '';
  return `${goHeader()}

// The generated tests of the Go package ${pkg} (G-5).
package ${pkg}_test

import (
${list.map((i) => (i === '' ? '' : `\t${i}`)).join('\n')}
)${ptr}
${out.join('\n')}
`;
}

// B-7: the panic of the core reaches Go as the internal error type of kind internal.
export function goPanicTest(internal: string): string {
  return `${goHeader()}

//go:build polyspec_panic_test

package binding

import "testing"

func TestB7APanicIsKindInternal(t *testing.T) {
	err := PanicTest()
	failure, ok := err.(*${internal})
	if !ok || failure.Kind() != "internal" {
		t.Fatalf("B-7: %#v", err)
	}
}
`;
}

// T-2: the ordered map keeps the order in which its keys were first set, and the encoding keeps it both ways.
export function goMapTest(): string {
  return `${goHeader()}

package binding

import (
	"reflect"
	"testing"
)

func TestT2AMapKeepsTheOrderOfItsKeys(t *testing.T) {
	m := &Map[int64]{}
	m.Set("b", 1)
	m.Set("a", 2)
	m.Set("b", 3)
	if keys := m.Keys(); !reflect.DeepEqual(keys, []string{"b", "a"}) {
		t.Fatalf("T-2: %q", keys)
	}
	if value, ok := m.Get("b"); !ok || value != 3 {
		t.Fatalf("T-2: b is %d, %v", value, ok)
	}
	var none *Map[int64]
	if none.Len() != 0 || none.Keys() != nil {
		t.Fatal("T-2: a nil map is not empty")
	}
}

func TestT2TheEncodingKeepsTheOrderOfAMap(t *testing.T) {
	m := &Map[string]{}
	for _, key := range []string{"z", "a", "m"} {
		m.Set(key, key+key)
	}
	enc := NewWriter()
	enc.Len(m.Len())
	for _, key := range m.Keys() {
		value, _ := m.Get(key)
		enc.Text(key)
		enc.Text(value)
	}
	dec := NewReader(enc.Done())
	back := &Map[string]{}
	for i, n := 0, dec.Len(); i < n; i++ {
		key := dec.Text()
		back.Set(key, dec.Text())
	}
	if err := dec.Finish(); err != nil || !reflect.DeepEqual(back, m) {
		t.Fatalf("T-2: %v %#v", err, back)
	}
}
`;
}
