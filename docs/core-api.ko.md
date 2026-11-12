<!-- doc-id: core-api -->
# bindgen_core 공개 API

[English](core-api.md)

crate `bindgen_core`는 생성 바인딩 crate와 코어 crate가 함께 쓰는 런타임 지원이다. 아래에 적은 설계 규칙의 타입만 두며
어느 라이브러리의 규칙도 두지 않는다.

## Crate

- 경로: 이 레포의 `packages/core/rust`. 패키지 `polyspec-bindgen-core`, 라이브러리 이름 `bindgen_core`, 버전 0.0.1, edition
  2021, toolchain 1.99.0(`rust-toolchain.toml`).
- 의존: 기본 feature 없는 `tokio-util` 0.7.20(`Cancel`의 상태), `std`만 켠 `indexmap` 2.14.2(`OrderedMap`의 항목).
- feature `construct`: wait 토큰과 `Raised`를 만들 수 있게 하고 `Raised`의 handle을 읽을 수 있게 한다. 생성 바인딩 crate가 켜고, 코어 crate는 `[dev-dependencies]`에서만 켜므로
  코어 crate의 라이브러리는 혼자 빌드할 때 토큰을 만들 수 없다(I-2 (4)).
- 개발 중 다른 레포에서 쓰는 법: 이 폴더에 대한 경로 의존
  `bindgen_core = { package = "polyspec-bindgen-core", path = "<checkout>/packages/core/rust" }`. 추적하는 매니페스트가 아니라
  로컬 link로 정한다(PRINCIPLES P30).

## 항목

| 항목 | 설계 규칙 | 요약 |
|---|---|---|
| `Io` | I-2 (4), B-5 (a) | `wait: blocking_io`의 토큰. 짧은 블로킹 I/O를 하는 코어 함수의 첫 인자. `construct`에서 `Io::for_generated_call()`. |
| `ProcessWait` | I-2 (4), B-5 (b) | `wait: process_wait`의 토큰. 다른 프로세스를 기다리는 코어 함수의 첫 인자. `Io`와 서로 바뀌지 않는다. `construct`에서 `ProcessWait::for_generated_call()`. |
| `cancel_pair() -> (CancelTrigger, Cancel)` | T-1 `cancel` | 생성 코드가 trigger를 갖고 코어가 `Cancel`을 받는다. |
| `Cancel` | T-1 `cancel` | `is_cancelled(&self) -> bool`, `async cancelled(&self)`, `Clone`. 버려진 trigger는 취소하지 않는다. |
| `CancelTrigger` | T-1 `cancel` | `cancel(&self)`, 여러 번 불러도 같다. |
| `Cleanup` | U-1 `cleanup`, B-10 | 메서드와 blanket 구현이 없는 표지 trait. `cleanup`이 있는 unit의 코어 타입이 구현한다. |
| `OrderedMap<T>` | T-2 `map<T>` | text 키의 삽입 순서 보존 맵: `new`, `with_capacity`, `insert -> Option<T>`(제자리에서 바꾸고 옛 값을 돌려줌), `get`, `len`, `is_empty`, `iter`, `IntoIterator`, `Default`. 같음은 순서까지 본다. 반복 키를 버리게 되는 `FromIterator`는 없다. |
| `Raised` | U-3, E-7 | callback에서 언어 코드가 던진 예외. 코어가 열어 보지 않는 handle로 담는다. `Raised::from_generated(Handle)`와 `handle()`은 `construct`에서만. `Display`, `std::error::Error`. kind 없음. |
| `Failure<E>` | E-1c | `Kind(E)` 또는 `Raised(Raised)`. callback을 부르는 코어 함수의 오류 타입. `From<Raised>`, `Display`, `std::error::Error`. |
| `ValueType` | T-3 | `Json`, `Template`, `Php`. `ALL`, `as_str()`. |
| `naming::{convert, Word, Lang, Role}` | N-2 | 이름 변환. bindgen 밖의 생성기를 위해 공개한다. `naming::Lang`은 `Php`, `Python`, `Js`, `Go`, `Rust`. 시험 벡터를 bindgen의 TypeScript 변환과 함께 쓴다. |
| `Kinds` | F-2, E-3, I-2 (3) | `kind(&self) -> &'static str`, `status(&self) -> Option<u16>`, `errno(&self) -> Option<i32>`, 모두 필수. 모든 코어 오류 enum과 `BindingError`가 구현한다. |
| `Category` | E-1, F-3 | `Value`, `Type`, `Io`, `Store`, `Busy`, `Internal`. `ALL`, `as_str()`. |
| `BindingError` | E-1a | `InvalidNumber { subject, expected: NumberType }`, `InvalidText { subject, cause: TextCause }`, `InvalidPath { subject }`, `DirectConstruction { class }`, `InvalidCallback { subject, member }`, `Consumed { class }`, `InvalidArgumentType { subject, expected }`, `Busy { class }`, `WrongThread { subject }`, `Internal { detail }`. `category()`, `KINDS`(kind와 category 표), `Kinds`, `Display`(메시지 전체, E-4), `std::error::Error`. |
| `NumberType` | B-2 | `Int`, `Int64`, `Uint`, `Float`. |
| `TextCause` | B-3 | `UnpairedSurrogate`, `NotUtf8`, `AboveLatin1`. |
| `Handle` | B-1, T-3 | 만든 쪽만 해석하는 `u64`. `new(u64)`, `raw()`. |
| `ValueKind` | U-1 `value`, T-3 | `null`, `bool`, `int`, `int64`, `float`, `number`, `text`, `bytes`, `list`, `map`, `object`, `reference`, `safe_text`, `native`, `nested:<value type>`. `ALL`, `as_str()`. `out`·`in` 행의 `kind`. |
| `Predicate` | U-1 `when` | `utf8`(bytes), `sequence_keys`(map), `safe_integer`(int), `integral_float`(float). `ALL`, `as_str()`, `kind()`. |
| `OutValue` | T-3 | 나가는 값의 한 단계: `Null`, `Bool`, `Int(IntOut)`, `Int64(i64)`, `Float(FloatOut)`, `Number(String)`, `Text(String)`, `Bytes(BytesOut)`, `List { handle, len }`, `Map(MapOut)`, `Object { handle, len }`, `Reference { handle, value }`, `SafeText(String)`, `Native(Handle)`, `Nested { value_type, value }`. `kind()`, `predicate(Predicate) -> Option<bool>`(술어가 그 종류에 해당하지 않으면 `None`). |
| `IntOut`, `FloatOut`, `BytesOut`, `MapOut` | U-1 `when` | 술어를 여기서 계산하는 래퍼(`MapOut::new`의 `sequence_keys`는 키를 보는 코어가 준다). 같은 handle은 같은 언어 객체이고, 컨테이너는 자식보다 먼저 만들므로 공유와 순환이 그대로 나간다(U-7 (d)). |
| `HostValue` | B-1, T-2 `host_value` | `Number`는 `i64` 밖의 Python `int`의 10진 토큰, `Bytes`는 Python `bytes`. JavaScript number는 모두 `Float`이고 정수인지는 코어가 정한다. `PhpReference`는 참조 원소와 그 정체성을 알린다. 들어오는 값의 한 단계: `Null`, `Undefined`, `Bool`, `Int(i64)`, `Number(String)`, `Float(f64)`, `Text(HostText)`, `Bytes(Vec<u8>)`, `List`, `PhpArray { is_list }`, `Map`, `PlainObject { prototype }`, `PhpReference { identity, target }`, `StdClass`, `Date`, `Callable`, `Object { type_name, json_serializable }`, `Value { kind, handle }`, `Other { type_name, handle }`. |
| `HostText` | B-1, B-3 | `Bytes(Vec<u8>)`(PHP, Go), `Utf16(Vec<u16>)`(JavaScript), `CodePoints(Vec<u32>)`(Python). |
| `Prototype` | B-1 | `Object`, `Null`. |

## 아직 crate에 없는 것

코어가 `HostValue` handle의 자식을 바인딩에 묻고, 바인딩이 `OutValue` handle의 자식을 코어에 묻는 호출 규약은 정하지 않았다.
설계는 handle을 정하지만 호출은 정하지 않는다.

