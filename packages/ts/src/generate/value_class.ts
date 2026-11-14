// GN-6x: what the conversions of a value class of another repository share across languages. The owner's contract
// gives the in row of each language, whose `by` member classifies an instance and whose `read` members give its
// content, and the out rows, whose members make an instance; this module reads both into the forms that each language
// writes as calls of the owner's language API.

import type { Contract, Lang, Member, Type, Unit } from '../contract.ts';
import { type Model, Unsupported, type ValueAlias, langName } from './model.ts';
import { jsString, phpText, pyString } from './text.ts';

// The binding_core::ValueKind of each kind of an in case.
const VALUE_KIND: Record<string, string> = {
  null: 'Null', bool: 'Bool', int: 'Int', int64: 'Int64', float: 'Float', number: 'Number', text: 'Text', text16: 'Text16', bytes: 'Bytes',
  list: 'List', map: 'Map', object: 'Object',
};

// A member of the owner, with the unit that holds it.
export interface OwnerMember {
  unit: Unit;
  member: Member;
}

export interface ReadCase {
  // The enum value that the `by` member gives for the case.
  is: string;
  // The binding_core::ValueKind variant of the case.
  kind: string;
  // The member that gives the content; none for a kind without content.
  read?: Member;
  // B2.89: for a case of the kind text, the member that gives the UTF-16 code units of a text for which read gives none.
  units?: Member;
}

// A generated class of the owner whose `iterate` member yields `{key, value}`: an instance is described as a map of the
// entries of that iteration (GN-6f).
export interface MapClass {
  unit: Unit;
  iterate: Member;
}

export interface ClassIn {
  // The language type of the row, the class.
  type: string;
  by: Member;
  cases: ReadCase[];
  maps: MapClass[];
}

// How an out row makes an instance: a member on the content of the kind, a member on a list of made items, or a member
// on an instance of a map class that its constructor makes and whose method takes each made entry.
export type ClassMake =
  | { kind: string; form: 'content'; member: Member; params: number }
  | { kind: string; form: 'list'; member: Member }
  | { kind: string; form: 'map'; member: Member; map: Unit; insert: Member };

const ownerOf = (alias: ValueAlias): Contract => {
  if (alias.owner === undefined) throw new Unsupported(`${alias.unit.id}: no owner contract of the value class (GN-6x)`);
  return alias.owner;
};

function locate(owner: Contract, id: string, where: string): OwnerMember {
  for (const unit of owner.units) {
    const member = (unit.members ?? []).find((m) => m.id === id);
    if (member !== undefined) return { unit, member };
  }
  throw new Unsupported(`${where}: ${id} is no member of ${owner.library} (GN-6x)`);
}

const unitType = (type: Type | undefined): { unit: string; library?: string } | undefined =>
  typeof type === 'object' && type !== null && 'unit' in type ? type : undefined;

// The id of the unit that a type names when it is the value class itself, by its unit or by a name of `types`.
function namesClass(owner: Contract, type: Type | undefined, id: string): boolean {
  if (typeof type === 'string') {
    const named = (owner.types as Record<string, { library?: string; unit: string } | undefined>)[type];
    return named?.unit === id && (named.library ?? owner.library) === owner.library;
  }
  const named = unitType(type);
  return named !== undefined && named.unit === id && (named.library === undefined || named.library === owner.library);
}

// GN-6x: a list of uint, the UTF-16 code units of a text of the kind text16.
const uintList = (type: Type | undefined): boolean => typeof type === 'object' && type !== null && 'list' in type && type.list === 'uint';

export function classIn(alias: ValueAlias, lang: Lang): ClassIn {
  const owner = ownerOf(alias);
  const where = `${alias.library ?? ''}.${alias.unit.id}`;
  const row = (alias.unit.in ?? []).find((r) => r[lang] !== undefined);
  if (row === undefined || row.by === undefined) throw new Unsupported(`${where}: the ${lang} in row of the value class names no by member (GN-6x)`);
  const by = locate(owner, row.by, where).member;
  const maps: MapClass[] = [];
  const cases = row.cases.map((kase) => {
    const kind = VALUE_KIND[kase.kind];
    if (kind === undefined || kase.is === undefined) throw new Unsupported(`${where}: the ${lang} in case of the kind ${kase.kind} is not generated (GN-6x)`);
    if (kase.read === undefined) return { is: kase.is, kind };
    const read = locate(owner, kase.read, where).member;
    if (kind === 'Text16' && !uintList(read.returns)) {
      throw new Unsupported(`${where}: the ${lang} read member ${read.id} of the kind text16 gives no list of uint (GN-6x)`);
    }
    const returned = unitType(read.returns);
    const unit = returned === undefined ? undefined : owner.units.find((u) => u.id === returned.unit);
    if (unit !== undefined && unit.id !== alias.unit.id && unit.kind === 'class') {
      const iterate = (unit.members ?? []).find((m) => m.kind === 'iterate' && m.yields !== undefined);
      if (iterate === undefined) throw new Unsupported(`${where}: the read member ${read.id} gives ${unit.id}, which yields no {key, value} (GN-6x)`);
      if (!maps.some((m) => m.unit === unit)) maps.push({ unit, iterate });
    }
    if (kase.units === undefined) return { is: kase.is, kind, read };
    const units = locate(owner, kase.units, where).member;
    if (kind !== 'Text' || !uintList(units.returns)) {
      throw new Unsupported(`${where}: the ${lang} units member ${units.id} of the kind ${kase.kind} gives no list of uint of a text (GN-6x)`);
    }
    return { is: kase.is, kind, read, units };
  });
  return { type: row[lang] ?? '', by, cases, maps };
}

export function classMakes(alias: ValueAlias, lang: Lang): ClassMake[] {
  const owner = ownerOf(alias);
  const where = `${alias.library ?? ''}.${alias.unit.id}`;
  return (alias.unit.out ?? []).filter((row) => row.make[lang] !== undefined).map((row): ClassMake => {
    const make = row.make[lang];
    if (row.when !== undefined || typeof make !== 'string' || !make.includes('.')) {
      throw new Unsupported(`${where}: the ${lang} make ${JSON.stringify(make)} of the kind ${row.kind} is no member of the owner (GN-6x)`);
    }
    const { member } = locate(owner, make, where);
    if (!namesClass(owner, member.returns, alias.unit.id) || (member.kind !== 'static' && member.kind !== 'constructor')) {
      throw new Unsupported(`${where}: the ${lang} make ${make} is no constructor or static member that returns the class (GN-6x)`);
    }
    const params = member.parameters ?? [];
    const param = params[0]?.type;
    if (row.kind === 'list' && params.length === 1 && typeof param === 'object' && param !== null && 'list' in param && namesClass(owner, param.list, alias.unit.id)) {
      return { kind: row.kind, form: 'list', member };
    }
    if (row.kind === 'map' && params.length === 1) {
      const named = unitType(param);
      const map = named === undefined ? undefined : owner.units.find((u) => u.id === named.unit && u.kind === 'class' && u.origin === 'generated');
      const constructs = (map?.members ?? []).some((m) => m.kind === 'constructor' && (m.parameters ?? []).length === 0);
      const insert = (map?.members ?? []).find((m) => m.kind === 'method' && (m.parameters ?? []).length === 2
        && (m.parameters ?? []).every((p) => namesClass(owner, p.type, alias.unit.id)));
      if (map !== undefined && constructs && insert !== undefined) return { kind: row.kind, form: 'map', member, map, insert };
      throw new Unsupported(`${where}: the ${lang} make ${make} takes no class of the owner that its constructor makes and a method fills (GN-6x)`);
    }
    if (row.kind === 'text16' && (params.length !== 1 || !uintList(param))) {
      throw new Unsupported(`${where}: the ${lang} make ${make} of the kind text16 takes no list of uint (GN-6x)`);
    }
    const content = ['null', 'bool', 'number', 'text', 'text16'].includes(row.kind);
    if (content && params.length === (row.kind === 'null' ? 0 : 1)) return { kind: row.kind, form: 'content', member, params: params.length };
    throw new Unsupported(`${where}: the ${lang} make ${make} of the kind ${row.kind} is not generated (GN-6x)`);
  });
}

// GN-13e, B2.121: a result that holds an instance of a value class of another repository is compared with the instance
// that its case value makes, both read through the members of the in row of the language: the by member names the
// case, the read member gives the content, and for a read that gives no text the units member gives the UTF-16 code
// units. The content is read again, so a list of instances and an instance of a map class of the owner, whose
// iteration gives its entries, are read as far as they go. The read of an instance is [is], [is, content] or
// [is, null, units].
export interface ForeignReader {
  library: string;
  unit: Unit;
  row: ClassIn;
}

export function foreignReaders(model: Model, lang: Lang): ForeignReader[] {
  return model.aliases
    .filter((alias) => alias.owner !== undefined && alias.library !== undefined && alias.unit.kind === 'class')
    .map((alias) => ({ library: alias.library as string, unit: alias.unit, row: classIn(alias, lang) }));
}

// The map classes of the readers, each once.
const readerMaps = (readers: ForeignReader[]): { library: string; unit: Unit }[] => {
  const out: { library: string; unit: Unit }[] = [];
  for (const reader of readers) {
    for (const map of reader.row.maps) if (!out.some((m) => m.library === reader.library && m.unit === map.unit)) out.push({ library: reader.library, unit: map.unit });
  }
  return out;
};


// Python: _read_foreign, which _same calls on both sides of an instance of a class of the readers.
export function pythonForeignRead(readers: ForeignReader[], cls: (library: string, unit: Unit) => string): string {
  if (readers.length === 0) return '';
  const access = (member: Member): string => `value.${langName('python', member.name, 'callable')}${member.kind === 'property' ? '' : '()'}`;
  const arms = readers.map((reader) => {
    const cases = reader.row.cases.map((kase) => {
      if (kase.read === undefined) return `        if kind == ${pyString(kase.is)}:\n            return (kind,)`;
      if (kase.units === undefined) return `        if kind == ${pyString(kase.is)}:\n            return (kind, _read_foreign(${access(kase.read)}))`;
      return `        if kind == ${pyString(kase.is)}:\n            content = ${access(kase.read)}\n            return (kind, content) if content is not None else (kind, None, _read_foreign(${access(kase.units)}))`;
    });
    return `    if isinstance(value, ${cls(reader.library, reader.unit)}):
        kind = ${access(reader.row.by)}
        kind = getattr(kind, "value", kind)
${cases.join('\n')}
        raise AssertionError(f"GN-6x: ${langName('python', reader.unit.name, 'class')} gives the kind {kind!r}, which its in row has no case for")`;
  });
  const maps = readerMaps(readers).map((map) => `    if isinstance(value, ${cls(map.library, map.unit)}):
        return [(_read_foreign(key), _read_foreign(item)) for key, item in value.items()]`);
  return `

def _read_foreign(value):
${[...arms, ...maps].join('\n')}
    if isinstance(value, (list, tuple)):
        return [_read_foreign(item) for item in value]
    return value
`;
}

// The classes of the readers and of their maps in a language, for the branch of the comparison that reads them.
export const foreignClassNames = (readers: ForeignReader[], cls: (library: string, unit: Unit) => string): string[] =>
  [...readers.map((r) => cls(r.library, r.unit)), ...readerMaps(readers).map((m) => cls(m.library, m.unit))];

// Node and WASM: readForeign, which ordered calls on an instance of a class of the readers.
export function nodeForeignRead(readers: ForeignReader[], lang: 'node' | 'wasm', cls: (library: string, unit: Unit) => string): string {
  if (readers.length === 0) return '';
  const access = (member: Member): string => `value.${langName(lang, member.name, 'callable')}${member.kind === 'property' ? '' : '()'}`;
  const arms = readers.map((reader) => {
    const cases = reader.row.cases.map((kase) => {
      if (kase.read === undefined) return `    if (kind === ${jsString(kase.is)}) return [kind];`;
      if (kase.units === undefined) return `    if (kind === ${jsString(kase.is)}) return [kind, readForeign(${access(kase.read)})];`;
      return `    if (kind === ${jsString(kase.is)}) {\n      const content = ${access(kase.read)};\n      return content === null || content === undefined ? [kind, null, readForeign(${access(kase.units)})] : [kind, content];\n    }`;
    });
    return `  if (value instanceof ${cls(reader.library, reader.unit)}) {
    const kind = String(${access(reader.row.by)});
${cases.join('\n')}
    throw new Error(\`GN-6x: ${langName(lang, reader.unit.name, 'class')} gives the kind \${kind}, which its in row has no case for\`);
  }`;
  });
  const maps = readerMaps(readers).map((map) => `  if (value instanceof ${cls(map.library, map.unit)}) return Array.from(value, ([key, item]) => [readForeign(key), readForeign(item)]);`);
  return `
// GN-13e, B2.121: an instance of a value class of another repository, read through the members of its in row.
function readForeign(value) {
${[...arms, ...maps].join('\n')}
  if (Array.isArray(value)) return value.map(readForeign);
  return value;
}
`;
}


// PHP: readForeign, which same calls on an instance of a class of the readers. A property of the owner is a method in
// PHP (I-3), and the by member gives an enum case, whose value names the case.
export function phpForeignRead(readers: ForeignReader[], cls: (library: string, unit: Unit) => string): string {
  if (readers.length === 0) return '';
  const access = (member: Member): string => `$value->${langName('php', member.name, 'callable')}()`;
  const arms = readers.map((reader) => {
    const cases = reader.row.cases.map((kase) => {
      if (kase.read === undefined) return `            if ($kind === ${phpText(kase.is)}) {\n                return [$kind];\n            }`;
      if (kase.units === undefined) return `            if ($kind === ${phpText(kase.is)}) {\n                return [$kind, self::readForeign(${access(kase.read)})];\n            }`;
      return `            if ($kind === ${phpText(kase.is)}) {\n                $content = ${access(kase.read)};\n                return $content === null ? [$kind, null, self::readForeign(${access(kase.units)})] : [$kind, $content];\n            }`;
    });
    return `        if ($value instanceof ${cls(reader.library, reader.unit)}) {
            $kind = ${access(reader.row.by)};
            $kind = $kind instanceof \\BackedEnum ? $kind->value : $kind;
${cases.join('\n')}
            throw new \\LogicException('GN-6x: ${langName('php', reader.unit.name, 'class')} gives a kind which its in row has no case for');
        }`;
  });
  const maps = readerMaps(readers).map((map) => `        if ($value instanceof ${cls(map.library, map.unit)}) {
            $pairs = [];
            foreach ($value as $key => $item) {
                $pairs[] = [self::readForeign($key), self::readForeign($item)];
            }
            return $pairs;
        }`);
  return `

    /**
     * GN-13e, B2.121: an instance of a value class of another repository, read through the members of its in row.
     */
    private static function readForeign(mixed $value): mixed
    {
${[...arms, ...maps].join('\n')}
        if (\\is_array($value)) {
            return \\array_map(self::readForeign(...), $value);
        }
        return $value;
    }`;
}
