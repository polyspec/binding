<!-- doc-id: core-api -->
# binding_core 공개 API

[English](core-api.md)

crate `binding_core`는 생성 바인딩 crate와 코어 crate가 함께 쓰는 런타임 지원이다. 아래에 적은 설계 규칙의 타입만 두며
어느 라이브러리의 규칙도 두지 않는다.

## Crate

- 경로: 이 레포의 `packages/core/rust`. 패키지 `polyspec-binding-core`, 라이브러리 이름 `binding_core`, 버전 0.0.1, edition
  2021, rust-version 1.99.0, toolchain 1.99.0(`rust-toolchain.toml`).
- 의존: 기본 feature 없는 `tokio-util` 0.7.20(`Cancel`의 상태), `std`만 켠 `indexmap` 2.14.2(`OrderedMap`의 항목).
- feature `lock`: `Exclusive`, `Shared`, `Reading`, `Writing`과 `sync`만 켠 의존 `tokio` 1.54.1을 더한다. Python·Node·PHP 바인딩
  crate가 켜고 코어 crate는 켜지 않는다(B-5c).
- feature `construct`: wait 토큰과 `Raised`를 만들 수 있게 하고 `Raised`의 handle을 읽을 수 있게 한다. 생성 바인딩 crate가 켜고, 코어 crate는 `[dev-dependencies]`에서만 켜므로
  코어 crate의 라이브러리는 혼자 빌드할 때 토큰을 만들 수 없다(I-2 (4)).
- 개발 중 다른 레포에서 쓰는 법: 이 폴더에 대한 경로 의존
  `binding_core = { package = "polyspec-binding-core", path = "<checkout>/packages/core/rust" }`. 추적하는 매니페스트가 아니라
  로컬 link로 정한다(PRINCIPLES P30).

## 항목

| 항목 | 설계 규칙 | 요약 |
|---|---|---|
| `Io` | I-2 (4), B-5 (a) | `wait: blocking_io`의 토큰. 짧은 블로킹 I/O를 하는 코어 함수의 첫 인자. `construct`에서 `Io::for_generated_call()`. |
| `ProcessWait` | I-2 (4), B-5 (b) | `wait: process_wait`의 토큰. 다른 프로세스를 기다리는 코어 함수의 첫 인자. `Io`와 서로 바뀌지 않는다. `construct`에서 `ProcessWait::for_generated_call()`. |
| `cancel_pair() -> (CancelTrigger, Cancel)` | T-1 `cancel` | 생성 코드가 trigger를 갖고 코어가 `Cancel`을 받는다. |
| `Cancel` | T-1 `cancel` | `is_cancelled(&self) -> bool`, `async cancelled(&self)`, `Clone`. 버려진 trigger는 취소하지 않는다. |
| `Cancel::on_cancel(&self, wake: impl FnOnce() + Send + 'static) -> CancelGuard` | B-5 (b) | 호출자가 취소하면 trigger의 스레드에서 `wake`를 한 번 부르고, 이미 취소했으면 바로 부른다. 그래서 블로킹 대기(`Condvar`, park한 스레드)가 폴링 없이 깨어난다. `wake`는 막히면 안 된다. |
| `CancelGuard` | B-5 (b) | 버리면 아직 불리지 않은 함수를 뺀다. |
| `CancelTrigger` | T-1 `cancel` | `cancel(&self)`, 여러 번 불러도 같다. 상태를 취소한 뒤 등록된 함수를 부른다. |
| `Exclusive<T>`, `Shared<T>` | U-2 busy, B-5c | `lock`이 있을 때. try로만 얻는 잠금에 담은 class unit의 코어 값: `Exclusive`는 `Arc<tokio::sync::Mutex<T>>`, `Shared`는 `Arc<tokio::sync::RwLock<T>>`이며 각각 `poisoned` 표지를 가진다. `new(T)`, `Clone`(같은 값의 다른 handle), `read(&self, class, beside: &[Option<&Reading<_>>]) -> Result<Reading<_>, BindingError>`(읽기 쪽 자리의 guard. `beside`에 같은 인스턴스의 guard가 있으면 함께 쓴다), `write(&self, class) -> Result<Writing<_>, BindingError>`(쓰기 쪽 자리의 guard). 잡힌 잠금은 kind `busy`, poisoned 객체는 kind `internal`이다. 어떤 호출도 기다리지 않는다. |
| `Reading<G>`, `Writing<G>` | B-5c | `lock`이 있을 때. 읽기 쪽 자리의 owned guard(`Deref`, `Clone`, 마지막 복제와 함께 놓인다)와 쓰기 쪽 자리의 owned guard(`Deref`, `DerefMut`). 둘 다 값과 함께 `Send`다. panic이 `Writing`을 거쳐 풀리면 잠금을 놓기 전에 `poisoned`를 세운다. |
| `Cleanup` | U-1 `cleanup`, B-10 | 메서드와 blanket 구현이 없는 표지 trait. `cleanup`이 있는 unit의 코어 타입이 구현한다. |
| `OrderedMap<T>` | T-2 `map<T>` | text 키의 삽입 순서 보존 맵: `new`, `with_capacity`, `insert -> Option<T>`(제자리에서 바꾸고 옛 값을 돌려줌), `get`, `len`, `is_empty`, `iter`, `IntoIterator`, `Default`. 같음은 순서까지 본다. 반복 키를 버리게 되는 `FromIterator`는 없다. |
| `KeyedMap<T>`, `Key` | T-2 `keyed_map<T>`, U-7 (c) | key가 `Key::Int(i64)`, `Key::Bytes(Vec<u8>)`, `Key::Text(String)`인 삽입 순서 보존 맵. API와 규칙은 `OrderedMap`과 같다. |
| `Raised` | U-3, E-7 | callback에서 언어 코드가 던진 예외. 코어가 열어 보지 않는 handle로 담는다. `Raised::from_generated(Handle)`와 `handle()`은 `construct`에서만. `Display`, `std::error::Error`. kind 없음. |
| `Failure<E>` | E-1c | `Kind(E)`, `Raised(Raised)`, `Callback(Box<dyn std::error::Error + Send + Sync>)`. callback을 부르는 코어 함수의 오류 타입. 마지막 변형은 Rust 역호출의 오류를 Rust 호출자에게 그대로 돌려주며 `construct` 없이 만들고 생성 코드에는 오지 않는다. `From<Raised>`, `Display`, `std::error::Error`(source는 Rust 역호출의 오류). `Debug`만 derive한다. |
| `ValueType` | T-3 | `Json`, `Template`, `Php`. `ALL`, `as_str()`. |
| `naming::{convert, Word, Lang, Role}` | N-2 | 이름 변환. binding 밖의 생성기를 위해 공개한다. `naming::Lang`은 `Php`, `Python`, `Js`, `Go`, `Rust`, `naming::Role`은 `Class`, `Callable`, `Variable`, `Constant`. 시험 벡터를 binding의 TypeScript 변환과 함께 쓴다. |
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
| `HostValue` | B-1, T-2 `host_value` | `Int`는 `i64`에 드는 JavaScript `bigint`도 포함한다. `Number`는 `i64` 밖의 Python `int`나 JavaScript `bigint`의 10진 토큰, `Bytes`는 Python `bytes`. `Float`는 PHP, Python, Go의 실수이며 실수로 남는다. JavaScript number는 모두 `UntypedNumber`이고 정수인지는 코어가 정한다(U-7 (f)). `PhpReference`는 참조 원소와 그 정체성을 알린다. 들어오는 값의 한 단계: `Null`, `Undefined`, `Bool`, `Int(i64)`, `Number(String)`, `Float(f64)`, `UntypedNumber(f64)`, `Text(HostText)`, `Bytes(Vec<u8>)`, `List`, `PhpArray { is_list }`, `Map`, `PlainObject { prototype }`, `PhpReference { identity, target }`, `StdClass`, `Date`, `Callable`, `Object { type_name, json_serializable }`, `Value { kind, handle }`, `Other { type_name, handle }`. |
| `HostText` | B-1, B-3 | `Bytes(Vec<u8>)`(PHP, Go), `Utf16(Vec<u16>)`(JavaScript), `CodePoints(Vec<u32>)`(Python). |
| `Prototype` | B-1 | `Object`, `Null`. |
| `OutValues` | B-1, U-7 (d) | 생성 코드가 `OutValue` handle의 자식을 코어에 묻는 trait. value alias의 코어 `out` 함수가 루트와 함께 돌려준다. `item(&mut self, list, index) -> OutValue`, `entry(&mut self, map, index) -> (OutValue, OutValue)`(맵이나 객체, 순서대로). 같은 handle은 같은 언어 객체다. |
| `HostValues` | B-1 | 코어가 `HostValue` handle의 자식을 바인딩에 묻는 trait. 생성 코드가 구현한다. `item(&mut self, list, index) -> Result<HostValue, Raised>`, `entry(&mut self, map, index) -> Result<(HostValue, HostValue), Raised>`(맵, PHP 배열, plain object, `stdClass`, 언어의 순서), `read(&mut self, value) -> Result<HostValue, Raised>`(값 표 class의 `read` member). 물음은 언어 코드를 부를 수 있으므로 실패는 그 코드의 예외다. |

## 아직 crate에 없는 것

설계의 호출 규약은 모두 crate에 있다.
설계는 handle을 정하지만 호출은 정하지 않는다.

