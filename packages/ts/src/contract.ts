// The shape of an interface contract after schema validation (schema/interface.schema.json). The contract check reads a
// contract only through these types, and only after the schema accepted it.

export type Lang = 'php' | 'python' | 'node' | 'go' | 'wasm';
export const LANGS: readonly Lang[] = ['php', 'python', 'node', 'go', 'wasm'];

export type Category = 'value' | 'type' | 'io' | 'store' | 'busy' | 'internal';
export const CATEGORIES: readonly Category[] = ['value', 'type', 'io', 'store', 'busy', 'internal'];

export type Word = string | { acronym: string };
export type Name = Word[];

export type Type =
  | string
  | { list: Type }
  | { map: Type }
  | { optional: Type }
  | { tuple: Type[] }
  | { function: { parameters: Type[]; returns: Type } }
  | { passthrough: string }
  | { unit: string; library?: string };

export interface Only {
  targets: Lang[];
  reason: string;
}

export interface Native {
  [lang: string]: { signature: string; reason: string };
}

export type Default = { literal: unknown } | { const: string } | { empty: string } | { computed: string };

export interface Parameter {
  name: Name;
  type: Type;
  required?: true;
  default?: Default;
  default_core?: string;
  rest?: true;
  only?: Only;
}

export interface Field {
  name: Name;
  type: Type;
  required?: true;
  default?: Default;
  default_core?: string;
  only?: Only;
}

export type Wait = 'none' | 'blocking_io' | 'process_wait' | 'async_driver';

export interface Member {
  id: string;
  name: Name;
  kind: string;
  visibility: 'public' | 'internal';
  parameters?: Parameter[];
  returns?: Type;
  optional_reason?: string;
  yields?: Type | { key: Type; value: Type };
  raises?: string[];
  wait?: Wait;
  core?: { path: string; receiver?: string } | string;
  type?: Type;
  value?: unknown;
  writable?: boolean;
  async_allowed?: boolean;
  errors?: { recognize: UnitRef[]; reason: string };
  only?: Only;
  native?: Native;
}

export interface UnitRef {
  unit: string;
  library?: string;
}

export interface OutRow {
  kind: string;
  when?: { predicate: string; is: boolean };
  make: Partial<Record<Lang, string>>;
}

export interface InRow extends Partial<Record<Lang, string>> {
  by?: string;
  cases: { is?: string; kind: string; read?: string }[];
}

export interface Unit {
  id: string;
  name: Name;
  module: string;
  kind: 'class' | 'variant' | 'functions' | 'interface' | 'record' | 'enum' | 'error';
  visibility: 'public' | 'internal';
  origin: 'generated' | 'host' | 'callback' | 'value';
  category?: Category;
  parent?: string;
  core_type?: string;
  core?: string;
  thread?: 'any' | 'owner';
  cleanup?: string;
  constructible?: boolean;
  implements?: UnitRef[];
  final?: boolean;
  abstract?: boolean;
  only?: Only;
  native?: Native;
  members?: Member[];
  variants?: { name: Name; value: string }[];
  fields?: Field[];
  tag?: Name;
  cases?: { value: string; fields: Field[] }[];
  out?: OutRow[];
  in?: InRow[];
}

export interface NamingException {
  lang: Lang;
  unit: string;
  member?: string;
  parameter?: Name;
  field?: Name;
  name: string;
  reason: string;
}

export interface Errors {
  classes: Partial<Record<Category, Partial<Record<Lang, string>>>>;
  fixed: { lang: Lang; class: string }[];
  kinds: { variant: string; category?: Category; library?: string; class?: string }[];
  binding: { kind: string; class: string }[];
  wrapped: { library: string; unit: string; property: Name; forward?: string; drop?: { reason: string } }[];
}

export interface Contract {
  schema: string;
  library: string;
  core: { crate: string; path: string };
  targets: Lang[];
  packages: Record<string, unknown>;
  naming: { exceptions: NamingException[] };
  types: Partial<Record<'json_value' | 'template_value' | 'php_value', { library: string; unit: string }>>;
  errors: Errors;
  units: Unit[];
  changes: { id: string; rule: string; reason: string; symbol: string; from: Record<string, string>; to: string | null }[];
  cases: { member: string; file: string; group: string }[];
}
