// The generated Go tests of the Go binding (G-5), run by go test against the static library: B-3 (a text that is not
// UTF-8), the enum check of T-6 (a value that is not one of the constants), B-4 (every contract case that raises: the
// exact error type of E-7, the kind, the status and the errno) and B-7 (the panic entry point, with the build tag
// polyspec_panic_test). B-2 and G-7 hold by the Go types and the compiler: a Go uint64 holds no -1, NaN or fraction,
// and a call with a missing, extra or unknown argument does not compile (E-7).

import type { Type } from '../contract.ts';
import { type Model, Unsupported, langName, unitOf } from './model.ts';
import { goBytes, goErrorTypes, goHeader, goImport, goName, goPackage, goParam, goString } from './go.ts';
import { caseKey, raisingCases, resultCases } from './samples.ts';


interface Values {
  model: Model;
  pkg: string;
  usesPtr: boolean;
  usesReflect?: boolean;
}

// A Go value of a contract type, as the external test package writes it.
function goTypeName(v: Values, type: Type): string {
  if (typeof type === 'string') {
    return ({ bool: 'bool', int: 'int64', int64: 'int64', uint: 'uint64', float: 'float64', text: 'string', latin1: 'string', bytes: '[]byte' } as Record<string, string>)[type] ?? '';
  }
  if ('list' in type) return `[]${goTypeName(v, type.list)}`;
  if ('map' in type) return `*${v.pkg}.Map[${goTypeName(v, type.map)}]`;
  if ('keyed_map' in type) return `*${v.pkg}.KeyedMap[${goTypeName(v, type.keyed_map)}]`;
  if ('optional' in type) return `*${goTypeName(v, type.optional)}`;
  if ('tuple' in type) return `[${type.tuple.length}]${goTypeName(v, type.tuple[0] ?? 'none')}`;
  const unit = unitOf(v.model, type);
  return `${v.pkg}.${goName(unit?.name ?? [])}`;
}

function placeholder(v: Values, type: Type): string {
  if (typeof type === 'string') return ({ bool: 'false', text: '"a"', latin1: '"a"', bytes: 'nil' } as Record<string, string>)[type] ?? '0';
  if ('list' in type || 'optional' in type || 'map' in type || 'keyed_map' in type) return 'nil';
  const unit = unitOf(v.model, type);
  const first = unit?.variants?.[0];
  if (unit?.kind === 'enum' && first !== undefined) return `${v.pkg}.${goName(unit.name)}${goName(first.name)}`;
  if (unit?.kind === 'record') return `${v.pkg}.${goName(unit.name)}{${(unit.fields ?? []).map((f) => `${goName(f.name)}: ${placeholder(v, f.type)}`).join(', ')}}`;
  throw new Unsupported(`no Go placeholder for ${JSON.stringify(type)}`);
}

// A case value (JSON) as a Go value; latin1 text is a Go string of its runes, as text is (B-8).
function fromJson(v: Values, type: Type, value: unknown): string {
  if (value === null) return 'nil';
  if (typeof type === 'string') {
    if (type === 'text' || type === 'latin1') return goString(String(value));
    if (type === 'bool') return String(value === true);
    if (['uint', 'int', 'int64', 'float'].includes(type)) return String(value);
    // G-5: bytes are {"hex": ...}.
    if (type === 'bytes') {
      const hex = typeof value === 'object' && value !== null ? (value as { hex?: unknown }).hex : undefined;
      if (typeof hex !== 'string' || !/^([0-9a-f]{2})*$/.test(hex)) throw new Unsupported(`a case value of the type bytes is {"hex": "<lower-case hex>"}, not ${JSON.stringify(value)}`);
      return `[]byte(${goBytes((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))})`;
    }
    throw new Unsupported(`no Go case value of the type ${type}`);
  }
  if ('optional' in type) {
    v.usesPtr = true;
    const inner = fromJson(v, type.optional, value);
    const typed = typeof type.optional === 'string' && ['uint', 'int', 'int64', 'float'].includes(type.optional) ? `${goTypeName(v, type.optional)}(${inner})` : inner;
    return `ptr(${typed})`;
  }
  if ('list' in type) return `${goTypeName(v, type)}{${(value as unknown[]).map((item) => fromJson(v, type.list, item)).join(', ')}}`;
  // T-2: a tuple inside another type is a Go array; its case value is the array of its parts.
  if ('tuple' in type) return `${goTypeName(v, type)}{${type.tuple.map((part, i) => fromJson(v, part, (value as unknown[])[i] ?? null)).join(', ')}}`;
  if ('keyed_map' in type) {
    // G-5: a case gives a keyed map as its entries in order, [key, value]: a key is a text, {"int": n} or {"hex": ...}.
    const sets = (value as [unknown, unknown][]).map(([key, item]) => {
      const goKey = caseKey(key, (kind, raw) => {
        if (kind === 'int') return `${v.pkg}.IntKey(${String(raw)})`;
        if (kind === 'text') return `${v.pkg}.TextKey(${goString(String(raw))})`;
        const hex = String((raw as { hex: unknown }).hex);
        return `${v.pkg}.BytesKey([]byte(${goBytes((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))}))`;
      });
      return `m.Set(${goKey}, ${fromJson(v, type.keyed_map, item)}); `;
    }).join('');
    return `func() ${goTypeName(v, type)} { m := &${v.pkg}.KeyedMap[${goTypeName(v, type.keyed_map)}]{}; ${sets}return m }()`;
  }
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
  throw new Unsupported(`no Go case value of the type ${JSON.stringify(type)}`);
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
      if (base === 'latin1') {
        out.push(`
func TestB8${name}Refuses${testName(slot.label.split('.'))}AboveU00FF(t *testing.T) {
	for _, bad := range []string{"\\u0100", "\\xff"} {
		${assign} ${slot.replace(wrap('bad'))}
		var failure *liberrors.${types['value'] ?? ''}
		if !errors.As(err, &failure) || failure.Kind() != "invalid_text" {
			t.Fatalf("B-8: %q: %#v", bad, err)
		}
	}
}`);
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
      if (typeof base === 'object' && 'keyed_map' in base) {
        // T-2: a key of a kind that the contract does not list is kind invalid_argument_type.
        const missing = (['int', 'bytes', 'text'] as const).find((kind) => !base.key.includes(kind));
        if (missing !== undefined) {
          const key = { int: `${pkg}.IntKey(1)`, bytes: `${pkg}.BytesKey([]byte("b"))`, text: `${pkg}.TextKey("t")` }[missing];
          const mapType = goTypeName(v, base);
          out.push(`
func TestT2${name}Refuses${testName(slot.label.split('.'))}WithA${testName([missing])}Key(t *testing.T) {
	m := &${mapType.slice(1)}{}
	var entry ${goTypeName(v, base.keyed_map)}
	m.Set(${key}, entry)
	${assign} ${slot.replace(wrap('m'))}
	var failure *liberrors.${types['type'] ?? ''}
	if !errors.As(err, &failure) || failure.Kind() != "invalid_argument_type" {
		t.Fatalf("T-2: %#v", err)
	}
}`);
        }
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
    // The arguments of a case in the order of the parameters, a record parameter as its struct.
    const caseArgs = (args: ReadonlyMap<{ name: unknown; field: boolean }, unknown>): string[] => fn.params.map((p) => {
      const unit = unitOf(model, p.type);
      if (unit?.kind === 'record') {
        const fields = Object.fromEntries([...args].filter(([a]) => a.field).map(([a, value]) => [langName('python', a.name as never, 'variable'), value]));
        return fromJson(v, p.type, fields);
      }
      const found = [...args].find(([a]) => !a.field && a.name === p.name);
      return fromJson(v, p.type, found?.[1] ?? null);
    });
    // GN-13e: every case that does not raise runs, and each result is compared with the value that the case gives.
    const parts = fn.returns === 'none' ? [] : typeof fn.returns === 'object' && 'tuple' in fn.returns ? fn.returns.tuple : [fn.returns];
    const runs = resultCases(model, fn).map((kase) => {
      const values = parts.map((_, i) => `value${i}`);
      let body: string;
      if (kase.refused !== undefined) {
        body = `\t\tt.Fatal(${goString(kase.refused)})`;
      } else {
        const compared = kase.expected === undefined ? [] : parts.map((type, i) => {
          const given = parts.length === 1 ? kase.expected?.value : (kase.expected?.value as unknown[] | undefined)?.[i];
          v.usesReflect = true;
          return `\t\tif want := (${goTypeName(v, type)})(${fromJson(v, type, given ?? null)}); !reflect.DeepEqual(value${i}, want) {\n\t\t\tt.Fatalf("GN-13e: %#v is not %#v", value${i}, want)\n\t\t}`;
        });
        const names = kase.expected === undefined ? values.map(() => '_') : values;
        body = `\t\t${[...names, 'err'].join(', ')} := ${pkg}.${name}(${caseArgs(kase.args).join(', ')})\n\t\tif err != nil {\n\t\t\tt.Fatalf("GN-13e: %v", err)\n\t\t}${compared.length === 0 ? '' : `\n${compared.join('\n')}`}`;
      }
      return `
	t.Run(${goString(kase.id)}, func(t *testing.T) {
${body}
	})`;
    });
    if (runs.length > 0) {
      out.push(`
func TestGN13e${name}(t *testing.T) {${runs.join('')}
}`);
    }
    const cases = raisingCases(model, fn);
    if (cases.length > 0) {
      const runs = cases.map((kase) => {
        const args = caseArgs(kase.args);
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
  const imports = ['"errors"', ...(v.usesReflect === true ? ['"reflect"'] : []), '"testing"', '', ...own.map(([path, alias]) => `${alias ?? ''} "${path ?? ''}"`)];
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
	err := panicTest()
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

// GW-4, T-2: the round trips through the C ABI: every latin1 character comes back the same and a rune above U+00FF
// or bytes that are not UTF-8 are kind invalid_text; a map comes back in its order.
export function goCodecTest(_contract: unknown, echo: { latin1: boolean; map: boolean; keyed: boolean }, valueType: string): string {
  const latin1 = echo.latin1 ? `
func TestB8Latin1RoundTrips(t *testing.T) {
	runes := make([]rune, 0, 256)
	for code := rune(0); code <= 0xff; code++ {
		runes = append(runes, code)
	}
	text := string(runes)
	back, err := echoLatin1(text)
	if err != nil || back != text {
		t.Fatalf("B-8: %q, %v", back, err)
	}
	for _, bad := range []string{"\\u0100", "\\xff"} {
		_, err := echoLatin1(bad)
		failure, ok := err.(*${valueType})
		if !ok || failure.Kind() != "invalid_text" {
			t.Fatalf("B-8: %q: %#v", bad, err)
		}
	}
}
` : '';
  const map = echo.map ? `
func TestT2AMapRoundTripsInItsOrder(t *testing.T) {
	m := &Map[string]{}
	for _, key := range []string{"z", "a", "\\u00e9", "m"} {
		m.Set(key, key+key)
	}
	back, err := echoMap(m)
	if err != nil || !reflect.DeepEqual(back.Keys(), m.Keys()) {
		t.Fatalf("T-2: %q, %v", back.Keys(), err)
	}
	for _, key := range m.Keys() {
		want, _ := m.Get(key)
		if got, _ := back.Get(key); got != want {
			t.Fatalf("T-2: %q is %q", key, got)
		}
	}
}
` : '';
  const keyed = echo.keyed ? `
func TestT2AKeyedMapRoundTripsInItsOrder(t *testing.T) {
	m := &KeyedMap[string]{}
	for i, key := range []Key{TextKey("1"), IntKey(1), BytesKey([]byte{0xff}), IntKey(-7), TextKey("a")} {
		m.Set(key, string(rune('a'+i)))
	}
	back, err := echoKeyedMap(m)
	if err != nil || !reflect.DeepEqual(back.Keys(), m.Keys()) {
		t.Fatalf("T-2: %v, %v", back.Keys(), err)
	}
	for _, key := range m.Keys() {
		want, _ := m.Get(key)
		if got, _ := back.Get(key); got != want {
			t.Fatalf("T-2: %v is %q", key, got)
		}
	}
}
` : '';
  return `${goHeader()}

//go:build polyspec_codec_test

package binding

import (
${echo.map || echo.keyed ? '\t"reflect"\n' : ''}\t"testing"
)
${latin1}${map}${keyed}`;
}
