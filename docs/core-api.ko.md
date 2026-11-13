<!-- doc-id: core-api -->
<!-- source-sha256: 3af7712d7a1bd4badcc8612a443218268029f836b978ca8eb4108f11eceec4b1 -->
# binding_core 공개 API

[English](core-api.md)

crate `binding_core`는 생성 바인딩 crate와 코어 crate가 함께 쓰는 런타임 지원이다. 아래에 적은 설계 규칙의 타입만 두며
어느 라이브러리의 규칙도 두지 않는다.

## Crate

- 경로: 이 레포의 `packages/core/rust`. 패키지 `polyspec-binding-core`, 라이브러리 이름 `binding_core`, 버전 0.0.1, edition
  2021, rust-version 1.99.0, toolchain 1.99.0(`rust-toolchain.toml`).
- 의존: 기본 feature 없는 `tokio-util` 0.7.20(`Cancel`의 상태), `std`만 켠 `indexmap` 2.14.2(`OrderedMap`의 항목), Unix에서 기본 feature 없는
  `libc` 0.2.191(errno 기호의 값, `errno::value`).
- feature `lock`: `Exclusive`, `Shared`, `Reading`, `Writing`과 `sync`만 켠 의존 `tokio` 1.54.1을 더한다. Python·Node·PHP 바인딩
  crate가 켜고 코어 crate는 켜지 않는다(B-5c).
- feature `driver`: `driver::block_on`, `driver::Caught`와 `rt-multi-thread`를 켠 의존 `tokio` 1.54.1을 더한다.
  `wait: async_driver`인 member가 있는 계약의 PHP·Python·Node 바인딩 crate가 켜고(GN-6n), 코어 crate는 켜지 않는다.
- feature `construct`: wait 토큰과 `Raised`를 만들 수 있게 하고 `Raised`의 `Native`를 읽을 수 있게 한다. 생성 바인딩 crate가 켜고, 코어 crate는 `[dev-dependencies]`에서만 켜므로
  코어 crate의 라이브러리는 혼자 빌드할 때 토큰을 만들 수 없다(I-2 (4)).
- feature `fault-test`: 실패 주입점의 장전 자료(`fault::Armed`, `arm`, `take`, `left`)를 컴파일하며, 선택 의존
  `serde_json` 1.0.154(case의 faults 목록)를 쓴다. 주입점을 가진 코어는
  `fault-test = ["polyspec-binding-core/fault-test"]`만 선언한다. 바인딩은 case가 이름을 부르는 주입점을 가진 코어마다
  그 코어의 feature를 켠다. 릴리스 빌드에는 켜지 않는다(G-5).
- 시험: feature가 필요한 crate의 시험 파일(`tests/lock.rs`, `tests/driver.rs`, `tests/native.rs`)은 그 feature를 `required-features`에
  적은 `[[test]]` target이다. 그래서 feature 없는 `cargo test`는 그것을 빌드하지 않고, 그 target의 실행은 그 시험을 돌린다.
  시험을 하나도 돌리지 않은 target은 아무것도 확인하지 않고 통과하기 때문이다(HR-84).
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
| `Exclusive<T>`, `Shared<T>` | U-2 busy, B-5c | `lock`이 있을 때. try로만 얻는 잠금에 담은 class unit의 코어 값: `Exclusive`는 `Arc<tokio::sync::Mutex<T>>`, `Shared`는 `Arc<tokio::sync::RwLock<T>>`이며 각각 `poisoned` 표지를 가진다. `new(T)`, `Clone`(같은 값의 다른 handle), `read(&self, class, beside: &[Option<&Reading<_>>]) -> Result<Reading<_>, BindingError>`(읽기 쪽 자리의 guard. `beside`에 같은 인스턴스의 guard가 있으면 함께 쓴다), `write(&self, class) -> Result<Writing<_>, BindingError>`(쓰기 쪽 자리의 guard), `take(&self, class) -> Result<T, BindingError>`(receiver `self`인 자리의 값. 잠금을 비운다, GN-6o). 잡힌 잠금은 kind `busy`, poisoned 객체는 kind `internal`, 값을 꺼낸 객체는 그 뒤 모든 `read`·`write`·`take`에서 kind `consumed`다. 어떤 호출도 기다리지 않는다. `taken(&self) -> bool`은 소멸자에게 값을 꺼냈는지 알려 준다(GN-6p). |
| `Reading<G>`, `Writing<G>` | B-5c | `lock`이 있을 때. 읽기 쪽 자리의 owned guard(`Deref`, `Clone`, 마지막 복제와 함께 놓인다)와 쓰기 쪽 자리의 owned guard(`Deref`, `DerefMut`). 둘 다 값과 함께 `Send`다. panic이 `Writing`을 거쳐 풀리면 잠금을 놓기 전에 `poisoned`를 세운다. |
| `Cleanup` | U-1 `cleanup`, B-10 | 메서드와 blanket 구현이 없는 표지 trait. `cleanup`이 있는 unit의 코어 타입이 구현한다. |
| `OrderedMap<T>` | T-2 `map<T>` | text 키의 삽입 순서 보존 맵: `new`, `with_capacity`, `insert -> Option<T>`(제자리에서 바꾸고 옛 값을 돌려줌), `get`, `len`, `is_empty`, `iter`, `IntoIterator`, `Default`. 같음은 순서까지 본다. 반복 키를 버리게 되는 `FromIterator`는 없다. |
| `KeyedMap<T>`, `Key` | T-2 `keyed_map<T>`, U-7 (c) | key가 `Key::Int(i64)`, `Key::Bytes(Vec<u8>)`, `Key::Text(String)`인 삽입 순서 보존 맵. API와 규칙은 `OrderedMap`과 같다. |
| `Raised` | U-3, E-7 | callback에서 언어 코드가 던진 예외. 코어가 열어 보지 않는 `Native`로 담고, 마지막 drop이 바인딩의 규칙대로 예외를 해제한다. `Raised::from_generated(Native)`와 `native()`는 `construct`에서만. `Clone`, 객체로 비교하는 `PartialEq`. `Display`, `std::error::Error`. kind 없음. |
| `Failure<E>` | E-1c | `Kind(E)`, `Raised(Raised)`, `Callback(Box<dyn std::error::Error + Send + Sync>)`. callback을 부르는 코어 함수의 오류 타입. 마지막 변형은 Rust 역호출의 오류를 Rust 호출자에게 그대로 돌려주며 `construct` 없이 만들고 생성 코드에는 오지 않는다. `From<Raised>`, `Display`, `std::error::Error`(source는 Rust 역호출의 오류). derive하는 trait는 `Debug`뿐이다. |
| `ValueType` | T-3 | `Json`, `Template`, `Php`. `ALL`, `as_str()`. |
| `naming::{convert, Word, Lang, Role}` | N-2 | 이름 변환. binding 밖의 생성기를 위해 공개한다. `naming::Lang`은 `Php`, `Python`, `Js`, `Go`, `Rust`, `naming::Role`은 `Class`, `Callable`, `Variable`, `Constant`. 그 벡터를 binding의 TypeScript 변환과 함께 쓴다. |
| `Kinds` | F-2, E-3, I-2 (3) | `kind(&self) -> &'static str`, `status(&self) -> Option<u16>`, `errno(&self) -> Option<i32>`, 모두 필수. 모든 코어 오류 enum과 `BindingError`가 구현한다. |
| `Category` | E-1, F-3 | `Value`, `Type`, `Io`, `Store`, `Busy`, `Internal`. `ALL`, `as_str()`. |
| `BindingError` | E-1a | `InvalidNumber { subject, expected: NumberType }`, `InvalidText { subject, cause: TextCause }`, `InvalidPath { subject }`, `DirectConstruction { class }`, `InvalidCallback { subject, member }`, `Consumed { class }`, `InvalidArgumentType { subject, expected }`, `Busy { class }`, `WrongThread { subject }`, `Internal { detail }`. `category()`, `KINDS`(kind와 category 표), `Kinds`, `Display`(메시지 전체, E-4), `std::error::Error`. |
| `path_from_bytes(bytes: Vec<u8>, subject: &str) -> Result<PathBuf, BindingError>` | T-1 `path`, B-3 | OS 바이트의 경로. NUL 바이트와, OS 경로가 바이트가 아닌 곳(Windows)에서 UTF-8이 아닌 바이트는 `InvalidPath`다. |
| `path_bytes(path: &Path) -> &[u8]` | T-1 `path`, B-3 | 언어로 나가는 경로의 바이트. OS 바이트이고, OS 경로가 바이트가 아닌 곳에서는 `OsStr`의 encoded 바이트다. |
| `NumberType` | B-2 | `Int`, `Int64`, `Uint`, `Float`. |
| `TextCause` | B-3 | `UnpairedSurrogate`, `NotUtf8`, `AboveLatin1`. |
| `Handle` | B-1, T-3 | 만든 쪽만 해석하는 `u64`. `new(u64)`, `raw()`. 컨테이너, `Date`, `Other` 값의 handle은 그것을 준 `in`이나 `out` 호출 안에서만 유효하다. |
| `Native`, `NativeObject` | B-1, U-7 (d) | `Native`는 코어가 보관할 수 있는 언어 객체의 소유 handle이다. `Arc<dyn NativeObject>`이고 `Clone + Send + Sync`이며, 두 `Native`는 같은 객체일 때(`Arc::ptr_eq`) 같고, 그것은 같은 언어 객체다(U-7 (d)). 그것을 가진 마지막 코어 값이 drop될 때 객체를 해제한다. `NativeObject: Any + Send + Sync + Debug`는 바인딩이 그 객체 대신 갖는 것(Python 참조, 소유 표의 key)이다. `Native::new(object)`와 `downcast::<T>() -> Option<&T>`는 `construct`에서만. |
| `ValueKind` | U-1 `value`, T-3 | `null`, `bool`, `int`, `int64`, `float`, `number`, `text`, `text16`, `bytes`, `list`, `map`, `object`, `reference`, `safe_text`, `native`, `nested:<value type>`. `ALL`, `as_str()`. `out`·`in` 행의 `kind`. |
| `Predicate` | U-1 `when` | `utf8`(bytes), `sequence_keys`(map), `safe_integer`(int), `integral_float`(float). `ALL`, `as_str()`, `kind()`. |
| `OutValue` | T-3 | 나가는 값의 한 단계: `Null`, `Bool`, `Int(IntOut)`, `Int64(i64)`, `Float(FloatOut)`, `Number(String)`, `Text(String)`, `Text16(Vec<u16>)`(짝 없는 surrogate까지 담는 UTF-16 code unit의 text, GN-6x), `Bytes(BytesOut)`, `List { handle, len }`, `Map(MapOut)`, `Object { handle, len }`, `Reference { handle, value }`, `SafeText(String)`, `Native(Native)`, `Nested { value_type, value }`. `kind()`, `predicate(Predicate) -> Option<bool>`(술어가 그 종류에 해당하지 않으면 `None`). |
| `IntOut`, `FloatOut`, `BytesOut`, `MapOut` | U-1 `when` | 술어를 여기서 계산하는 래퍼(`MapOut::new`의 `sequence_keys`는 키를 보는 코어가 준다). 같은 handle은 같은 언어 객체이고, 컨테이너는 자식보다 먼저 만들므로 공유 값과 순환 값이 모양을 유지한다(U-7 (d)). |
| `HostValue` | B-1, T-2 `host_value` | `Int`는 `i64`에 드는 JavaScript `bigint`도 포함한다. `Number`는 `i64` 밖의 Python `int`나 JavaScript `bigint`의 10진 토큰, `Bytes`는 Python `bytes`. `Float`는 PHP, Python, Go의 실수이며 실수로 남는다. JavaScript number는 모두 `UntypedNumber`이고 정수인지는 코어가 정한다(U-7 (f)). `PhpReference`는 참조 원소와 그 정체성을 알린다. 들어오는 값의 한 단계: `Null`, `Undefined`, `Bool`, `Int(i64)`, `Number(String)`, `Float(f64)`, `UntypedNumber(f64)`, `Text(HostText)`, `Bytes(Vec<u8>)`, `List`, `PhpArray { is_list }`, `Map`, `PlainObject { prototype }`, `PhpReference { identity, target }`, `StdClass`, `Date`, `Callable(Native)`, `Object { native, type_name, json_serializable }`, `Value { kind, handle }`, `Other { type_name, handle }`. |
| `HostText` | B-1, B-3 | `Bytes(Vec<u8>)`(PHP, Go), `Utf16(Vec<u16>)`(JavaScript), `CodePoints(Vec<u32>)`(Python). |
| `Prototype` | B-1 | `Object`, `Null`. |
| `OutValues` | B-1, U-7 (d) | 생성 코드가 `OutValue` handle의 자식을 코어에 묻는 trait. value alias의 코어 `out` 함수가 루트와 함께 돌려준다. `item(&mut self, list, index) -> OutValue`, `entry(&mut self, map, index) -> (OutValue, OutValue)`(맵이나 객체, 순서대로). 같은 handle은 같은 언어 객체다. |
| `HostValues` | B-1 | 코어가 `HostValue` handle의 자식을 바인딩에 묻는 trait. 생성 코드가 구현한다. `item(&mut self, list, index) -> Result<HostValue, Raised>`, `entry(&mut self, map, index) -> Result<(HostValue, HostValue), Raised>`(맵, PHP 배열, plain object, `stdClass`, 언어의 순서), `read(&mut self, value) -> Result<HostValue, Raised>`(값 표 class의 `read` member). 물음은 언어 코드를 부를 수 있으므로 실패는 그 코드의 예외다. |
| `fault::point!(name) -> Option<fault::Injected>` | G-5, X-1, GN-5 | 코어의 실패 주입점. 이름은 `<library>.<id>`이며 계약의 `faults`가 가리키는 코어의 `#[doc(hidden)] pub const`다. 늘 있는 macro이고, 그 점을 적은 crate 자신의 feature `fault-test`로 판정된다. Cargo는 binding_core의 feature를 합치므로, 코어 하나가 `fault-test`를 켜면 build 안의 모든 코어에서 binding_core의 feature가 켜지기 때문이다. 그 crate에 자기 `fault-test`가 없거나 이 스레드에 그 점의 fault가 장전되지 않았으면 `None`이다. 한 번 쓰일 때마다 그 점에 닿은 한 번이다. |
| `fault::Injected` | G-5 | `Io { errno: Option<i32> }`(그 자리의 I/O 호출이 실패한다. errno는 fault의 기호가 대상에서 갖는 값이다), `Short { bytes: u64 }`(그 읽기·쓰기가 그만큼만 처리하고 끝난다), `Broken`(그 자리의 불변식이 깨졌다). |
| `fault::arm(member, faults) -> Result<u64, ArmError>` | G-5 | `fault-test`가 있을 때. case의 `faults` JSON 목록(`point`, `kind`, `errno`, `bytes`, `nth`)을 이 스레드에서 그 member id를 다음에 부르는 호출에 장전하고 장전 id를 준다. fault는 그 점에 `nth`번째(없으면 첫 번째)로 닿을 때 한 번 주입된다. errno 기호는 Linux와 macOS가 함께 가진 POSIX 기호다. 대상에 없는 기호나 errno가 없는 대상은 `ArmError::Errno`다. |
| `fault::take(member) -> Armed`, `fault::Armed::{empty, run}` | G-5 | `fault-test`가 있을 때. 생성 진입점은 동기 부분에서 자기 member와 스레드의 장전을 꺼내고, 없으면 빈 장전을 꺼내, 작업과 함께 옮겨 `run` 안에서 작업을 실행한다. `run`은 장전을 그 스레드에 설치하고 끝나면(panic 뒤에도) 이전 장전으로 되돌린다. `point`는 설치된 장전만 읽으므로, callback 안에서 다시 들어온 진입점은 바깥 장전을 보지 않고, 코어가 새로 만든 task·스레드에는 장전이 이어지지 않는다. |
| `fault::Armed::around(self, future) -> Around<F>` | G-5, GN-6n | `fault-test`가 있을 때. `future`의 poll마다 장전을 설치하고 그 뒤 앞의 장전을 되돌리는 future다. panic 뒤에도 되돌린다. 그래서 `async fn`의 주입점은 runtime의 어느 스레드에서도 자기 호출의 장전을 본다. |
| `driver::block_on(future) -> Result<F::Output, BindingError>` | GN-6n | `driver`가 있을 때. `future`를 프로세스의 runtime에서 돌린다. 이 runtime은 build의 모든 driver를 켠 multi-thread tokio runtime이며 첫 호출이 만든다. 호출 스레드는 future가 끝날 때까지 기다린다. runtime을 만들 수 없으면 `BindingError::Internal`이다. 그 runtime의 스레드는 이것을 부르지 않는다. |
| `driver::Caught<F>`, `driver::Caught::new(future)` | GN-6n, B-7 | `driver`가 있을 때. 출력이 `Result<F::Output, String>`인 future다. `future`의 poll이 panic하면 그 panic의 메시지로 끝나며, 생성 코드는 이것을 kind `internal`로 낸다. |
| `machine::Machine` (`type Io: Send + 'static`, `type Done`, `resume(&mut self, io: Option<Io>) -> Step<Io, Done>`, `call(&mut self)`) | GN-6ab | `"machine": true`인 member의 코어 경로가 돌려주는 I/O 없는 state machine이며 인자를 소유한다. `resume`은 마지막 기다림의 출력(처음과 call 뒤에는 `None`)으로 그것을 진행시킨다. `call`은 그것을 돌리는 스레드에서 언어 코드를 부르고, 그 실패는 뒤 단계를 위해 지닌다. feature 없이 있으므로 코어 crate가 구현한다. |
| `machine::Step<I, D>` (`Io(Wait<I>)`, `Call`, `Done(D)`), `machine::Wait<I>` | GN-6ab | machine의 한 단계: 언어 코드에 닿지 않는 코어의 future(`Wait<I>`, pin하고 box한 `Send + 'static` future), 언어 코드의 call, 또는 member의 결과다. |
| `machine::drive(&mut machine, wait) -> Result<Done, BindingError>` | GN-6ab | 호출 스레드에서 machine을 끝까지 돌린다(PHP, Python의 막는 꼴). `wait`이 각 future를 기다리고, 각 call은 호출 스레드에서 한다. `wait`의 오류는 다른 단계 없이 machine을 끝낸다. |
| `machine::Driving<M>` (`new`, `give`, `advance() -> Next<Io, Done>`), `machine::Next<I, D>` (`Wait(Wait<I>)`, `Done(D)`) | GN-6ab | 언어의 runtime이 진행시키는 machine(Node): `advance`는 호출 스레드에서 machine의 call을 하고, 기다림에서 멈추거나(그 출력은 `give`가 다음 단계에 준다) 끝에서 멈춘다. |
| `fault::left(id) -> Result<Vec<String>, ArmError>` | G-5 | `fault-test`가 있을 때. 그 장전에서 주입되지 않은 fault의 점 이름을 주고 장전을 잊는다. 생성 시험은 이것이 비었는지 확인한다. |
| `errno::value(symbol) -> Option<i32>` | G-5 | feature 없이. 대상에서 errno 기호가 갖는 값을 `arm`이 읽는 표에서 주고, 대상에 없는 기호에는 없음을 준다. PHP 확장은 이것을 시험에 `Internal\errnoOf`로 준다(GN-8a). |
| `fault::ArmError` | G-5 | `Form(String)`, `Errno(String)`, `Id(u64)`, `Poisoned`. `Display`, `std::error::Error`. |

## 아직 crate에 없는 것

설계의 호출 규약은 모두 crate에 있다.

