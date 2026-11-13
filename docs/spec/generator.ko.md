<!-- doc-id: generator -->
# 생성기

[English](generator.md)

`binding generate [--root <repository>] [--out <directory>]`는 `packages/rust/interface.json`을 검사하고
(docs/spec/contract-check.md) 그 target의 바인딩을 쓴다. 이 문서는 설계가 생성기에 맡긴 규칙을 적는다. 설계 id는 binding
설계의 것이다.

## 범위

- **GN-1** 생성기는 functions unit, class unit(생성자, static member, receiver `&self`·`&mut self`인 메서드와 property(GN-6h), kind `iterate`·`stringify`·`to_json` member, GN-6f, GN-6g), record(parameter와
  결과 형태, 다른 레포의 것 포함), 값 alias(다른 레포의 것 포함, GN-6k), enum, 상수, 오류 클래스, 오류 unit(GN-7a)에 대해, 그리고 Python·Node·PHP·WASM은 parameter의 타입 `source`(GN-6j)와
  parameter와 record field의 기본값(GN-6i)에 대해, Python·Node·PHP는 receiver가 `self`인 method(GN-6o), `cleanup`이 있는 class unit(GN-6p)과 언어 코드에 닿는 `blocking_io` member(GN-6q)에 대해 PHP(ext-php-rs 0.16.4), Python(PyO3 0.30.1, abi3-py314),
  Node(napi 3.16.2), Go(C ABI 정적 라이브러리 위의 cgo, GN-15), WASM(wasm-bindgen 0.2.130, GN-18)을 쓴다. callback interface(U-3, receiver를 `core.receiver`에 적은 동기 member)도 쓴다. 그 밖의 항목(비동기나
  recognize가 있는 callback, 함수 타입, value unit, `none`, `blocking_io`(GN-6m), `async_driver`(GN-6n)가 아닌 wait, GN-6i가 적지 않은 기본값, unit의 `only`, `native`, 이름 예외, 다른 라이브러리의 kind, parameter가 아닌 자리의 타입 `source`)은 그 target의 무엇을 쓰기 전에 이름으로 거부한다(G-4, P-4, GN-1c). Go는 class unit, callback unit, 값 alias(다른 레포의 것 포함), 타입 `source`, 기본값, 오류 unit, 다른 레포의 record를 GN-15a~GN-15f대로 생성하고, 패키지가 서로 import하게 될 module은 거부한다(GN-15a). WASM은 class unit을 GN-18a대로, 값 alias(다른 레포의 것 포함)와 callback unit을 GN-18b와 GN-18c대로 생성한다.
- **GN-1a** 생성기는 실패하기 전에 계약 전체를 읽는다: 거부하는 항목을 모두 한 줄에 하나씩 이름한 뒤 거부된 target의 것은 아무것도
  쓰지 않고 실패한다(G-4, GN-1c). 항목(unit, member, field, kinds의 행)은 그 검사들이 찾은 첫 이유로 이름한다. 같은 항목의 뒤 검사는 앞
  검사가 거부한 것을 읽기 때문이다. 통째로 거부된 unit은 그것에 기대는 항목 때문에 다시 이름하지 않는다. target이 자기 파일을
  쓰는 동안에만 찾는 거부(그 변환이 받지 않는 타입)는 계약의 거부가 없을 때 이름하며, 생성이 실패하기 전에 모든 target을
  내보내므로 한 target의 거부가 다른 target의 거부를 가리지 않는다. 이유: 첫 거부에서 멈추는 생성기는 결함을 하나씩만
  보이므로, 계약을 고치려면 거부된 항목 수만큼 실행해야 한다.
- **GN-1b** 계약의 일부 target의 생성(`targets`를 준 `generate`)은 그 target에 모든 target의 생성이 쓰는 것과 같은 파일을
  쓰고, 그 target의 거부만 검사한다. 계약의 거부는 모든 target의 거부다. 이유: 생성기가 거부하는 한 target이 다른 target의
  생성을 막지 않는다(GN-14c).
- **GN-1c** `binding generate`는 받은 target 또는 계약의 target을 하나씩 따로 생성한다(GN-1b). 아무것도 거부하지 않은
  target의 파일은 모두 쓰고, 거부된 target은 거부한 항목과 함께 이름하며 그 파일은 그대로 두고, target이 하나라도 거부되면
  생성한 target도 적은 뒤 상태 1로 실패한다. 거부는 명령줄 오류가 아닌 다른 실패와 마찬가지로 usage 줄을 찍지 않는다. usage 줄은
  명령줄 오류만 상태 2와 함께 찍는다. target 하나를 build하고 시험하는 저장소는 `--target`으로 그 target만 생성하므로, 다른
  target의 거부에 막히지 않는다. 이유: 한 target이 아직 받지 못하는 계약도 다른 target의 바인딩은 내고, 실패한 target은 모두
  이름하며, usage 줄은 명령을 잘못 적지 않았는데도 잘못 적었다고 말하기 때문이다.
- **GN-2** 결과는 계약, `cases`가 가리키는 case 파일, 코어 crate의 버전과 라이브러리 이름(manifest를 TOML로 읽는다),
  binding 자신에만 기댄다. 시각, 경로, 호스트를 담지 않고 목록은 계약 순서다(I-5). `--out`은 같은 파일을 다른 디렉터리에
  쓴다. `packages/ts`의 시험은 두 디렉터리에 두 번 생성해 바이트를 비교한다.

## 배치(L-1, L-2)

- **GN-3** binding은 다섯 디렉터리를 소유하고 각각을 staging 디렉터리를 거쳐 통째로 쓴다. 그래서 이전 생성의 파일이 남지
  않고 읽는 쪽은 일부만 보지 않는다: `packages/php-ext/generated`, `packages/python/generated`, `packages/ts/generated`,
  `packages/go/internal/ffi/generated`, `packages/ts/wasm/generated`. 생성 패키지 옆에 손으로 쓰는 폴더가 있는 Go 모듈(L-1)에서는
  디렉터리가 아니라 `zz_generated_*.go` 파일을 소유한다: 생성은 `packages/go` 아래의 그 파일을 모두 지우고 자기 것을 쓰며, 그
  파일은 추적한다(G-6).
  binding의 소스는 레포에 복사하지 않는다. 코어와 바인딩 crate는 `polyspec-binding-core`에 의존하며, 첫 릴리스 전에는
  binding 레포의 Git 의존이고 레포의 `Cargo.lock`이 커밋을 고정한다.
- **GN-3a** 바인딩마다 최종 자리에 추적하는 얇은 package가 있다: `packages/<python|ts|php-ext>/Cargo.toml`, crate의 속성을
  갖고 `generated/lib.rs`를 include하는 진입 `src/lib.rs`(include된 파일은 그 속성을 가질 수 없다), 언어의 manifest
  (`pyproject.toml`, `package.json`, `composer.json`, 언어의 패키저가 crate 옆에 필요로 한다), 계약과 무관한 crate 파일(manifest가
  가리키는 Node와 PHP의 `build.rs`; 그래서 생성 전에도 `cargo fmt --all`과 workspace metadata가 된다). Rust 파일은 모두
  rustfmt가 기본 설정에서도 레포의 설정(`use_small_heuristics = "Max"`, 더 넓은 `max_width`)에서도 그대로 두는 꼴이므로,
  레포의 `rustfmt.toml`이 이 값을 어떻게 적든 `cargo fmt --all --check`가 통과한다: allow 속성은 80칸 이하의 한 줄이며 이는 두
  설정의 함수꼴 속성 폭보다 좁다. 한 줄에 들어가지 않는 이유는 속성 위의 주석이 되고, 속성은 규칙 id만 적는다. 코어가
  `packages/<component>/rust`이면(L-1) 바인딩 package와 생성 디렉터리는 `packages/<component>/<python|ts|php-ext>`이고,
  `scaffold`와 `generate`는 그 계약을 `--contract`로 받는다.
  `scaffold`는 `--out`이 있으면 그 아래에 쓰고, 아직 `todo`인 unit(CK-2)이 있어도 멈추지 않는다. 얇은 package는 패키지·이름
  항목에만 기대기 때문이며, `check`와 `generate`가 그것을 지적한다. `scaffold`는 스키마(CK-1)와 이름(CK-18)의 finding에만
  멈추고 Cargo에 workspace를 묻지 않는다. 그래서 더는 풀리지 않는 이전 scaffold의 바인딩 manifest(코어 crate 이름 변경)가
  다시 쓰기를 막지 않는다.
- **GN-3b** 언어 패키지가 손으로 쓴 host 패키지인 언어(L-2a, `packages.<lang>.host: true`)는 바인딩을 한 가지 형태로 담고,
  `scaffold`, `generate`, `check`(CK-19)가 그 형태를 함께 쓴다. `scaffold`는 host의 manifest를 쓰지 않고 `check`는 거기서 아래
  항목만 읽는다.
  - Python: 바인딩 crate는 `packages/<component>/python/native/`다(`Cargo.toml`, `src/lib.rs`, Rust 소스와 시험이 든
    `generated/`; 경로 의존은 한 단계 더 올라간다). 생성된 Python 패키지는 host 소스 루트의 하위 패키지
    `<module>._binding`, 곧 `src/<module 경로>/_binding/`이며 binding이 소유하고 통째로 쓴다. 네이티브 모듈은
    `<module>._binding._native`이고 host 코드는 `<module>._binding`에서 API를 import한다. host의 `pyproject.toml`은
    `build-system.build-backend` `maturin`, `tool.maturin.manifest-path` `native/Cargo.toml`, `tool.maturin.python-source`
    `src`, `tool.maturin.module-name` `<module>._binding._native`를 갖는다.
  - Node: 바인딩 crate는 Node `build.rs`가 든 `packages/<component>/ts/native/`이고, 생성된 진입점과 선언은
    `native/generated/`다. host의 `package.json`은 `name`, `files`의 `native/generated/index.cjs`,
    `native/generated/index.mjs`, `native/generated/index.d.ts`, 그리고 `optionalDependencies`에 자기 `version`으로 적은
    GN-3c의 플랫폼 패키지를 갖는다. host 코드는 `native/generated/index.mjs`(또는 `index.cjs`)를 상대 경로로 import하고,
    생성 시험도 `native/generated/tests/`에서 그렇게 한다. WASM crate는 `native/wasm/`이고, 그 module, glue, 선언은
    `native/wasm/generated/`이며 host의 `files`가 그것을 적는다(`native/wasm/generated/*.mjs`, `*.js`, `*.d.ts`,
    `*.wasm`). 그 시험은 `native/wasm/generated/index.mjs`를 상대 경로로 import한다.
  - PHP: 확장은 별도 Composer 패키지(type `php-ext`) `<host 패키지>-native`이고 자리는
    `packages/<component>/php/native/`다. `scaffold`가 그 crate와 `composer.json`을 거기에 쓰고 `generated/`도 그 옆이다.
    host 라이브러리 `packages/<component>/php/composer.json`은 `ext-<확장 이름>`(`*`)을 require하며, 확장은 PHP가 로드할 때
    클래스와 함수를 등록한다. host 배치에는 `php-ext/` 디렉터리가 없다.
- **GN-3c** Node addon은 T-2(계획)의 플랫폼마다 npm 패키지 하나에 든다. 이름은 napi-rs 플랫폼 이름 `linux-x64-gnu`,
  `linux-arm64-gnu`, `darwin-arm64`를 붙인 `<npm 패키지>-<platform>`이고, `<scope 없는 npm 이름>.<platform>.node`를 `main`으로
  `os`, `cpu`, `libc`와 함께 갖는다. 라이브러리의 npm 패키지나 host 패키지(L-2a)는 addon을 갖지 않고 모든 플랫폼 패키지를 자기
  버전으로 `optionalDependencies`에 적어 npm이 그 기계의 것을 설치하게 한다. 플랫폼 패키지는 배포 도구가 빌드해 낸다(K-3).
  생성된 진입점은 `<npm 패키지>-<platform>`을 로드하고, 설치되어 있지 않으면 checkout의 빌드가 진입점 옆에 둔 파일
  `<name>.<platform>.node`를 로드한다. 끝에서 끝까지 확인은 그 기계의 플랫폼 패키지를 배포처럼 pack해 두 tarball을 설치한다.
- **GN-3d** PHP 바인딩 crate는 macOS에서 그 `build.rs`만으로 링크된다(BD-9): 그 스크립트는 `CARGO_CFG_TARGET_OS`가
  `macos`일 때 `cargo:rustc-cdylib-link-arg=-undefined`와 `cargo:rustc-cdylib-link-arg=dynamic_lookup`을 내고, 다른 target에서는
  아무것도 내지 않으며, 그 변수를 읽을 수 없으면 실패한다(P-3). 그 crate의 `[lib]`은 `test = false`와 `doctest = false`를
  가진다. binding이나 저장소의 어느 추적 파일도, 끝에서 끝까지 확인의 어느 실행도 링크 설정을 `RUSTFLAGS`나
  `.cargo/config.toml`에 주지 않는다. 이유: PHP는 확장을 로드할 때 그 기호를 찾으므로 macOS 링커가 그 기호를 비워 두어야
  하고, ext-php-rs 0.16.4는 그것에 의존하는 crate에 이 인자를 주지 않는다. `cargo:rustc-cdylib-link-arg`는 이 crate의 cdylib에만
  걸리므로 코어와 다른 crate의 시험 실행 파일은 풀리지 않는 기호에서 여전히 실패한다. `rustflags`는 모든 crate에서 그것을
  통과시킨다. `.cargo/config.toml`은 Cargo가 시작한 디렉터리 아래에서만 읽히고 `RUSTFLAGS`가 그것을 대신하므로, 같은 tree가
  Cargo를 어디서 어떻게 시작하느냐에 따라 다르게 링크된다. build script는 host에서 돌므로 대상의 OS는 `cfg!(target_os)`가
  아니라 `CARGO_CFG_TARGET_OS`다. 그 crate의 Rust 시험 실행 파일은 로드된 확장만 가진 PHP 기호가 필요하므로, 생성 시험은
  PHP에서 돈다.
- **GN-4** 바인딩 crate는 레포 workspace의 구성원이고(L-2) 레포의 모든 패키지처럼 `lints.workspace = true`로 lint를
  받는다. 그래서 한 표가 코어와 바인딩의 R-1 lint를 정한다. 그 표는 `unsafe_code`를 forbid가 아니라 deny한다.
  ext-php-rs, napi-rs, PyO3, wasm-bindgen의 macro가 unsafe 코드로 펼쳐지고, 생성 코드의 unsafe 블록마다 이유를 단 allow가
  있기 때문이다. Cargo는 workspace 표를 모든 구성원에 똑같이 적용하므로, 한 crate의 예외는 이유를 단 그 소스의
  attribute(`#![allow(<lint>, reason = "...")]`)다. lint가 죽은 코드를 금하므로 생성 코드는 쓰는 도우미 함수만 갖는다.
- **GN-4a** `core.features`(I-1)에 행이 있는 target은 코어를 그 feature로만 빌드한다. 그 바인딩 manifest는
  `default-features = false`와 그 행의 feature로 코어에 의존한다.
- **GN-4b** 코어는 플랫폼 I/O의 연산마다 Cargo feature를 둔다: `fs`(파일 시스템의 경로), `blocking-io`(호출 스레드를 막는
  I/O), `process`(다른 프로세스를 기다림), `net`(네트워크 소켓). 그 연산만 쓰는 의존은 그 feature의 `optional` 의존이고,
  그 연산의 모듈과 그것을 쓰는 항목은 `#[cfg(feature = "<feature>")]`다. `default` feature는 넷을 모두 켠다.
  `core.features.wasm`은 그 가운데 어느 것도 적지 않는다. 브라우저의 WebAssembly에는 이 연산이 없기 때문이며, `binding
  check`가 적힌 것을 지적한다(CK-63). 코어는 target에 따라 의존을 가르지 않는다(`[target.'cfg(...)'.dependencies]`).
  `core.features`가 target이 무엇을 빌드하는지 적는 한 자리이기 때문이다. `compile_error!` 같은 OS 제약의 검사는 그
  feature의 모듈 안에 둔다. 그래서 feature가 꺼진 WASM 빌드는 그것을 컴파일하지 않고, feature가 켜진 지원하지 않는 OS는
  거기서 멈춘다. WASM이 끄는 feature의 항목을 쓰는 member나 unit은 다른 target의 `only`다. 계약 검사는 Rust 소스를 읽지
  않으므로 그것은 계약 검사가 아니라 WASM 빌드가 판정한다.
- **GN-5** 모든 crate는 `rust-version = "1.99.0"`과 B-7 시험의 진입점을 더하는 feature `panic-test`를 갖는다. 바인딩
  crate의 시험 feature는 이 표의 것뿐이다. 각 feature는 아래 이름의 진입점을 더하고, `binding scaffold`가 쓰는
  매니페스트는 어느 것도 기본으로 켜지 않으며, 릴리스 빌드에는 어느 것도 없다(G-5). `<Alias>`와 `<alias>`는 그 alias
  이름을 언어의 클래스 형태와 snake_case로 쓴 것이다.

  | feature | 용도 | Python | Node | PHP | Go C 기호 |
  |---|---|---|---|---|---|
  | `panic-test` | B-7, B-5c의 poison(GN-6h) | `_panic_test`, `_panic_test_held` | `__panicTest`, `__panicTestHeld` | `<namespace>\Internal\panicTest`, `panicTestHeld` | `<prefix>__panic_test`, `<prefix>__panic_test_held` |
  | `codec-test` | Go 값 변환의 왕복(GN-13b), 값 alias의 `in` 함수만 실행(U-7) | `_alias_in_<alias>` | `__aliasIn<Alias>` | `<namespace>\Internal\aliasIn<Alias>` | `<prefix>__echo_<type>`, `<prefix>__alias_in_<alias>`. WASM은 `__aliasIn<Alias>` |
  | `fault-test` | 실패 주입(GN-8a) | `_arm_faults`, `_fault_left` | `__armFaults`, `__faultLeft` | `<namespace>\Internal\armFaults`, `faultLeft` | `<prefix>__arm_faults`, `<prefix>__fault_left`. WASM은 `__armFaults`, `__faultLeft` |

  쓰기 쪽 자리가 있는 class(GN-6h)를 가진 계약에서는 `panic-test`가 B-5c 시험의 poison 진입점도 더한다. 그 진입점은
  인스턴스를 받아 쓰기 guard를 얻고 panic한다.
  Python·Node·PHP·WASM crate는 계약의 alias에 `in_raises`가 있으면 `codec-test`를 갖고, Go crate는 왕복 진입점 때문에
  늘 갖는다. 모든 crate는 계약에 `faults`가 있으면 `fault-test = ["<코어 crate>/fault-test"]`를 갖는다. 코어의 그 feature는
  `fault-test = ["polyspec-binding-core/fault-test"]`이며 장전 자료를 컴파일한다. case는 다른 라이브러리의
  지점(`<library>.<id>`, G-5)을 장전할 수 있다. 그러면 각 바인딩 crate의 그 feature는 그런 라이브러리마다
  `polyspec-<library>/fault-test`도 적고, crate는 코어가 하듯이 그 코어에 의존한다(T-3). Cargo feature는 직접 의존의
  feature만 켜기 때문이며, 계약의 코어가 그것을 적을 필요는 없다. `binding scaffold`는 case 파일의 지점에서 라이브러리를
  읽고, 코어가 의존하지 않는 라이브러리의 지점은 그 이름을 대고 scaffold를 멈추며, `binding check`는 manifest를 그것과
  비교한다(CK-19). 지점(`fault::point!`)은 자기 feature `fault-test`가 켜진 crate에서만 살아 있다. Cargo가 build 전체에서
  binding_core의 feature를 합치기 때문이다. 그래서 이 목록이 빠뜨린 feature는 그 라이브러리의 지점을 꺼 둔 채로 두고, 그
  case는 실패한다. 지점을 가진 코어는 자기 자신을 dev-dependency `<core crate> = { path = ".", features = ["fault-test"] }`로
  두어, flag 없는 코어의 `cargo test`가 그 지점을 장전하게 한다. 모든 저장소가 같은 꼴을 쓴다(CK-65). WASM crate의 시험은
  `fault-test`와 `codec-test`(표가 Node에 적은 `__aliasIn<Alias>`)의 진입점에 wasm-bindgen이 쓰는 모듈로 닿는다. Go 시험은
  build tag `polyspec_fault_test`와 `polyspec_codec_test`가 붙은 `internal/binding`의 함수로 닿는다(GN-13b).

## 코어 경계(T-1, I-2 (1))

- **GN-6** 인자마다 T-1의 Rust 타입을 적은 `let`으로 바꾼다. 두 형태를 가진 타입(text, latin1, bytes, source, path)의
  parameter는 빌려서 넘기고(`&String`과 `&Vec<u8>`는 `&str`과 `&[u8]`로 바뀐다), 그런 타입의 `optional<T>`는
  `as_deref()`로, Copy 타입(bool, 수, enum)은 값으로, 그 밖의 타입(list, record)은 참조로 넘긴다. record는 소유 형태인
  펼친 field로 만든다. 반환은 그 Rust 함수에 보통인 형태이므로(접근자는 빌린 형태, 계산한 값은 소유) 생성 코드는 타입을
  적지 않고 묶어 두 형태를 같은 식(`AsRef`, `Borrow`, `IntoIterator`, tuple field의 참조)으로 읽는다. `none` 반환은 예외이며
  unit으로 묶는다(`let (): () = …`): 그 자리에서 다른 것을 돌려주는 코어는 `Result`를 포함해 컴파일되지 않으므로 그 `Err`가
  버려지지 않고(E-1c), unit 패턴은 lint가 거부하는 쓰지 않는 변수를 남기지 않는다. 정수 반환(uint, int,
  int64)은 더 좁은 Rust 정수여도 되며 생성 코드가 `From`으로 넓힌다(정수와 그 참조에 대한 trait `WideUint`, `WideInt`).
  parameter는 표의 타입 그대로다. Rust 키워드인 계약 이름은 raw identifier(`r#type`)다.
- **GN-6a** 함수가 돌려주거나 parameter의 원소인 record는 언어마다 결과 형태(T-4)를 갖는다: Python은 `<root>._types`의 frozen
  keyword-only `dataclass`, Node는 member의 plain object, PHP는 생성자가 모든 field를 이름으로 받는 public readonly 속성의
  final 클래스. 바인딩은 양방향으로 바꾸며(`in_<record>`, `out_<record>`), 그 자리의 다른 타입 값은 kind
  `invalid_argument_type`이다.
- **GN-6b** class unit(T-5)은 코어 값을 가진 final 언어 클래스다: Python은 native module의 frozen `pyclass`, Node는 JavaScript
  이름으로 내보내는 napi 클래스, PHP는 final 플래그를 단 `php_class`. 메서드와 property는 가진 값을 receiver로 코어 경로를 부르고,
  클래스를 돌려주는 static member나 생성자는 값을 감싼다. `constructible: false`면 생성자가 없다(PHP는 private으로 선언).
  property는 Python과 Node에서 getter, PHP에서 메서드다(I-3). napi-rs는 클래스 메서드를 configurable하지 않게 정의하므로,
  napi-rs는 파싱한 클래스를 macro 프로세스 상태에 두는데 rustc는 struct와 impl의 펼침 사이에 그 상태를 유지하지 않으므로, Node
  생성자는 static `__new`이고 진입점은 `construct`가 인자를 확인하고 그것을 부르는 `Proxy`로 클래스를 내보낸다(`instanceof`는
  proxy를 거쳐 클래스의 prototype을 읽는다). 클래스 parameter는 그 인스턴스를 받고(다른 값은 kind `invalid_argument_type`)
  코어는 가진 값을 빌린다(GN-6h). Node에서는 인스턴스를 그 class의 type tag를 확인하는 `ClassInstance`로 꺼낸다: napi-rs는
  참조 `&T`를 자기가 생성한 인자 변환에서만 주고 호출 본문이 만든 참조를 거부하는데, 생성 함수는 값을 직접 판정하려고
  날 값을 받기 때문이다(T-8). `in` 행이 클래스 자신만 가리키는 origin `value` 클래스(U-1)는
  그런 클래스로 생성하며, `types`에 이름을 둔 값 타입은 그 unit이다.
  인자를 받는 Node 메서드와 static member는 addon의 `__<name>`(열거되지 않고 선언에 없다)이고 진입점이 그 위에 G-7 확인을 하는 `<name>`을 정의한다.
- **GN-6h** class unit의 잠금(U-2 busy, B-5c). class의 자리는 호출이 그 인스턴스를 받는 곳이다: member의 receiver, 또는 타입이
  그 class 자체인 parameter. 쓰기 쪽 자리는 receiver `&mut self`·`self`다. 그 밖의 자리는 모두 읽기 쪽 자리이며, parameter는
  계약이 그 빌림을 적기 전까지 읽기 쪽 자리다. class unit은 다음 중 하나이면 코어 값을 try로만 얻는 잠금에 담는다: (1) 그
  unit의 member에 쓰기 쪽 자리가 있다, (2) 그 class의 값이 언어에서 들어온다(parameter, 그 안의 record field나 list 원소,
  callback의 반환), (3) 그 unit의 member가 언어 코드에 닿는다. 타입이 언어 코드를 담는 것은 callback unit, 함수 타입,
  `host_value`, kind `native`인 `out` 행을 가진 값 alias, 언어 코드를 담는 class일 때이며, record field, `optional`, `list`,
  `tuple`, map 값을 거쳐서도 그렇다. class가 언어 코드를 담는 것은 그 class를 receiver로 받는 member가 언어 코드를 담는
  타입의 parameter를 갖거나, 그 class를 돌려주는 member가 그런 parameter를 갖거나 언어 코드를 담는 다른 class의 receiver를
  가진 member일 때다. 생성기는 두 정의를 함께 만족하는 가장 작은 집합을 계산한다. member가 언어 코드에 닿는 것은 그
  parameter 타입이나 receiver의 class가 언어 코드를 담을 때다. 쓰기 쪽 자리가 없는 class는 `binding_core::Shared`
  (`Arc<tokio::sync::RwLock<_>>`)에 담고 읽기만 하므로 kind `busy`를 내지 않는다. 쓰기 쪽 자리가 있는 class는 receiver가
  `&self`인 그 unit의 member가 기다리거나 언어 코드에 닿을 때, 또는 기다리는 member가 그 class를 parameter로 받을 때
  `binding_core::Shared`에 담고, 그 밖에는 `binding_core::Exclusive`(`Arc<tokio::sync::Mutex<_>>`)에 담는다. `Shared`에 담는
  class의 코어 타입은 `Sync`이며 생성 crate의 상수가 이를 단언한다. 모든 잠금은 `try` 연산으로 얻고 기다리지 않는다. 잠금을
  얻지 못한 호출은 kind `busy`로 실패한다. callback 안에서 같은 객체로 다시 들어온 호출이 자기 자신을 기다리지 않고 실패하게
  하기 위해서다(P-2). 읽기 쪽 자리는 읽기로(`try_read_owned`, mutex는 `try_lock_owned`), 쓰기 쪽 자리는 쓰기로
  (`try_write_owned`, mutex는 `try_lock_owned`) 얻는다. 호출은 코어를 부르기 전에 모든 자리의 잠금을 얻고 결과를 변환할 때까지
  쥔다. 한 호출의 읽기 쪽 자리들이 같은 인스턴스이면 잠금 하나를 함께 쓰고(`Arc::ptr_eq`), 한 호출이 같은 인스턴스를 쓰기
  쪽 자리와 다른 자리에 함께 받으면 kind `busy`로 실패한다. 코어에 같은 값의 `&mut`와 다른 빌림을 함께 줄 수 없기
  때문이다. 코어는 읽기 쪽 자리에 `&*guard`를, 쓰기 쪽 자리에 `&mut *guard`를 받는다. 다른 타입 안의 class 값(list 원소,
  record field, callback의 반환)은 읽어서 복제하고 곧 놓으므로 그런 class는 `Clone`이다. 쓰기 쪽 자리가 있는 class의 잠금은
  `poisoned` 표지를 가진다: 쓰기 쪽 자리의 guard를 쥔 동안 난 panic은 guard를 놓기 전에 표지를 세우고, 그 뒤 그 객체를 어느
  자리로든 받는 모든 호출은 kind `internal`로 실패한다. tokio의 잠금에는 poisoning이 없고 panic이 값을 반쯤 바뀐 상태로 남겼을
  수 있기 때문이다(P-2). 잠금은 `polyspec-binding-core`의 feature `lock`에 있으며 Python·Node·PHP 바인딩 crate의 manifest가
  그것을 켠다.
- **GN-6c** 다른 레포의 record(T-3)는 그 레포의 클래스다: Python은 그 패키지에서 import하고(`pyproject.toml`이 의존으로 적는다),
  PHP는 이름으로 class table에서 찾고(그 확장이 로드되어 있다), Node와 WASM은 plain object를 주고받으며 선언은 field로 적는다. 바인딩
  crate는 코어의 의존 줄 그대로 그 레포의 crate에 의존하고, `binding scaffold`가 그 줄을 옮겨 적는다.
- **GN-6d** callback interface(U-3)는 언어 객체를 갖고 코어 trait를 구현하는 struct다. 그것을 받는 member는
  `Result<T, Failure<E>>`를 돌려주고(E-1c) 코어는 `&mut`(강제 변환으로 `&`도)로 받는다. 객체가 들어올 때 각 member가 호출
  가능해야 한다(kind `invalid_callback`). 호출은 인자를 내보내고(T-1대로 빌린 형태) 결과를 들인다. 언어 코드의 예외나 호출 중
  바인딩의 실패(다른 타입의 결과, Node와 PHP에서 `thread: owner`에 다른 스레드가 한 호출인 kind `wrong_thread`)는 바인딩 표의 handle을 가진
  `Raised`로 코어에 가고, 생성된 호출자가 같은 객체를 다시 던진다. 선언은 `<root>._types`의 Python `typing.Protocol`, Node
  interface, 확장이 등록하는 PHP interface다. 바인딩 crate는 feature `construct`를 켠 `polyspec-binding-core`에 의존한다.
- **GN-6e** `core: {in, out}`을 가진 값 alias(U-7)는 바인딩이 한 단계씩 기술하는 `HostValue`(B-1)로 들어오고, 코어의
  `in` 함수가 `HostValues`를 통해 판정한다. 그 실패는 코어의 kind이거나, 코어가 값을 도는 동안 언어 코드(getter, iterator)가
  던진 예외이며 그대로 다시 던진다. 언어 값이 어떤 `HostValue`인지는 binding의 규칙이다. Python은 정확한 내장 타입을 받고
  (`int`, `float`, `str`, `bytes`의 하위 클래스는 `Other`), Node는 number를 `UntypedNumber`, bigint를 `Int`(`i64` 밖이면 십진
  토큰), string을 UTF-16 단위, Array, Map, plain object(prototype이 `Object.prototype`이나 `null`, 자기 열거 가능한 문자열
  키), Date, 함수로 받고 typed array와 symbol은 `Other`다. PHP는 참조인 원소를 identity를 가진 `PhpReference`로, 배열을
  `array_is_list`와 함께, stdClass와 Closure를 받는다. 코어 값은 코어의 `out` 함수가 주는 `OutValue`로 나가고 alias의 `out`
  행으로, 내장 형식이나 member로 만든다. member는 계약의 생성된 class의 생성자나 static member로, 하나뿐인 parameter가 그
  kind의 내용(bool, int, int64, float, text, bytes)이고 실패하지 않는 것이며, 그 내용으로 그 코어 경로를 부르고 그 값은 그
  class의 instance로 나간다. 다른 member와 다른 레포 alias의 member는 이름을 대고 거부한다(G-4). 형식 `{"keyed_map": {"key": [...]}}`은 map으로 만들고,
  그것이 적은 종류의 각 key는 항목과 같이 행으로 만든다(T-2). Python과 Node에서는 같은 handle이 같은 객체이고, 배열이
  값인 PHP에서는 자기를 만드는 중에 다시 나온 handle이 kind `internal`이다. handle로 들어온 값(`native`, `Other`, callable)은
  스레드 수명 동안 보관하며, 그 한계는 U-7 (d)가 정할 일로 남는다. PHP에서는 그 요청이 끝날 때까지 보관한다: 엔진은
  요청이 끝날 때 그 요청의 값을 해제하므로, 확장은 엔진이 살아 있는 요청 종료(request shutdown)에서 보관한 값을 놓고,
  끝난 요청의 handle은 값을 찾지 못한다(kind `internal`). 요청을 넘겨 보관한 값은 엔진이 사라진 뒤 스레드가 해제하게
  되어 프로세스가 fault로 끝난다.
- **GN-6k** 다른 레포의 값 alias(T-3, U-7 (a'))는 자기 레포의 alias(GN-6e)와 같은 방식으로 주고받는다. 바인딩이 언어 값을
  `HostValue`로 기술해 소유 코어의 `in` 함수를 부르고, 소유 코어의 `out` 함수가 주는 `OutValue`를 alias의 `out` 행으로
  만든다. `out` 행은 소유 레포의 계약에서 읽는다. 소유 코어의 두 함수가 유일한 변환이다(P-1). 변환의 이름은
  `in_<library>_<alias>`와 `out_<library>_<alias>`다. 두 라이브러리의 같은 이름 alias가 겹치지 않게 하기 위해서다. `in`의
  실패는 소유 레포 오류 enum의 변형이다. kind, status, errno는 소유 레포의 것이고(`Kinds`), 클래스는 소유 레포 E-1이 그
  변형에 준 category의 이 레포 클래스다(E-2). 그 클래스는 소유 레포 kinds에 대한 wildcard 없는 match로 고르므로, 소유 계약에
  없는 변형이 있으면 컴파일되지 않는다(I-2 (3)). 소유 코어가 값을 도는 동안 언어 코드가 던진 예외는 그대로 다시 던진다.
  바인딩 crate는 소유 레포의 crate에, Python 패키지는 소유 레포의 패키지에 의존한다(GN-6c). 소유 레포가 제3 라이브러리의
  kind를 그대로 전달하거나(E-1b (a)) 오류 enum 둘을 적은 alias, member로 만드는 `out` 행(GN-6e)은 이름을
  대고 거부한다(G-4). WASM은 GN-18b대로, Go는 GN-15c대로 받는다. 다른 레포 alias의 `in_raises`는 이 레포에 생성할 것을 주지 않는다: 그 alias의 case, kind 단언,
  feature `codec-test`의 진입점(GN-5, GN-13)은 소유 레포의 바인딩에 속하고 거기서 한 번 실행된다. 이 레포의 crate는 자기
  alias가 있을 때만 그 feature를 갖는다.
- **GN-6f** class의 kind `iterate` member(N-4)는 `&self`로 코어를 불러, 빌린 항목이나 `yields: {key, value}`면 빌린 key와
  value의 iterator를 받는다. 바인딩은 순회가 시작될 때 모든 항목을 변환한다(class 값의 snapshot, 값 타입은 값으로, class는
  코어 값의 복사로). Python은 `__iter__`로 항목을 주거나, dict처럼 `__iter__`로 key를, `items()`로 쌍을 준다. Node는 class를
  항목이나 `[key, value]`에 대한 `Symbol.iterator`로 순회 가능하게 한다. PHP는 class를 `IteratorAggregate`로 만들고
  `getIterator`가 항목을 위치 아래에, 또는 값을 key 아래에 확장의 iterator `<namespace>\Internal\Pairs`로 준다. key가
  객체일 수 있기 때문이다. `getIterator`는 그 class를 반환 타입으로 선언하고 확장은 그 class를 먼저 등록한다: PHP는
  반환 타입이 `IteratorAggregate::getIterator`의 반환 타입 `Traversable`이 아닌 `getIterator`를 deprecated로 알린다.
  raises가 있는 iterate와 class의 두 번째 iterate는 이름을 대고 거부한다(G-4).
- **GN-6g** class의 kind `stringify`·`to_json` member(N-4)는 그 언어 hook의 이름을 가진 parameter 없는 메서드이며 `&self`로
  코어를 부른다. text를 돌려주는 stringify는 Python `__str__`, Node `toString`, PHP `__toString`이다. to_json은 Node
  `toJSON`, PHP `jsonSerialize`(그 PHP class는 `\JsonSerializable`을 구현한다), Go `MarshalJSON`(GN-15a)이다. Python에는 JSON hook이 없으므로 그
  member가 없다. PHP 확장은 stringify가 있는 class에 `\Stringable`을 적지 않는다. PHP는 `__toString`이 있는 모든 class에 그
  인터페이스를 주고, 그것을 한 번 더 적은 class를 확장이 로드될 때 거부하기 때문이다. stub은 그 인터페이스를 선언한다. Node의
  hook은 진입 파일의 인자 검사(G-7) 없이 자기 이름을 가진 addon의 메서드다. 언어가 hook을 자기 규약의 인자로 부르기
  때문이며(`JSON.stringify`는 `toJSON`에 key를 넘긴다) 메서드는 그 인자를 읽지 않는다. class의 두 번째 stringify·to_json,
  parameter가 있는 것, text를 돌려주지 않는 stringify는 이름을 대고 거부한다(G-4). `never`를 돌려주는 member(T-1)는
  `Result<Infallible, E>`를 돌려주는 코어를 부른다. 생성 코드는 실패를 돌려주고, 변형이 없는 그 값을 갈래 없는 match로
  받는다. 선언은 PHP와 TypeScript에서 `never`, Python에서 `NoReturn`이며, `raises` 없는 `never` 반환은 이름을 대고
  거부한다. `only`가 있는 member(Q-4)는 그것이 적은 target에만 생성하고, 다른 target의 바인딩·선언·시험에는 없다.
- **GN-6i** 기본값이 있는 parameter와 record parameter의 field(U-2, T-4)는 생략할 수 있다. 그 코어 parameter나 field는
  `Option<T>`이고, 바인딩은 생략된 값에 `None`을 넘기며 어떤 값도 채우지 않는다. 그래서 값은 코어만 정한다(B-1). 빌린
  형태는 text가 `Option<&str>`, latin1·bytes·source가 `Option<&[u8]>`, list가 `Option<&[T]>`, map이 `Option<&Map>`이고 수와
  bool은 값 그대로다. `{literal}`·`{const}` 기본값은 코어가 `None`에 쓰는 코어 상수를 `default_core`에 적는다. 생성된
  crate는 그 상수가 선언된 값과 같음을 컴파일할 때 단언하고(text는 바이트로, float는 비트로), 선언은 그 값을 보인다.
  `{computed}`·`{empty}` 기본값에는 상수가 없다. 선언은 Python에서 `...`, PHP에서 `null`이나 `[]`, TypeScript에서 선택
  parameter를 보이고, `{computed}` 기본값의 규칙 id를 주석에 적는다. `optional` 타입의 기본값은 `{literal: null}`이나
  `{computed}`다. 그 코어 parameter나 field는 두 번째 `Option` 없이 optional 타입 자신의 `Option<T>`이고, 바인딩은
  생략된 값에도 null처럼 `None`을 넘긴다. 둘 다 값이 주어지지 않았다는 뜻이기 때문이다. enum의 `{literal}` 기본값은
  `default_core`에 코어 enum의 상수를 적고, crate는 그 상수가 선언된 값의 variant임을 컴파일할 때 `matches!`로
  단언한다. 값 타입의 `{literal: null}` 기본값은 `None`을 넘기고 상수를 적지 않으므로 crate는 아무것도 단언하지
  않는다. 값이 없다는 것이 무엇인지는 코어가 정한다. 언어마다 "생략"은 다음이다. Python: 호출이 주지
  않은 인자. 그래서 명시한 `None`은 값이며 값으로 판정한다. Node: 빠진 뒤쪽 인자, options record의 빠진 member, 또는
  `undefined`. 그래서 `null`은 값이며 값으로 판정한다. PHP: 호출이 주지 않은 인자 또는 `null`. 이름 있는 인자로 건너뛴
  parameter에 엔진이 `null`을 주고 확장은 둘을 구별할 수 없기 때문이다. 기본값 `{empty: "object"}`가 있는 record
  parameter는 record의 모든 field에 기본값이 있을 때 통째로 생략할 수 있다. 그때 코어는 모든 field가 `None`인 record를
  받는다. Python과 PHP는 field를 keyword와 이름 있는 인자로 받으므로 그때 모두 생략된다. Node와 WASM은 options record를
  빠지거나 `undefined`일 수 있는 뒤쪽 인자로 받고, 선언은 그것을 선택 parameter로 적는다. 이름을 대고 거부하는 것(G-4):
  기본값 없는 field가 있는 record의 `{empty: "object"}` parameter, record parameter의 다른 기본값, `{literal: null}`과 `{computed}`가 아닌 `optional` 타입의 기본값,
  수·bool·text·latin1·bytes·source·list·map·enum·값 타입·`optional`이 아닌 타입의 기본값, `optional`이나 값 타입의
  `{literal: null}`이 아니면서 `default_core` 없는 `{literal}`·`{const}` 기본값, 기본값이 있는 parameter 뒤의 필수 parameter, `rest` parameter,
  결과 형태도 가진 record의 field 기본값. 다만 `optional` 타입의 기본값은 거부하지 않는다. 그런 field의 결과 형태는 그
  optional 타입의 값이므로 코어의 `None`은 언어의 null이다.
- **GN-6j** 타입 `source`의 parameter(T-1, `optional` 안의 것 포함)는 text 또는 바이트를 받아 코어에 `&[u8]`로 가며,
  판정은 코어가 한다. Python은 `str`을 그 UTF-8로, 또는 PyO3가 바이트로 읽는 값을 받는다. Node는 string을 그 UTF-8로,
  또는 `Uint8Array`를 받는다. PHP는 string을 받고 그 바이트를 그대로 넘긴다. PHP string은 그 바이트이기 때문이다. 짝 없는
  surrogate가 든 text는 kind `invalid_text`(B-3)이고 그 밖의 값은 kind `invalid_argument_type`이다. 다른 자리(결과, field,
  원소)의 `source`는 이름을 대고 거부한다(G-4). Node에서 타입 `bytes`는 양방향 모두 `Uint8Array`다(T-7). parameter는
  `Uint8Array`를 받고 string을 포함한 그 밖의 값을 kind `invalid_argument_type`으로 거부하며, 결과는 사본의 새
  `Uint8Array`다.
- **GN-7** member의 코어 경로가 `Result`를 돌려주는지는 `core.result`가 정한다(E-1c). 없으면 `raises`가 이 계약 자신의
  코어 오류 variant를 가리키거나 member가 callback을 받을 때 돌려준다. 생성 코드는 그런 경로를
  `match … { Ok(value) => …, Err(error) => … }`로 부르고 그 밖의 경로는 그것 없이 부르므로, 코어와 맞지 않는
  `core.result`는 컴파일되지 않는다(I-2). `errors.kinds`가 코어 오류를 가리키지 않는 계약의 `core.result: true`는 이름을
  대고 거부한다. 그 오류는 wildcard 없는 match로 kind의 category
  라이브러리 클래스가 되고, kind, status, errno는 `binding_core::Kinds`에서 읽는다(I-2 (3)). 패턴 `Variant { .. }`는
  데이터가 있든 없든 변형에 맞는다. binding은 Rust 소스를 읽지 않기 때문이며, 그에 대한 lint는 이유 I-2로 허용한다.
- **GN-7a** 오류 unit(E-2)은 Python, Node, PHP의 클래스이며 `parent`의 클래스를, parent가 없으면 그 category의 라이브러리
  클래스를 상속한다. parent는 그것을 상속하는 unit보다 먼저 선언하고 등록하며(P-4), `final` unit은 PHP에서 final
  클래스이고, parent의 순환은 이름으로 거부한다. `errors.kinds`의 행이 `class`로 그
  unit을 가리키는 kind는 그 클래스의 인스턴스이고 kind, status, errno는 GN-7과 같다. `source`가 있는 행(E-1b (b))은 이
  레포 코어 오류의 변형이므로 다른 행과 같이 생성한다. unit의 member는 읽기 전용 property다(I-3): `core.path`는
  receiver가 `&self`인 코어 오류의 함수를 가리키고, 생성 코드는 코어가 돌려준 오류로 그 함수를 wildcard 없는 두 번째
  match에서 부른다. property는 Python에서 private 속성 위의 `@property`, Node에서 `kind`·`status`·`errno`와 같은
  인스턴스의 읽기 전용 own property, PHP에서 선언한 클래스의 private property 위의 메서드다. 언어 코드가 직접 만든
  인스턴스에는 값이 없다: Python은 `None`, PHP는 `null`을 준다. property의 타입은 bool, int, int64, uint, float, text,
  bytes이거나 그 optional이다. Node addon은 그 클래스를 category의 여섯 클래스 뒤에 보관하고, PHP 확장은 `kind`,
  `status`, `errno`를 그 클래스가 상속한 category 클래스의 scope에서 읽고 쓴다. 실패하는 case의 생성 시험(B-4)은
  unit의 클래스를 정확한 클래스로 적는다. 행은 case의 kind로 찾으며 kind는 변형의 마지막 마디의 snake_case다(CK-22).
  다른 kind의 member, 다른 타입의 property, 이름이 `kind`·`status`·`errno`·`message`인 property, `library`가 있는
  행(E-1b (a)), 그 행의 category의 오류 unit을 가리키지 않는 `class`는 이름으로 거부한다(G-4). 루트가
  아닌 module의 오류 unit은 PHP에서는 그 module의 namespace에 있는 클래스이고(GN-10), Python에서는 `<root>.<module>`이
  import하는 `<root>._errors`의 클래스이며(GN-11), Node와 WASM에서는 module의 다른 이름과 같이 그 이름으로 entry가
  내보낸다. Go는 오류 unit을 module과 관계없이 패키지 `errors`에 GN-15d대로 생성한다. WASM은 오류 unit을 Node와 같이 생성한다: parent를 상속하는 ES 모듈의 클래스이며
  category의 클래스들 뒤에 모듈에 넘기고, 그 property는 모듈이 인스턴스의 읽기 전용 own property로 정의한다(GN-18).
- **GN-7b** 모든 바인딩 crate는 member가 `raises`에 적은 variant마다 그 member의 코어 경로가 돌려주는 오류 타입에 대한 단언
  `const _: fn(&<error>) -> bool = |error| matches!(error, <variant> { .. });`을 둔다. 그 타입의 variant가 아닌 경로는
  컴파일되지 않는다(E-5, I-2). 한 계약의 모든 member는 E-1의 코어 오류 enum 하나를 돌려주므로, 여러 member가 내는 variant는
  한 번 단언한다. 아직 생성하지 않는 것: 의존 레포의 오류를 담은 variant의 경로
  (`<바깥>/<안쪽 경로>`, E-1b), code enum을 담은 오류 구조체의 투영 함수.
- **GN-8a** 실패 주입(G-5, X-1): `faults`를 가진 계약에서 각 바인딩 crate는 `faults[].core`의 상수마다
  `const _: &str = <core>;`를 두어, 코어에 없는 점이면 컴파일되지 않게 한다(I-2). member의 모든 진입점은(hook과 iterate
  포함) 코어 호출을 `with_faults("<member id>", …)` 안에서, 작업 전체를 `shielded(…)` 안에서 실행한다. feature
  `fault-test`가 켜지면 `with_faults`는 시험이 이 스레드에서 그 member에 장전한 것을 꺼내고
  (`binding_core::fault::take`), 없으면 빈 장전을 꺼내, 코어 호출 동안 설치한다. `shielded`는 작업 동안 빈 장전을
  설치한다. 꺼지면 둘 다 받은 것만 실행한다. 장전은 코어 호출에만 걸린다: 진입점은 `with_faults`보다 먼저 인자를
  변환하고 place의 잠금을 잡는다(GN-6h). 그래서 코어에 닿기 전에 실패한 호출은(거부된 인자, kind `busy`) 장전을 그
  member의 다음 호출에 남긴다. iterate의 코어 호출은 순회 전체이며, 진입점은 그 항목을 `with_faults` 안에서 모은다.
  그래서 receiver나 인자를 만드는 호출은 시험 대상 member의 장전을 가져가지 않고, callback 안에서 다시 들어온
  진입점은 인자 변환을 포함해 바깥 장전을 보지 않는다. `_arm_faults(member, faults)`는 member id와 case `faults`의 JSON
  목록을 받아 장전 id를 준다. 장전되지 않는 목록(대상에 없는 errno 기호 등)은 이유를 담은 kind `internal`이다.
  `_fault_left(id)`는 주입되지 않은 fault의 점 이름을 준다. 대기하는 member는 아직 생성하지 않으므로(GN-1) 장전은
  동기 작업에만 설치된다.
- **GN-8** 모든 진입점은 본문을 `catch_unwind`로 실행한다. panic은 프레임워크의 panic 오류가 아니라 internal category
  클래스의 kind `internal`로 호출자에게 도달한다(B-7).

## 언어

- **GN-9** 이름은 N-2를 따른다. 상수는 PHP, Python, JavaScript에서 UPPER_SNAKE_CASE(PSR-1, PEP 8), Go에서 PascalCase이며,
  두 이름 변환(TypeScript와 `binding_core::naming`)이 시험 벡터를 함께 쓴다.
- **GN-10** PHP: member마다 그 module의 namespace(P-2)에 함수 하나를 두며, parameter는 확장이 판정하는 아무 값(`&Zval`)을
  받는다(T-8). 엔진이 arginfo로 인자를 세고 이름을 확인한다(G-7). arginfo가 타입을 적지 않으므로 stub은 `mixed`를 적고 계약
  타입은 `@param`에 적는다. record field는 parameter 뒤의 이름 있는 parameter다. category 클래스는 module 시작 때
  `ClassBuilder`로 등록하고, 엔진의 class table에서 찾은 E-2 클래스를 상속하며, 클래스 자신의 객체 handler를 유지하므로 오류는
  호출의 file, line, trace를 갖는다. `kind()`, `status()`, `errno()`는 private 속성을 읽는다. enum은 backed enum이다(T-6).
  ext-php-rs의 `php_function`과 `php_module` 펼침이 `Option::map_or`와 `Result::unwrap_or`를 부르므로 함수와 module 진입은
  그 allow 하나를 가진 한 module에 있다. `keyed_map<T>{key}`는 순서대로의 array다(T-2). int key는 정수 key이고, 계약이 정수를
  적지 않고 텍스트를 적으면 그 십진 텍스트다(PHP는 십진 문자열 key를 int로 바꾸기 때문이다). 문자열 key는 UTF-8이고 텍스트가
  적혔으면 텍스트, 아니면 바이트 문자열이 적혔을 때 바이트 문자열이다. 그 밖의 key는 kind `invalid_argument_type`이다. 나가는
  map도 같은 규칙이다: 십진 텍스트나 바이트 문자열 key는 int key가 되고, PHP가 하나로 만드는 두 key(`Int(1)`과 `Text("1")`)를
  가진 map은 항목을 잃지 않고 kind `internal`이다(P-4). int key를 텍스트로 받는 것은 PHP가 십진 문자열 key를 int로 바꾸는
  규칙의 역변환이므로, int key 1로 나간 텍스트 key `"1"`은 텍스트 `"1"`로 다시 들어와 값이 바뀌지 않는다(P-3). `map<T>`는
  텍스트 key에 같은 규칙을 쓰는 순서대로의 array다: 문자열 key는 그 UTF-8 텍스트(다른 바이트는 kind `invalid_text`), int key는
  그 십진 텍스트이고, 십진 텍스트 key는 int key로 나간다.
- **GN-11** Python: native module `<root>._native`는 원시 값을 받고(T-8) record field는 keyword-only다. 런타임이 인자를 세고
  이름을 확인한다(G-7). category 클래스는 `<root>._errors`, enum은 `<root>._types`에 있고 native module이 로드될 때 그것을
  import한다(B-4). 계약의 module은 `<root>.<module>`이고 그 module의 오류 unit을 `<root>._errors`에서 import하며, `<root>`가
  모든 공개 이름을 다시 내보낸다(P-3). enum은
  `enum.StrEnum`이다(T-6). 패키지는 Python 3.14가 필요하다(abi3-py314). list parameter는
  list나 tuple을 받는다. `keyed_map<T>{key}`는 순서대로의 `dict`이며 key는 계약이 적은 종류의 `int`(`bool`이 아닌 것),
  `bytes`, `str`이다. 그 밖의 key는 kind `invalid_argument_type`이고, map은 같은 `dict`로 나간다(T-2). `polyspec`에는
  `__init__.py`가 없다(P-1). `map<T>`는 key가 `str`인 순서대로의 `dict`이며, 그 밖의 key는 kind `invalid_argument_type`이다.
- **GN-12** Node: addon은 원시 값을 받는다(T-8). 생성된 CommonJS 진입점은 인자의 개수, 이름, options record member의 존재를
  확인하고(G-7, T-4), list parameter에서 문자열이 아닌 iterable을 배열로 바꾼다(T-7). 진입점은 로드될 때 라이브러리
  클래스를 addon에 넘기고 addon은 각각의 참조(napi `FunctionRef`)를 갖는다. 실패는 addon이 메시지, kind, status, errno로
  만든 그 클래스의 인스턴스이며 addon이 던진다(B-4). ESM 진입점은 CommonJS 진입점을 다시 내보내므로 둘은 클래스를 함께 쓴다.
  `map<T>`는 key가 문자열인 `Map`이고, `keyed_map<T>{key}`는 key가 계약이 적은 종류의 안전 정수나 문자열인 `Map`이다(T-2):
  진입점이 `Map`의 항목을 addon에 넘기고 addon이 key마다 판정하며(안전 정수가 아닌 number key는 kind `invalid_number`(GN-12a), 그 밖의 key나 값은 kind `invalid_argument_type`), addon이
  돌려준 항목으로 진입점이 `Map`을 만든다. 진입점이 하는 일이므로 그런 map은 parameter나 반환 전체(또는 그 optional)여야 하고,
  다른 타입 안의 것과 `Map`이 정체성으로 비교하는 바이트 문자열 key는 이름으로 거부하므로(G-4) 조용히 빠지는 것이 없다. 계약이
  그것을 요구하면 그때 생성기가 받는다.

- **GN-12a** 모든 target(T-1, CK-64): 바인딩이 인자, list·tuple·map·optional의 항목, record의 field로 받는 `int` 값은
  안전 정수 −(2^53 − 1)~2^53 − 1이고 `uint` 값은 0~2^53 − 1이다. 그 범위 밖의 정수는 Node와 WASM처럼 PHP, Python, Go에서도
  kind `invalid_number`다(B-2). Node와 WASM의 number는 더 큰 정수를 정확히 담지 못한다. 이유: 한 계약은 모든 target에서 같은
  결과를 주어야 하는데, 한 target이 받고 다른 target이 거부하는 정수는 결과를 둘로 만든다. `int64`는 모든 target에서 i64
  범위를 받는다. 계약이 `int` key를 나열한 `keyed_map`의 정수 key도 안전 정수다: 그 범위 밖의 정수 key와, Node·WASM에서
  정수가 아닌 number key는 모든 target에서 kind `invalid_number`다. 전에는 Node와 WASM이 `invalid_argument_type`을 냈다.
  계약이 나열하지 않은 종류의 key는 그대로 kind `invalid_argument_type`이다(T-2). 이유: 거부된 수는 모든 자리에서 B-2의
  kind를 가지므로, 같은 key는 모든 target에서 같은 kind를 준다.
  Node과 WASM: `int64` parameter는 i64 범위의 `bigint`나 안전 정수의 number를 받고, 그 밖의 값은 kind
  `invalid_number`다(B-2). `int64` 결과는 `bigint`여서 i64의 전 범위가 나가며, 선언(들어올 때 `number | bigint`, 나갈 때
  `bigint`)과 같다. case 파일은 안전 정수 밖의 정수를 JSON token으로 주고, `binding`은 그것을 `bigint`로 읽으며 모든 시험은
  그 10진 token으로 쓴다. Node 시험은 `bigint` literal로 쓴다(G-5).
- **GN-6l** class의 메서드는 Python과 PHP 생성 crate에서 Rust 이름 `member_<name>`을 갖고, 언어의 이름은
  attribute(`#[pyo3(name = ...)]`, `#[getter(...)]`, `#[php(name = ...)]`)다. 그래서 member의 이름이 lint가 메서드에
  판정하는 이름 규칙(`self`를 받는 `from_*`, std trait 메서드의 이름)에 걸리지 않는다. hook은 언어가 부르는 이름을
  유지한다(N-4). T-1 scalar의 field는 WASM 변환에 값으로 넘긴다. `Copy` 값의 borrow는 필요 없기 때문이다.
- **GN-6m** `wait: blocking_io`인 member(B-5 (a))는 코어 함수에 receiver 다음 첫 인자로
  `binding_core::Io::for_generated_call()`을 넘기고(I-2 (4)), 언어마다 자기 꼴로 기다린다:
  - PHP는 호출 스레드에서 코어를 부르고, 코어가 돌아올 때까지 그 스레드가 막힌다.
  - Python: `<name>`은 GIL을 쥔 채 인자를 바꾸고 코어 호출을 `py.detach`에서 돌린다. 그래서 코어가 기다리는 동안 다른
    Python 스레드가 돈다. 객체나 module은 `a<name>`도 가진다. 이것은 같은 인자로 `<name>`을 `asyncio.to_thread`에서 돌리는
    awaitable이라서 이벤트 루프를 막지 않는다. 그 인자는 그 스레드에서 `<name>`이 돌 때 판정된다(CK-16이 이 이름을 다른
    member와 예약어에서 떼어 둔다).
  - Node는 `Promise`를 돌려준다. 진입점은 JavaScript 스레드에서 인자를 바꾸고 자리의 잠금과 fault 장전을 가져온 뒤, 코어
    호출을 libuv 풀에서 돌리고(`ScopedTask`의 `Env::spawn`), 결과나 오류를 JavaScript 스레드에서 바꾼다. 호출의 panic은
    kind `internal`로 promise를 거부한다(B-7). member의 JavaScript 진입은 async 함수다. 그래서 인자의 실패를 포함한 모든
    실패가 promise를 거부하고, 호출 자리에서 던져지는 실패는 없다. 선언은 `Promise<T>`를 적고, 생성 시험은 호출을 await한다.
  - Go는 cgo 호출로 작업을 코어에 넘기고 곧바로 돌아오며, 호출 goroutine은 그 작업의 완료 channel에서 기다린다. 코어는
    export한 Go 함수로 그 channel을 채운다. 그래서 기다리는 호출이 OS 스레드를 붙잡지 않는다(B-8). 아직 생성하지 않으며,
    `wait: blocking_io`인 Go member는 이름을 대고 거부한다(G-4).
  - WASM에는 그런 member가 없다. 계약이 그 member에 `wasm`이 없는 `only`를 준다(Q-4, CK-15).
  언어 코드에 닿는 `blocking_io` member는 GN-6q대로 생성한다. 기다리는 constructor·property·iterate·hook(N-4)은 이름을
  대고 거부한다. 언어에 그것을 기다리는 꼴이 없거나, 언어가 hook을 아무것도 기다리지 않는 자기 protocol로 부르기
  때문이다. `process_wait`도 이름을 대고 거부한다(G-4).
- **GN-6n** `wait: async_driver`인 member(I-2 (4))는 토큰을 받지 않는 코어의 `async fn`을 부르고, 생성 코드가 그 future를
  tokio runtime에서 돌린다. 그래야 tokio 위의 코어(redis-rs)가 자기에게 필요한 runtime을 찾는다. 진입점은 GN-6m처럼 호출
  스레드에서 인자를 바꾸고 잠금과 fault 장전을 가져오며, future가 그것을 가진다. future는 바꾼 값과 소유한 guard 위의
  `async move`이므로 `Send + 'static`이다. fault는 poll마다 설치되고(`fault::Armed::around`), poll의 panic은 kind
  `internal`의 실패다(`driver::Caught`, B-7). 언어마다 GN-6m의 꼴로 기다린다:
  - PHP는 future를 binding_core의 runtime에서 `binding_core::driver::block_on`으로 돌리고, 끝날 때까지 호출 스레드가
    막힌다.
  - Python: `<name>`은 `py.detach` 안에서 `binding_core::driver::block_on`을 돌리고, `a<name>`은 GN-6m처럼 `<name>`을
    `asyncio.to_thread`에서 돌린다.
  - Node는 `Promise`를 돌려준다. future는 napi의 tokio runtime에서 돌고(`Env::spawn_future_with_callback`, napi feature
    `tokio_rt`이며 계약에 그런 member가 있으면 binding crate가 켠다), 결과나 오류는 JavaScript 스레드에서 바꾼다.
    JavaScript 진입은 GN-6m처럼 async 함수다.
  - Go는 GN-6m의 완료 channel을 생성할 때까지 그런 member를 이름을 대고 거부한다(G-4).
  - WASM은 Promise 꼴(`wasm-bindgen-futures`)을 생성할 때까지 그런 member를 이름을 대고 거부한다(G-4).
  GN-6m이 기다리는 member를 거부하는 자리에서는 `async_driver`인 member도 이름을 대고 거부하고, 언어 코드에 닿는
  `async_driver` member도 이름을 대고 거부한다. runtime이 자기 스레드에서 poll하는 future는 그 스레드에서 언어 코드를
  부르게 되기 때문이다. 그런 member에는 I/O 없는 state machine을 주는 코어가 필요하고, 그것은 아직 생성하지 않는다(G-4).
  이유: 네트워크 protocol을 쓰는 코어는 async이고, 호출자의 것을 빌리지 않는 future는 runtime의 어느 스레드에서도 돌 수
  있다. 그동안 각 언어의 호출자는 자기 언어의 꼴로 기다린다.
- **GN-6o** 코어 receiver가 `self`인 method는 자기 객체의 코어 값을 소비한다(E-1a, B-5c). 그 receiver는 쓰기 자리이고, 생성
  코드는 class의 잠금(`binding_core::Exclusive`나 `Shared`의 `take`)에서 값을 꺼낸다. 그래서 호출 뒤에는 잠금에 값이 없다.
  코어가 실패해도 그렇다. 호출 때부터 값은 코어의 것이기 때문이다. 그 뒤 그 객체가 receiver나 parameter로 들어가는 모든
  자리는, 어느 인자도 코어에 닿기 전에 category `type`의 kind `consumed`로 실패한다(E-1a). 기다리는 member는 호출
  스레드에서 값을 꺼내 자기 작업이나 future로 옮긴다(GN-6m, GN-6n). G-5는 그런 member마다, 그것을 부른 뒤 같은 객체의
  다른 member를 불러 kind `consumed`로 실패하는지 보는 시험을 생성한다. PHP·Python·Node가 생성하고, Go와 WASM은 wrapper가
  값을 꺼낼 때까지 그런 member를 이름을 대고 거부한다(G-4). 이유: 호출 뒤 코어가 가진 값에는 그 객체로 다시 닿을 수 없고,
  kind가 호출자에게 객체가 왜 거부하는지 알려 준다.
- **GN-6p** `cleanup`이 있는 class unit(B-10)은 코어 receiver가 `self`인 그 unit의 method를 가리킨다(GN-6o). 다른 member는
  이름을 대고 거부한다. binding crate는 그런 unit의 코어 타입이 `binding_core::Cleanup`을 구현하고, 다른 모든 class
  unit의 코어 타입은 구현하지 않는다는 것을 컴파일 때 단언한다(모호한 trait 구현이며, 타입이 그것을 구현하면 컴파일이
  실패한다). 정리 호출이 필요한 자원이 계약에서 빠지지 않게 하기 위해서다. 값이 소비되지 않은 객체가 사라지면 그
  소멸자가 코어 값을 drop하고, 그 `Drop`이 자원을 놓으며, 정리 호출이 없었다는 경고를
  `<Class> was destroyed without <cleanup>(), so its destructor released it (B-10)` 메시지로 낸다:
  - PHP는 객체가 해제될 때 `E_WARNING`을 낸다. PHP는 메시지 앞에 실행 중인 함수의 이름을 붙이므로(`php_error_docref`)
    B-10 시험은 그 메시지로 끝나는 메시지를 요구한다.
  - Python은 객체가 finalize될 때 `ResourceWarning`으로 경고한다. 소멸자는 자기가 도는 동안 던져지고 있는 예외(객체가
    실패한 호출의 임시 값일 수 있다)를 맡아 두었다가 경고 뒤에 다시 설정한다. 예외가 설정된 채 부른 경고 호출은 실패하기
    때문이다.
  - Node는 class가 finalize될 때 `process.emitWarning`으로 type `ResourceWarning`의 경고를 낸다.
  Go와 WASM은 finalizer(`runtime.SetFinalizer`, `FinalizationRegistry`)를 생성할 때까지 그런 unit을 이름을 대고 거부한다
  (G-4). G-5는 그런 unit마다, sample receiver로 객체를 만들고 정리 호출 없이 버린 뒤 경고를 요구하는 B-10 시험을 생성하고,
  PHP와 Python에서는 정리 member를 부르고 객체를 버린 뒤 경고가 없음을 요구하는 시험도 생성한다. PHP는 error handler
  아래에서 객체를 unset하고, Python은 `warnings.catch_warnings(record=True)` 아래에서 지우며, Node는 `gc()`를 켜고
  (`v8.setFlagsFromString('--expose-gc')`와 `vm.runInNewContext('gc')`) 그것을 부른 뒤 process의 `warning` event를
  기다린다. Node에는 경고가 없음을 보는 시험이 없다. event가 없다는 것은 시간 제한으로만 볼 수 있기 때문이다. 소멸자가 읽는
  잠금의 `taken`은 binding_core에서 시험한다. 이유: 호출자가 닫지 않은 자원도 놓이고, 경고는 호출자가 빠뜨린 호출을 알려 준다.
- **GN-6q** parameter의 타입이나 receiver의 class가 언어 코드를 지니면(GN-6h) `wait: blocking_io`인 member는 언어 코드에
  닿는다. 호출 중에 코어가 callback(U-3)을 부르거나 언어 코드 값의 `Native`를 만질 수 있다는 뜻이다. 코어는 호출을 실행하는
  스레드에서 그 코드를 부른다. 그래서 각 언어는 자기 언어 참조를 쓸 수 있는 곳에서 호출을 실행한다. 이것은 `Native` 수명의
  owner 표가 요구하는 것이다(Node와 PHP의 `Native`는 자기 스레드 owner 표의 항목을 가리키고, Python의 `Native`는
  `Py<PyAny>`이다).
  - PHP는 GN-6m대로 호출 스레드에서 코어를 부른다. 그래서 callback과 `Native`는 자기 스레드에서 쓰인다.
  - Python은 `<name>`과 `a<name>`을 GN-6m대로 실행한다. callback의 각 호출은 코어가 그것을 부르는 스레드에서 GIL을 얻고
    (`Python::attach`), `Py<PyAny>`는 어느 스레드에서도 놓인다(PyO3의 reference pool). 그래서 코어는 `py.detach`의
    스레드에서도, `asyncio.to_thread`의 worker 스레드에서도 언어 코드를 부를 수 있다. Python 참조는 스레드가 아니라 GIL에
    묶이므로 `thread: owner`인 Python callback에는 kind `wrong_thread` 검사가 없다. `thread: owner`는 Node, PHP, WASM에서만
    지킨다(GN-6d, GN-18c).
  - Node는 callback 객체와 owner 표의 항목을 가진 JavaScript 스레드에서 호출을 동기로 실행하고, entry는 그 호출의 결과나
    실패로 정해지는 promise를 돌려준다. JavaScript entry는 async function이고 선언은 GN-6m대로 `Promise<T>`를 적는다. 그래서
    member의 언어 꼴은 언어 코드에 닿는지에 따라 달라지지 않는다. 코어가 I/O를 기다리는 동안 JavaScript 스레드도 기다린다.
    각 코어의 spec은 그런 member에 대해 이 비용을 적는다.
  - Go는 `blocking_io`인 member를 이름을 대고 거부하고(GN-6m), WASM에는 그런 member가 없다(GN-6m).
  Node에서 다른 스레드를 쓰지 않는 이유: napi의 callback 객체는 JavaScript 스레드에서만 유효하다. callback 호출마다
  thread-safe function으로 그 스레드에 넘기고 답을 기다리는 pool 스레드는 호출 내내 libuv pool의 스레드 하나를 잡고, JavaScript
  스레드가 그 pool을 기다리면 끝나지 않는다. 호출마다 언어 코드에 닿는지 판단하는 코어(`core.reaches`)가 있으면 닿지 않는
  호출은 pool에서 실행할 수 있다. 그것은 아직 생성하지 않는다. G-5는 그런 member에 대해 Python에서, 예외를 던지는
  callback(K-2)으로 `a<name>`을 `asyncio.run` 안에서 기다리고 callback의 예외를 요구하는 시험을 생성한다. 그래서 코어가
  `asyncio.to_thread`의 worker 스레드에서 부르는 callback이 그 스레드에서 실행됨을 본다.
- **GN-15** Go(E-7, B-8, L-1): `packages/go`가 Go 모듈이다(`packages.go`의 module과 `go 1.27.3`을 적은 `go.mod`). 계약
  module은 패키지 `packages/go/<module>`이고 이름은 마지막 마디를 소문자로 구분자 없이 쓴 것이다. 빈 module은 모듈 루트이며
  패키지 이름은 레포 이름에서 `-`를 뺀 것이다(P-1, `httpcookie`). import 경로의 마지막 마디 `go`는 식별자가 될 수 없으므로
  패키지 이름이 그것과 다르며, Go가 허용하는 형태이고 import alias는 필요 없다. 그
  `zz_generated_<package>.go`는 module의 함수, record(공개 field의 struct), enum(typed string과 값마다 상수
  `<Enum><Variant>`), 상수(typed `const`)를 담는다. 패키지 `errors`는 E-7의 category 타입 여섯을 E-2의 클래스 이름에 N-2의 Go 대문자를 적용해
  (`HTTPCookieValueError`~`HTTPCookieInternalError`) 이름 짓고, 각각 `Error()`, `Kind() string`, `Status() (int, bool)`, `Errno() (int, bool)`, `Unwrap() error`를 가진다. 이 타입은
  cgo 호출과 인코딩을 가진 `internal/binding` 타입의 별칭이므로 생성자가 공개 API가 아니다(L-3). C ABI crate
  `polyspec-<repository>-go`는 추적하는 얇은 package `packages/go/internal/ffi`(crate-type `staticlib`, lib
  `polyspec_<repository>_go`)이고 Go는 `-lpolyspec_<repository>_go`로 링크한다. 라이브러리 디렉터리는 `CGO_LDFLAGS=-L<dir>`로
  준다. Go 모듈은 소스로 받아지며 소비자가 플랫폼의 정적 라이브러리를 받는 방법은 아직 정하지 않았기 때문이다(계획 T-2).
  parameter는 lower camel case이고 Go 예약어, 생성 본문의 이름, 계약 module의 패키지 이름과 같으면 끝에 `_`를 붙인다.
- **GN-15a** Go class unit(T-5, GN-6h): class unit은 그 module 패키지의 struct `<Class>`이며, 내보내지 않은 참조에 C ABI의
  handle을 담는다. C ABI는 코어 값을 그 handle 아래 표에 GN-6h의 lock 뒤로 두고(handle 0은 값이 없으며 kind
  `invalid_argument_type`), Go가 struct를 회수하면 `runtime.AddCleanup`이 `<prefix>__release_<class>`로 놓는다. 생성자는
  `New<Class>`(`constructible`이 false이면 없음), static member는 함수 `<Class><Member>`(CK-13), method와 property는
  호출이 끝날 때까지 receiver를 살려 두는(`runtime.KeepAlive`) `*<Class>`의 method다. iterate는 C ABI가 모은 항목에 대한
  `iter.Seq[T]`나 `iter.Seq2[K, V]`를 돌려주고, stringify는 `String()`이며 `fmt.Stringer`에 오류 결과가 없으므로 코어의
  오류로 panic한다. 다른 module의 member는 class·callback unit에 그 패키지의 함수로 닿는다. 그 함수의 첫 parameter는
  Go module의 패키지만 이름할 수 있는 `internal/binding`의 `binding.Token`이다. `<Class>Handle`은 인스턴스의 handle을
  주고, `<Class>FromHandle`은 handle의 인스턴스를 만들고, `Dispatch<Callback>`은 callback Go 값의 dispatch를 준다.
  패키지는 다른 module이 이름하는 unit에만 그 함수를 두고, CK-13은 그 이름을 센다. 패키지가 서로 import하게 될
  module은 이름으로 거부한다. Go가 import cycle을 거부하기 때문이다.
  to_json은 `json.Marshaler`의 `MarshalJSON`이다. 코어가 준 값을 `encoding/json`으로 marshal하고 코어의 오류를 돌려주므로
  인스턴스의 `json.Marshal`은 코어가 정한 JSON 꼴을 준다. `never`를 돌려주는 to_json은 오류만 돌려준다. `never`를
  돌려주는 member는 `error` 앞에 결과가 없다.
- **GN-15b** Go callback unit(U-3, K-2): callback unit은 결과와 `error`를 돌려주는 method의 Go interface다. C ABI는
  callback을 호출과 Go 값의 handle로 잡고 export `<prefix>__go_callback`으로 되부르며, nil callback은 kind
  `invalid_callback`이다. method가 돌려준 오류는 코어를 멈추고 같은 오류 값으로 호출자에게 돌아온다. 호출은 그 값을 끝날
  때까지 번호로 지닌다.
- **GN-15c** Go 값 alias(U-7, T-3): 값 alias는 다른 레포의 것도 `any`다. C ABI는 export `<prefix>__go_host`에 묻는 방식으로
  Go 값을 읽으므로(종류, 항목, `fmt.Sprint` 순서의 map key) 코어의 `in` 함수가 복사 없이 값을 돈다. `in` 함수의 kind는 그
  category의 오류이며, 다른 레포의 alias는 소유 레포의 E-1을 따른다. 코어 값은 내장 형태인 첫 `out` 행의 Go 값으로
  나간다: `nil`, `bool`, `int64`, `float64`, `string`, `[]byte`, `[]any`, `map[string]any`, `*KeyedMap[any]`.
  member로 값을 만드는 행(GN-6e)은 class의 인스턴스를 준다. C ABI는 계약 안 class의 번호와 값의 handle을 적고, class의
  module 패키지가 그 번호로 인스턴스를 만든다. `internal/binding`은 그 패키지를 import하지 않기 때문이다. 그런 값을
  주는 다른 module의 member는 이름으로 거부한다. 그 class의 패키지만 인스턴스를 만들기 때문이다. `internal/binding`의 `AliasIn<Alias>`(feature `codec-test`)는 이 레포 alias의 `in` 함수만 실행한다.
- **GN-15d** Go 오류 unit(E-2, E-7, I-3): 오류 unit은 parent(parent unit 또는 category 타입)의 포인터를 품은
  `internal/binding`의 struct `<Unit>`이므로 `errors.As`가 `Unwrap`을 따라 parent와 category를 찾는다. 패키지 `errors`는
  그것을 별칭으로 적고, property마다 C ABI가 코어 오류에서 읽은 값을 돌려주는 method가 있다. 행이 그 unit을 적은 kind는
  그 struct로 만든다.
- **GN-15e** Go `source`와 기본값(T-1, U-2, T-4): `source` parameter는 text의 바이트도 담는 `[]byte`이고 그 바이트가 코어로
  간다. 기본값이 있는 parameter나 record field는 포인터 `*T`다: nil이면 빠지고 코어가 값을 정한다. 기본값이 있는
  `optional` 타입은 포인터 `*T` 하나를 그대로 쓴다. nil이 이미 값이 없다는 뜻이기 때문이다(GN-6i).
- **GN-15f** 다른 레포의 Go record(T-3, GN-6c): 다른 레포의 record는 그 레포 Go module(그 계약 `packages.go`의 module) 안, 그 module 패키지의 struct
  `<Record>`이며 패키지는 그 패키지를 패키지 이름으로 import한다. C ABI는 이 레포의 record처럼 field마다
  `in_<library>_<record>`와 `out_<library>_<record>`로 쓰고 읽는다. unit 타입 field가 있는 다른 레포의 record와, 패키지
  이름이 이 레포 패키지의 이름과 같은 record는 이름으로 거부한다. `binding scaffold`는 `binding generate`처럼 계약이
  이름하는 라이브러리마다 그 계약을 읽는다. 코어의 `path` 의존의 계약은 그 경로의 `interface.json`이라 Cargo가 필요
  없고, 다른 의존의 계약은 `cargo metadata`로 찾는다. 계약이 record를 이름하는 라이브러리마다 `go.mod`에
  `require <module> <version>` 줄을 적는다. 코어의 `polyspec-<library>` 의존 줄이 버전 `=X.Y.Z`나 tag `vX.Y.Z`를 적으면
  버전은 `vX.Y.Z`다. `path` 의존은 `v0.0.0`과, 이 레포의 Go module에서 그 레포의 Go module로 가는
  `replace <module> => <path>` 줄을 준다. branch, commit, 버전 범위를 적은 의존 줄에는 Go 버전이 없으므로 이름으로
  거부한다. 그러면 Go 프로그램은 그 레포의 정적 라이브러리도 링크하며, end-to-end 실행은 그것을 이 레포의 것과 같은
  디렉터리에 빌드한다(GN-14).
- **GN-16** Go 타입(T-1, T-2, B-8): bool `bool`, int·int64 `int64`, uint `uint64`, float `float64`, text·latin1 `string`,
  bytes `[]byte`, `list<T>` `[]T`, `map<T>` `*Map[T]`(아래), `optional<T>` `*T`, 다른 타입 안이나 parameter 자리의 tuple은 부분의 Go 타입이 하나이면 `[N]T`, 아니면 `Tuple<N>[T0, T1, ...]`이다. 이것은 field `P0`~`P<N-1>`에 부분을 차례로 담는 `internal/binding`의 generic struct이며, 그것을 쓰는 패키지가 `Map`처럼 별칭으로 선언한다(Go 배열은 원소 타입이 하나다), tuple 반환은 여러 결과.
  Go 문자열은 바이트다: text는 바이트로 넘기고 C ABI가 UTF-8이 아닌 바이트를 kind `invalid_text`로 거부한다(B-3). latin1은
  U+0000~U+00FF의 rune이 바이트마다 하나인 Go 문자열이다(Go는 문자열을 UTF-8로 읽기 때문이다): C ABI는 UTF-8로 받아 U+00FF를
  넘는 rune을 kind `invalid_text`로 거부하고, 바이트는 같은 code point의 rune으로 나간다(B-8, 모든 언어와 같은 규칙). 코어의
  문자열은 UTF-8 바이트로 나간다. 상수가 아닌 enum 값은 kind
  `invalid_argument_type`이다. 코어를 부르는 함수는 마지막에 `error`를 돌려준다(E-7). B-2와 G-7은 Go 타입과 컴파일러가 지키며, GN-12a의 범위만은 예외로 C ABI가 안전 정수 밖의 `int`나 `uint`를 kind `invalid_number`로 거부한다. optional 값은 tag와 값으로 C ABI를 나가며, C ABI는 PHP, Python, Node처럼 그것을 코어 값의 참조의 `Option`(`as_ref`)으로 받는다. 그래서 값의 타입이 코어의 타입이 되고, int나 text 같은 값의 제네릭 출력 변환이 받을 타입이 하나로 정해진다. `Map[T]`는 T-2의 순서 있는 map이며,
  쓰는 패키지가 선언하는 `internal/binding.Map`의 별칭이다. 반복 순서가 무작위인 Go map이 아니다: `Set`은 새 key를 끝에
  두고 있는 key의 자리는 지키며, `Keys`는 순서대로 주고, 0값이나 nil `*Map`은 비어 있다. C ABI는 길이와 순서대로의 항목으로
  넘긴다(같은 key 둘은 kind `internal`, UTF-8이 아닌 key는 `invalid_text`). `keyed_map<T>{key}`는 같은 순서의
  `*KeyedMap[T]`이며 `Key`는 정수, 바이트 문자열, 텍스트 중 하나다(패키지 함수 `IntKey`, `BytesKey`, `TextKey`). 숫자가 같아도
  종류가 다르면 다른 key다. key는 종류와 값으로 C ABI를 넘고, 계약이 적지 않은 종류의 key는 kind `invalid_argument_type`이다.
  `map<T>`와 `keyed_map<T>`는 모든 target에 생성한다(GN-10, GN-11, GN-12, GN-18).
- **GN-17** C ABI(B-8): 함수마다 `polyspec_<repository>_<module>_<member>(args, len, result) -> int32`다. Go는 인자를
  parameter 순서로 버퍼 하나에 인코딩한다: bool과 존재 표지는 0 또는 1의 한 바이트, 수는 little endian 여덟 바이트(int64는
  2의 보수, float64는 IEEE 754 비트), 문자열과 byte slice는 길이(여덟 바이트)와 바이트, list는 길이와 원소, record는 계약
  순서의 field, enum은 값 텍스트. C ABI는 디코딩하며 판정하고(T-8), 인자는 마지막 parameter에서 끝나야 한다. 코어의 결과나
  실패(E-1의 category 번호, 메시지, kind, status, errno)는 같은 방식으로 Rust가 할당한 버퍼에 인코딩해 `result`에 쓰고, Go는
  그것을 `polyspec_<repository>__free`로 해제한다. 반환은 결과면 0, 실패면 1이다. 인코딩을 따르지 않는 버퍼는 kind `internal`이다.
  member가 아닌 심볼(`__free`, `__panic_test`, `__echo_<type>`)은 접두어 뒤에 밑줄이 둘이며, 어떤 member 이름도 그렇지 않다.
  모든 함수는 `catch_unwind` 아래에서 실행하므로 panic이 C ABI를 넘지 않는다(B-7). wait `none` member의 호출은 코어가 돌아올
  때 돌아온다.

- **GN-18** WASM(P-5, B-9): crate `polyspec-<repository>-wasm`은 Node npm 패키지 안의 추적하는 얇은 package
  `packages/ts/wasm`(crate-type `cdylib`, wasm-bindgen 0.2.130, js-sys 0.3.107)이고, `packages/ts/wasm/generated`가 그 소스,
  ES 모듈 `index.mjs`, 선언, 시험을 담는다. 같은 릴리스의 `wasm-bindgen --target web`이 모듈 `<library>_wasm_bg.wasm`과
  glue `<library>_wasm.js`를 그곳에 쓴다. `map<T>`와 `keyed_map<T>`는 `Map`이며 Node의 GN-12 규칙을 따른다. npm manifest는 WASM 진입점을 subpath `./wasm`으로 늘 내보내고, conditions가
  `{node: napi, browser: wasm}`인 entry에서는 그 entry의 조건 `browser`로도 내보낸다. ES 모듈은 import될 때 top-level
  await로 WebAssembly 모듈을 읽으므로(GW-5) 모듈이 준비되기 전에 실행되는 export가 없고 `init()`도 없다: `file:` URL은 `node:fs/promises`로 읽고(Node), 그 밖의 URL은 fetch한다(브라우저). Node 진입점과
  같이 정의한 라이브러리 클래스는 모듈을 읽을 때 넘긴다. 값은 Node의 것이고(T-7, B-2), 짝 없는 surrogate가 든 문자열은 kind
  `invalid_text`이며(B-9, `JsString::is_valid_utf16`), ES 모듈이 인자의 개수와 이름을 검사한다(G-7). `wasm_bindgen` 전개가
  `Option::unwrap_or_default`를 부르므로 export는 그 allow 하나를 가진 모듈 하나에 둔다. `wasm32-unknown-unknown`의 표준
  라이브러리는 `panic=abort`로 빌드되므로 거기서 `catch_unwind`는 panic을 잡지 못하고 panic은 trap이 된다(GW-7): 모든 export는
  패키지가 내보내지 않는 모듈 `state.mjs`를 거쳐 호출하며, 이 모듈은 `WebAssembly.RuntimeError`를 internal 클래스의 kind
  `internal`로 바꾸고 인스턴스를 망가진 상태로 표시한다. 그 뒤 모든 호출은 같은 kind로 실패한다. 모듈을 다시 인스턴스화하지
  않는다. 그전 handle이 가리키던 상태가 사라지기 때문이다. 모듈이 unwind하는 곳에서는 다른 바인딩처럼 `catch_unwind`가 kind
  `internal`을 낸다(B-7). `bytes`는 양방향 모두 `Uint8Array`이고 `source`는 Node와 같이 문자열(그 UTF-8) 또는
  `Uint8Array`를 받는다(GN-6j, T-7). 기본값이 있는 parameter나 field(GN-6i)는 Node와 같이 생략한다: 빠진 뒤쪽 인자, 옵션
  record에 없는 member, 또는 `undefined`이며 모듈은 이를 `None`으로 넘긴다. ES 모듈은 인자 개수를 필수 인자 수부터 전체
  수까지 센다.
- **GN-18a** WASM의 class unit(T-5): ES 모듈이 정의하는 class이며 Node class의 member(GN-6b, GN-6f, GN-6g: 생성자, static
  member, 메서드, getter, `Symbol.iterator`, `toString`, `toJSON`)와 같은 인자 검사(G-7)를 가진다. WebAssembly 모듈은 class마다
  그 인스턴스들의 코어 값을 그 class의 표에 두고, 인스턴스는 자기 값의 handle을 private field에 둔다. 그 field는 다른 코드가
  읽거나 꾸며낼 수 없다: 어떤 값이 그 class의 인스턴스인 것은 그 field를 가질 때뿐이다. 모듈은 member마다
  `__<Class>_<member>`를 export하며 이것은 API가 아니다: `__<Class>_new`는 새 값의 handle을 주고, 메서드, getter, hook은
  인스턴스의 handle을 첫 인자로 받는다. 모듈을 읽을 때 ES 모듈은 class마다 handle로 인스턴스를 만드는 함수(그 class의 값이
  나갈 때 쓴다)와 인스턴스의 handle을 읽는 함수를 넘긴다. 읽는 함수는 다른 값에 `undefined`를 답하고 그 값은 kind
  `invalid_argument_type`이다. 호출은 읽은 값을 공유하므로 코어가 도는 동안 어떤 표도 빌리지 않으며, class parameter는 그 값의
  사본을 코어에 준다(GN-6b). 엔진이 회수한 인스턴스의 값은 `FinalizationRegistry`가 버리고 그 handle은 다시 쓰인다. 인스턴스에
  `free()`가 없으므로 어떤 호출도 놓인 값을 만나지 않는다. 이 class는 wasm-bindgen의 class가 아니다: wasm-bindgen은 Rust가
  `JsValue`에서 값을 꺼낼 때 인스턴스를 포기시키고, `free()` 뒤 그 인스턴스의 호출은 kind 없는 오류로 실패한다(P-2).
  lock이 있는 class(GN-6h)의 값은 표가 그 lock(모든 바인딩 crate가 켜는 feature `lock`의 `binding_core::Exclusive` 또는
  `Shared`)에 담아 두고, 호출의 자리마다 호출 동안 그 guard를 잡는다. 그래서 receiver가 `&mut self`인 member는 값에 쓰고,
  같은 값의 두 번째 자리는 kind `busy`다(B-5c). panic은 trap이 되므로(GW-7) WASM 시험은 lock을 poison하지 않는다.
  `cleanup`(B-10)이 있는 class unit과 receiver가 `self`인 method는 이름을 대고 거부한다(GN-6o, GN-6p).
- **GN-18b** WASM의 `core: {in, out}` 값 alias(U-7), 다른 레포의 것(GN-6k) 포함: 값은 Node와 같이 받고 준다(GN-6e). 모듈은
  JavaScript 값을 Node의 규칙대로 한 단계씩 `HostValue`로 기술한다: number는 `UntypedNumber`, bigint는 `Int`(`i64` 밖이면
  그 십진 token), string은 UTF-16 단위, Array, Map(`Array.from`의 항목), plain object(prototype이 `Object.prototype`이나
  `null`, 키는 `Object.keys`), Date, 함수, symbol, typed array, 그 밖의 객체(constructor 이름과 함께)다. Date와 Map은 전역
  class의 `instanceof`로 찾는다. 코어 값은 alias의 내장 형태 `out` 행으로 나가며, 같은 handle은 같은 객체다. 기술 중 값의
  코드(getter, proxy의 trap, iterator)를 실행할 수 있는 JavaScript 연산은 모두 `catch`로 부른다(`Reflect`와, `catch`로
  import한 `Array.isArray`, `Array.from`, `Object.keys`). 그래서 그 예외는 호출이 그대로 다시 던지는 값이며, 예외는
  WebAssembly 모듈의 frame을 거쳐 unwind하지 않는다. 그렇게 되면 모듈의 stack과 표가 망가진 상태로 남기 때문이다. 실패
  (`Fail`)는 그 예외를 지니고, 코어는 그것을 U-3의 `Raised`로 지닌다. handle로 들어온 값은 인스턴스가 사는 동안 둔다(U-7 (d)).
  `in_raises`가 있는 alias의 in 함수는 feature `codec-test`의 `__aliasIn<Alias>`로 따로 실행한다(GN-5). 생성 시험은
  `fault-test`의 시험이 `__armFaults`를 부르듯 wasm-bindgen이 쓰는 모듈에서 그것을 부르고, alias의 case마다 category의
  class와 kind를 기대한다(U-7).
- **GN-18c** WASM의 callback unit(U-3): GN-6d대로 JavaScript 객체를 지니는 struct이며, 들어올 때 검사하고(member가 함수인
  객체, 아니면 kind `invalid_callback`) 코어 trait을 구현한다. 호출은 member를 `Reflect::get`으로 얻고, 인자를 밖으로
  변환하고, `Function::apply`로 부르고, 결과를 안으로 변환한다. `apply`가 돌려주는 JavaScript 코드의 예외나 모듈의 실패는
  `Raised`로 코어에 가고, callback을 받은 member는(그 코어는 `Failure<E>`를 돌려준다) 같은 객체를 다시 던진다. WebAssembly
  인스턴스는 그것을 읽은 thread에서 돌므로 `thread: owner`인 callback은 늘 그 thread에서 불리며 kind `wrong_thread` 검사가
  없다. 선언은 Node와 같이 interface를 적는다.

## 생성 시험(G-5)

- **GN-13** 함수마다 각 언어의 시험 module은 다음을 확인한다. B-2: 수 parameter와 field마다 G-5의 값(NaN, 무한대, 1.5,
  true, "7", uint에 -1, uint와 int에 2^53, int에 −2^53, GN-12a)이 value 클래스의 kind `invalid_number`이고, 계약이 `int` key를 나열한 `keyed_map` parameter마다 key 2^53이 kind `invalid_number`다(GN-12a). B-3: 짝 없는 surrogate가 든 text(PHP는 UTF-8이
  아닌 바이트)와 U+0100이 든 latin1 text가 kind `invalid_text`다. B-4: 실패하는 모든 contract case가 정확한 클래스(GN-13d), E-2의 기반
  클래스, kind, status, errno를 낸다. B-7: panic 진입점이 kind `internal`이다. G-7: 빠진 인자, 하나 많은 인자, 없는 이름(PHP
  이름 있는 인자, Python keyword, Node options record의 member와 빠진 member). case의 인자는 snake_case 키이고, record
  parameter는 field의 객체, enum은 값 텍스트, latin1 값은 U+0000~U+00FF의 텍스트다. 기본값이 없는 parameter의 키가 없는 case는 id로
  거부한다. JSON으로 적을 수 없는 값: bytes는 `{"hex": "<바이트마다 소문자 hex 두 자리>"}`, `source`는 텍스트 또는 텍스트가
  아닌 바이트일 때 같은 `{"hex": ...}`, 올바른 꼴이 아닌 텍스트는 `{"ill_formed": "<텍스트>"}`로 그 텍스트 뒤에 올바른
  텍스트가 담지 않는 code unit 하나가 온다(텍스트가 code point나 UTF-16인 Python·Node·WASM은 짝 없는 surrogate U+D800,
  텍스트가 바이트인 PHP·Go는 바이트 0xFF), 유한하지 않은 float는 `{"float": "nan" | "inf" | "-inf"}`, 값 타입(`json_value`,
  `php_value`, `template_value`)의 값은 값 표의 kind로 적은 `{"kind": <값 kind>, "value": ...}`다: `null`은 `value`가 없고,
  `bool`, `int`, `float`(수 또는 위 형태), `number`(리터럴 텍스트), `text`, `bytes`(`{"hex": ...}`)는 그 값을, `list`는 그런
  값의 배열을, 또는 JSON reader가 받는 것보다 깊이 중첩된 값이면 `{"kind": "list", "repeat": <n>, "value": <값>}`을
  담는다. 이것은 n개(1 이상)의 list이고, 각 list는 그것을 감싸는 list의 유일한 항목이며 가장 안쪽 list가 그 값을 담고,
  시험은 그것을 loop로 만든다. `map`과 `object`는 순서대로 `[key, value]` 쌍의 배열을(key는 텍스트, keyed map이면 `{"int": n}`이나
  `{"hex": ...}`), `reference`는 `{"id": n, "value": ...}`를 담으며 같은 `id`는 같은 참조다. origin value class가 나타내는
  값 타입(U-1)의 값은 그 kind의 `out` 행이 언어에 대해 적은 static member나 constructor의 호출이다. `value`가 없는 kind는
  parameter 없는 member로, 그 밖의 kind는 parameter 하나인 member로 만들며, 그 member는 case의 `value`를 그 parameter 타입의
  case 값으로 받는다. 그래서 `list`는 그 class의 값들을 담는다. 그런 member로 만드는 행이 없는 kind(parameter 둘인 member,
  내장 형태, 또는 서로 다른 member를 적은 같은 kind의 행 둘)는 적지 않는다. 생성기가 receiver나 인자를 적지 못하는 case는
  그 이유와 case와 member를 대며 실패하는 시험을 갖고, target의 다른 시험은 적는다(G-4, GN-13e). 그 밖에 어떤 시험도 만들 수
  없는 값(factory 없는 class의 placeholder 등)은 이름을 대고 그 target을 거부하며, 생성기는 항목을 대지 않는 예외로 끝나지
  않는다. 타입 `cancel`의 값은 호출 전에 발동한
  취소인 `{"cancel": "fired"}`이거나 발동하지 않는 취소인 `{"cancel": "open"}`이다(CK-22). 이 타입은 아직 생성되지 않으므로
  그것을 받는 member는 이름을 대고 거부한다(G-4). 끝에서 끝까지 확인은 case를 뺀
  실행을 실패로 끝낸다. 계약이 모든 key 종류를 적지 않은 `keyed_map` parameter는 빠진 종류의 key로 kind
  `invalid_argument_type`을 시험하고, case는 keyed map을 그 `[key, value]` 배열로 준다. class의 member도 같은 시험을 가진다. 메서드와 property는 그 클래스의 factory(클래스를 돌려주는 static member나
  생성자)가 case의 factory parameter 키로 만든 인스턴스에서 부르고, 메서드의 B-2, B-3, G-7 시험은 실패하지 않는 그 클래스의 첫
  case의 factory 인자를 쓴다. callback을 받는 member에는 K-2 시험이 있다:
  member가 없는 객체는 kind `invalid_callback`, callback이 던진 예외는 같은 객체로 호출자에게 가고, 다른 타입의 결과는 바인딩
  kind다. 단, callback의 member가 값 alias를 돌려주면 이 시험을 생성하지 않는다. alias의 코어가 모든 값을 판정하므로(B-1)
  거부된 결과의 kind는 alias의 것이기 때문이다. 그 밖의 인자는 목록에 항목이 하나 있는 자리표시 값이다. K-2는 binding 자신의 요구이며 case에 기대지 않는다.
  case는 callback parameter를 fixture로 준다:
  `{"callback": {"<callback member id>": [<행>]}, "calls": [{"member": "<id>", "args": {...}}]}`. 행은
  `{"args": {<snake_case parameter>: <case 값>}}`에 `"result": <case 값>`(member가 none을 돌려주면 없다)과, 호출 하나에만
  답하는 행의 `"once": true`를 더한 것이다. 각 언어의 생성 시험은 binding이 시험 모듈에 쓰는 구현 하나로 fixture를 만들므로
  레포는 fixture 코드를 쓰지 않는다. 호출은 그 member의 남은 행 가운데 인자가 호출의 인자와 같은 첫 행을 쓰고, 어떤 행도
  답하지 않는 호출은 기록되고 `UnexpectedCall`을 던진다. 시험 대상 호출 뒤에 시험은 그 기록이 비었는지 확인하므로 코어가 그
  예외를 삼켜도 시험은 실패하며, case가 `calls`를 적으면 호출이 그 순서의 그것들인지 확인한다. 다른 타입 안(record의 field, list의
  항목, `optional`)의 callback도 같은 fixture로 주고, 함수는 `args`가 parameter의 위치(`"0"`, `"1"`, ...)인
  `{"function": [<행>]}`로 준다. 형식은 `binding check`가 판정한다(CK-22). callback을 받는 member의 B-4 시험은 실패하는 case를 그 fixture로 실행한다.
  stringify와 to_json은 언어가 hook을 실행하는 방식으로 실행한다(GN-6g). stringify는 실패하지 않는 case마다 시험이 있고, 그
  시험에서 인스턴스의 문자열 형태(`str`, `String`, `(string)` 변환)는 case의 `result`이며 PHP에서는 인스턴스가
  `\Stringable`이다. to_json의 B-4 시험은 `JSON.stringify`, `json_encode`, Go에서는 내보내지 않은 `toJSON`을 부른다(Go의 stringify 시험이 `stringify`를 부르는 것과 같다). 둘 다 G-7 시험이 없다. B-5c(GN-6h): 쓰기 쪽 자리가 있는 class마다, 시험은 인스턴스를 만들고 그 인스턴스로 GN-5의
  poison 진입점(쓰기 guard를 쥔 채 panic한다)을 실행한 뒤, 그 호출, 그 인스턴스를 receiver로 받는 member, 그리고 그 class를
  parameter로 받는 member가 있으면 그 인스턴스를 인자로 준 그 member가 각각 kind `internal`인지 확인한다. 쓰기 쪽 receiver를
  가지며 자기 class를 parameter로 받는 member마다, 시험은 그 인스턴스를 그 인자로 넘기고 busy 클래스의 kind `busy`를 확인한 뒤
  그 인스턴스의 member를 부른다. 거부된 호출은 잠금을 쥐고 있지 않으므로 그 호출은 성공한다. 그 member의 코어 함수가
  category 클래스의 kind 하나를 채우는 실패 주입점의 `place`이면, 시험은 거부될 호출보다 먼저 그 member에 그 점을
  장전하고, 이어 그 인스턴스와 다른 인스턴스로 그 member를 불러 그 점이 채우는 kind와 남은 fault가 없음을 요구한다:
  거부된 호출은 장전을 가져가지 않았다(GN-8a). 이 시험들의 인스턴스는 그
  class를 돌려주는 첫 생성자나 static member가 placeholder 인자로 만든다.
  실패하는 case가 `faults`를 가지면(CK-22) 그것을 장전하고 실행한다. 시험은 receiver와 모든 인자를 먼저 지역 값으로
  만들고, 그 member에 fault를 장전하고(`_arm_faults`), 곧바로 member를 부르고, 기대한 실패 뒤에 `_fault_left`가
  비었는지 확인한다. 호출이 닿지 않은 fault가 있으면 시험이 실패한다. case `raises`의 `errno`는 실패의 errno와
  비교한다. 수는 그대로, 기호는 그 언어가 그 기계에서 주는 값(Python `errno.<기호>`, Node
  `os.constants.errno.<기호>`)으로 비교하고, case가 적지 않으면 errno가 없어야 한다. `in_raises`를 가진 값 alias에는
  feature `codec-test`에서 그 `in` 함수만 실행하는 진입점이 있다. alias의 case마다(CK-22) 그 case의 `value`로 그것을
  불러 kind의 category 클래스와 kind를 확인한다. parameter가 그 alias, 그 alias의 optional, 그 alias의 list인
  member마다 시험이 하나 더 있다. alias의 첫 case 값을 그 자리에(parameter로, 또는 list의 한 원소로) 넣고 다른 인자는
  placeholder로 주어, member를 지나 같은 클래스와 kind가 오는지 확인한다. case는 값 타입의 값을 `{"kind", "value"}`로
  주며, kind는 `null`, `bool`, `int`(수, 또는 안전 정수 밖이면 10진 텍스트: Node `bigint`, Python `int`), `float`,
  `text`, `bytes`, `list`, `map`이고 각각 그 kind의 내장 형태가 만드는 값이다.
- **GN-13a** 아직 생성하지 않는 G-5 항목: B-5b, B-6, B-10, B-5c 가운데 기다리는 호출과 겹친 호출의 시험과 callback 안에서
  같은 객체로 다시 들어온 호출의 시험, 생성자나 static member가 만들지 않는 class의 B-5c 시험, GN-13d가 빼는 member의 기본값의 동일성, value unit 행의 왕복, 그리고 callback
  fixture에서 실패를 던지는 행(`raise`), `async` 행, 함수 값, 다른 타입 안의 callback. case가 이것을 주면 이름을 대고
  거부한다(G-4). 실패 주입과 alias kind에서 case가 주면 이름을 대고 거부하는 것: 다른 라이브러리의 점, PHP 시험의
  errno 기호(PHP에는 그 기계의 errno 기호 표가 없다), 언어 종류로 적은 값(`{"host": ...}`, 그 종류의 닫힌 표가 없다),
  GN-13의 kind가 아닌 값 타입의 값. 생성하지 않고 거부하지도 않는 것: 실패하지 않는 `faults` case의 시험(GN-13e의
  시험은 아직 실패를 장전하지 않는다), map·record field·callback 반환 안의 alias를 받는 member의 시험, 릴리스 빌드에 시험
  feature가 없다는 검사(`cargo tree`의 해석된 feature와 설치한 패키지의 export 목록). 이 검사 중 Go 부분은 e2e에
  있다(GN-13b).
- **GN-13d** Python, Node, PHP, WASM은 GN-6i, GN-6j, GN-7a의 형태에 대해 다음도 확인한다. U-2: `{literal}`·`{const}`·`{empty}`
  기본값이 있는 parameter와 field마다, 그것을 뺀 호출과 선언된 값을 준 호출이 같은 결과, 또는 같은 클래스와 kind의 실패를
  낸다. 다른 인자는 그 member의 실패하지 않는 첫 case의 것이거나 자리표시 값이다. 이 시험은 언어가 결과를 값으로 비교하는
  member(class가 아니고 결과가 `none`이 아닌 것)이면서 callback을 받지 않고 hook이 아닌 것에 쓴다. Python과 Node에서 그런
  parameter에 명시한 `None`·`null`은 거부되는 값으로 시험한다. 다만 `optional`과 값 타입은 그것을 값으로 받으므로
  제외한다(GN-6i). T-1: `source` parameter는 text와 그 UTF-8 바이트에 같은 것을
  내고(Python, Node), 짝 없는 surrogate가 든 text는 kind `invalid_text`, 둘 다 아닌 값은 kind `invalid_argument_type`이다.
  T-7: `bytes` parameter는 바이트가 아닌 값을 거부하며 Node에서는 string도 거부한다. B-4: kind가 `class`를 적은 case는 그
  정확한 클래스를 기대하고 category의 클래스로 잡힌다. case는 기본값이 있는 parameter의 키를 뺄 수 있고, 그러면 호출에서도
  뺀다.

- **GN-13e** 모든 target은 실패하지 않고 `faults`가 없으며 hook(N-4)이 아닌 member의 contract case를 하나씩 실행해 그
  결과를 case의 값과 비교한다. Node와 WASM은 `Map`을 순서대로 놓은 항목으로 바꾼 뒤 `assert.deepStrictEqual`로, Python은
  타입과 값으로(`dict`의 항목은 순서대로, NaN은 NaN과 같다), PHP는 객체를 클래스와 property로 바꾼 뒤 `assertSame`으로, Go는
  tuple 반환의 부분마다 `reflect.DeepEqual`로 비교한다. 결과를 담은 case의 키는 그 `cases` 행의 `result`이거나
  `result`다(CK-22). 값은 case가 주는 대로 쓴다. `int64` 결과는 Node `bigint`, tuple은 Python tuple과 Go 배열 또는 Go 함수의
  결과들, `bytes`는 `{"hex": ...}`다. 키가 없는 case는 호출만 실행하며, 실패하면 시험이 실패한다. 결과에 case 형식이 없는
  case(class, 결과 `none`), 값 alias에 그 언어에서 그 kind의 내장 형태를 만드는 out 행이 없는 case, parameter나 receiver
  factory의 인자를 주지 않는 case는 그 이유로 시험이 실패하므로, case는 빠지지 않는다.
- **GN-13f** 메서드의 case는 receiver를 자기 키 가운데 그 class의 factory 인자로 주거나, 키 `receiver` 아래에 앞선
  호출들이 만드는 인스턴스 값으로 준다:
  `{"new": "<member id>", "receiver": <인스턴스 값>, "args": {...}, "then": [{"call": "<member id>", "args": {...}}]}`
  또는 `{"from": "<member id>", "receiver": ..., "args": {...}, "pick": [<단계>], "then": [...]}`. `new`는 그 class를
  돌려주는 member다: 생성자, static member, 함수, 어느 class의 메서드. `from`은 결과가 그 class를 담는 member이고,
  `pick`은 단계로 거기에 닿는다: snake_case field 이름, list의 `{"index": n}`, tuple의 `{"tuple": n}`. `receiver`는
  member가 메서드일 때 주며 그 자체가 인스턴스 값이다. `args`는 member의 parameter를 snake_case 키로 담고, case의 어느
  자리(parameter, list의 항목, record의 field, `optional`)에 있는 class의 값도 인스턴스 값일 수 있다. `then`의 호출은 그 class의 메서드이며 인스턴스에 차례로 부르고 결과는 비교하지
  않는다. `"raises": {"kind": <kind>}`를 가진 호출은 그 member raises의 그 kind로 실패해야 하며, 시험은 다음 단계 전에
  그것을 요구한다. 그래서 실패한 호출 뒤의 인스턴스만 닿는 kind도 case를 가진다. 시험은 그 값이 만드는 모든 인스턴스를, receiver와 pick이 읽는 결과까지 시험의 지역 변수로 만들어 시험이
  끝나기 전에 회수되지 않게 한다. 아무 receiver나 필요한 시험(B-2, B-3, G-7)은 시험 파일의 함수를 불러 그것을 만든다.
  `binding check`는 이를 어기는 값을 지적한다(CK-22).

- **GN-13b** Go: 패키지의 시험은 시험이 인스턴스의 handle을 읽도록 그 패키지 안의 `zz_generated_test.go`이며 `go test`로
  실행한다: `int` parameter마다 2^53과 −2^53, `uint` parameter마다 2^53, `int` key의 `keyed_map` parameter마다 key 2^53이 kind `invalid_number`인 B-2(GN-12a), text parameter·field마다 B-3(바이트 FF), enum parameter·field마다 GN-16의 enum 검사, U-2(기본값이 있는 인자를
  뺀 호출은 기본값을 준 호출과 같다), U-7(member를 거친 alias의 kind), K-2(nil callback, callback의 오류가 호출의 오류다),
  raise하는 contract case마다 B-4(E-2와 E-7의 정확한 타입, 그 category의 `errors.As`, kind, status, errno), raise하지 않는
  case마다 GN-13e, stringify마다 N-4. 실패를 장전하는 case는 build tag `polyspec_fault_test`가 붙은
  `zz_generated_fault_test.go`이며, 장전이 스레드의 것이므로 goroutine을 스레드에 묶는다. B-5c의 poison 시험은 build tag
  `polyspec_panic_test`가 붙은 `zz_generated_held_test.go`다. 끝에서 끝까지 확인은 crate의 시험 feature마다 tag
  `polyspec_<feature>`를 주어 `go test`를 실행한다. B-7은 build tag `polyspec_panic_test`가 붙은 `internal/binding/zz_generated_panic_test.go`이고, 같은 tag가 C ABI의
  panic 진입점도 선언하므로 정적 라이브러리는 그 tag에서만 feature `panic-test`가 필요하다.
  `internal/binding/zz_generated_map_test.go`는 `Map`의 순서와 인코딩이 그 순서를 양쪽으로 지키는지 확인한다.
  latin1 parameter·field마다 U+0100과 바이트 FF가 kind `invalid_text`인지 시험한다. feature `panic-test`와 `codec-test`는 시험
  전용이다: `binding scaffold`가 쓰는 manifest는 어느 것도 기본으로 켜지 않고 `binding check`가 다른 manifest를 거부하며(CK-19),
  끝에서 끝까지 확인은 feature 없이 정적 라이브러리를 빌드해 시험용 진입점(`__panic_test`, `__echo_`, `__arm_faults`,
  `__fault_left`, `__alias_in_`)이 있으면 실패한다. build tag `polyspec_codec_test`와 C ABI
  crate의 feature `codec-test`에서는 시험용 진입점이 latin1 값(계약이 latin1을 받고 줄 때), `map<text>`, 모든 key 종류의
  `keyed_map<text>`(그런 map을 받고 줄 때)를 바인딩의 변환을 거쳐 그대로 돌려준다. `zz_generated_codec_test.go`는
  U+0000~U+00FF, map의 순서, keyed map의 key 순서와 종류가 그대로 돌아오고 U+0100이 거부되는지 확인한다. 이 레포 alias의
  case는 `AliasIn<Alias>`로 그 `in` 함수만 실행한다. 계약이 모든 key 종류를
  적지 않은 `keyed_map` parameter·field는 빠진 종류의 key로 kind `invalid_argument_type`을 시험한다. case의 latin1 값은 그 rune의 Go 문자열이다. case는 `map`을 순서대로의 항목을 가진 객체로,
  `keyed_map`을 GN-13처럼 준다.
- **GN-13c** WASM: `packages/ts/wasm/generated/tests/generated.test.mjs`는 Node의 GN-13 시험을, class member의 시험을
  포함하고 K-2 시험과 case의 callback fixture, alias의 U-7 시험(GN-18b)도 포함해, 설치한 패키지의 subpath `./wasm`에 대해
  `node --test`로 실행한다. B-7 시험은 마지막에 실행한다: panic 진입점을 `state.mjs`를 거쳐 불러 kind
  `internal`을 기대하고, 그 뒤의 호출은 인스턴스가 trap했으면 kind `internal`이고 모듈이 unwind하면 성공해야 한다(GW-7).

## 끝에서 끝까지 확인

- **GN-14** `make e2e REPO=<checkout> WORK=<directory> [BINDING=<commit>] [DEPS="<checkout>..."]`는
  checkout의 Node.js로 commit `BINDING`의 `scripts/e2e.mts`를 실행하며(GN-14b)
  (`tests/e2e/sample`과 `tests/e2e/shapes`는 아직 어느 polyspec 레포도 혼자 생성하지 않는 항목의 레포이며, 뒤의 것은 Python·Node·PHP의 GN-6i, GN-6j, GN-7a 항목과, `source`와 기본값을 받는 receiver `&mut self`의 member(GN-6h)를 갖는다. `tests/e2e/classes`는 모든 종류의 member를 가진 class unit의 레포이며 WASM이 거부하는 unit이 없다(GN-18a). `tests/e2e/consumer`는 sample의 값 alias를 쓰고 property가 있는 오류 unit을 가진 레포이며(GN-6k, GN-7a) `--dep tests/e2e/sample`과 함께 실행한다. `tests/e2e/plot`은 `tests/e2e/points`의 record `point`를 받고 주는 레포이며(GN-6c, GN-15f) `--dep tests/e2e/points`와 함께 실행한다. 레포의 Go 프로그램이 그 Go module을 import하므로 실행은 그 Go 정적 라이브러리를 시험 feature와 함께 레포의 것 옆에 빌드한다(GN-15f); `DEPS`는 contract가 타입을 가리키는 레포마다 그 checkout을 적는다; 그 패키지를 먼저 빌드해 설치한다) 레포의 커밋된 tree를 복사하고, 실행의 binding을 받는 변경을 하며 하나씩 출력하고(GN-14d), `binding check`를 실행하고, 코어를
  생성기 없이 시험하고, case 파일이 case 규약을 따르는지 확인하고(GN-14d), target마다 생성하고, 코어와 각 바인딩 crate를 host에서 lint하고, 각
  패키지를 빌드해(바인딩 crate는 그 매니페스트의 시험 feature로, GN-5) 설치한 뒤, 생성 시험과 `tests/e2e/<library>`에 있으면 contract case를 unittest, `node --test`, PHPUnit으로
  실행하고, target go와 wasm은 `go test`(`gofmt -l`과 `go vet` 뒤)와 subpath `./wasm`을 통한 `node --test --expose-gc`로 실행한다.
  `tests/e2e`의 모든 계약은 다섯 target을 적고(BD-27), 생성기가 그 가운데 하나에 거부하는 target은 그 target의 이름 있는
  실패다(GN-14c). 실행은 계약의 target을 확인하며 target을 더하는 옵션은 없다. 더한 target은 계약에 그것이 없다는 사실을
  감추기 때문이다. binding의 Git 의존은 실행의 명령에 한해 checkout의 커밋으로 풀린다
  (`url.<base>.insteadOf`). Cargo가 사본을 처음 해석하기 전에, 검사는 `Cargo.lock`의 `polyspec-binding-core` 항목에 실행의
  커밋을 적고, 사본에 lock이 없으면 그 항목만 가진 lock을 쓴다. Cargo는 먼저 GitHub에 브랜치의 head를 묻는데 그것은 push된
  커밋이고, `binding scaffold`가 쓰는 manifest는 checkout에만 있는 `binding_core`의 feature를 필요로 할 수 있기 때문이다.
- **GN-14a** 끝에서 끝까지 확인은 계약의 모든 target을 실행한다. 어떤 단계보다 먼저 각 target의 도구를 checkout이 고정하고
  `make install`이 설치한 도구 가운데서 찾는다(AGENTS.md): python은 `mise.toml`의 Python 3.14와 maturin(maturin은 그
  Python의 venv의 Python에 맞춰 wheel을 빌드하고, wheel은 그 지역 디렉터리에서만 venv에 설치한다), node는 `mise.toml`의 npm과
  Node addon의 패키지, wasm은 crate와 같은 릴리스인 `mise.toml`의 wasm-bindgen CLI와 `rust-toolchain.toml`의 Rust target
  `wasm32-unknown-unknown`, php는 `.php-version`의 PHP(기계의 PHP를 그대로 감싸므로 minor를 비교한다)와 `config/phpunit`의
  PHPUnit, go는 `mise.toml`의 Go와 component `llvm-tools`의 `llvm-nm`(BD-10 (d))이다. 확인 자체는 `mise.toml`의 Node.js로
  돌고, 실행의 모든 명령은 checkout의 `rust-toolchain.toml`의 Rust toolchain을 쓴다(`RUSTUP_TOOLCHAIN`). 그렇지 않으면
  rustup은 명령의 디렉터리에서 toolchain 파일을 읽으므로, 사본 안에서 도는 명령은 사본의 toolchain이나 기계의 기본값으로
  빌드한다. 도구가 없으면 확인은 아무것도 복사하기 전에 실패하고 target, 도구, 그것을 고정하는 파일, `make install`을 적는다.
  target을 빼거나 다른 도구로 돌리는 스위치, 옵션, 환경 변수는 없고, target의 생성 시험과 case 시험은 건너뛰지 않는다.
  runner의 설정이 필요한 시험(GN-18a의 collector 등)은 확인이 그 설정을 주며 설정이 없으면 실패한다. 이유: 돌지 않은 target은
  검증되지 않았는데 결과는 통과로 보이고, checkout이 고정하지 않은 도구의 결과는 되풀이할 수 없다. 실행은 target마다 한 일을
  lint와 시험으로 갈라 적고 끝난다. host에서의 crate lint, `php -l`, `gofmt -l`, `go vet`, `llvm-nm`, `tsc`는 코드를 읽을
  뿐 실행하지 않으므로 어느 target도 검증하지 않는다. PHPUnit 실행은 그 JUnit 기록이 시험을 하나 이상 적을 때만 시험으로 세고, `go test`는 `-json`으로 실행해 그 사건에서
  통과·실패·건너뜀 시험을 세며, 시험이 하나도 돌지 않은 target이 있으면 실행은 실패한다. 건너뛴 Go 시험은 이름을 적고 실행을
  실패시킨다. 아무것도 검증하지 않기 때문이다. macOS에서 PHP
  확장은 그 crate의 `build.rs`로 링크되므로(GN-3d) 실행은 링크 설정을 손으로 주지 않는다.
- **GN-14b** 실행은 binding의 commit 하나를 확인한다: `BINDING`, 기본은 `HEAD`. 확인은 그 commit의 tree를 `git archive`로
  `<work>/binding`에 쓰고, 그 tree의 lock으로 생성기의 패키지를 설치하고, 그 tree의 스크립트를 실행한다. 그래서 생성기,
  `binding_core`(각 사본의 lock이 그 commit을 고정한다), `tests/e2e`의 case runner와 스크립트가 한 commit의 것이다. checkout
  안의 레포(`tests/e2e/<library>`)도 그 tree에서 읽는다. 실행은 Git이 무시하는 checkout의 `var/report/e2e/<library>.json`에
  기록을 쓴다: commit, 실행이 증거인지 진단인지와 그 이유, 레포들의 커밋, target마다 돈 것. 실행이 checkout에서 읽는
  파일이 그 commit에 대해 커밋된 것이든 커밋되지 않은 것이든 추적되지 않은 것이든 변경이 없고, 빌드나 runner를 바꾸는 변수(`RUSTFLAGS`,
  `CARGO_TARGET_*`, `CARGO_BUILD_*`, `CARGO_PROFILE_*` 변수, `CGO_*`, `GOFLAGS`, `NODE_OPTIONS`, `PYTHONPATH`, `PHPRC` 등)를 손으로
  주지 않았을 때만 실행은 그 commit의 증거다. 그렇지 않으면 기록은 실행을 진단으로 적고(그 파일의 변경이면 `diagnosis (not a
  commit)`) 이유를 적는다. 이유: 작업 tree의 실행은 어느 commit에도 없는 생성기를 다른 commit의 `binding_core`와 함께
  확인하므로, 그 결과는 push나 merge가 나르는 어느 commit의 것도 아니다.
  실행이 checkout에서 읽는 파일은 닫힌 목록 하나, `scripts/e2e-inputs.mts`의 `READ_FROM_CHECKOUT`이며 파일마다 이유가 있다.

  | 파일 | 실행이 읽는 이유 |
  | --- | --- |
  | `Makefile` | `make e2e`가 그 recipe를 실행하며, recipe가 mise의 환경과 `var/tools`의 `PATH`를 정한다 |
  | `scripts/e2e.mts` | checkout의 스크립트가 commit의 tree를 쓰고 그 tree의 스크립트를 시작한다 |
  | `scripts/e2e-inputs.mts` | checkout의 스크립트가 이 목록을 읽는다 |
  | `mise.toml` | mise가 거기 선언된 `var/tools`의 도구를 실행하고, 실행은 그것을 mise의 전역 설정으로 읽는다 |
  | `mise.lock` | `var/tools`가 가진 `mise.toml` 도구의 digest를 고정한다 |
  | `.mise/locks/npm-npm/12.2.0/package.json`, `.mise/locks/npm-npm/12.2.0/aube-lock.yaml` | mise가 그것으로 `mise.toml`의 npm을 설치하며, 둘째 파일이 그 integrity를 고정한다 |
  | `rust-toolchain.toml` | 그 channel이 모든 명령의 Rust toolchain(`RUSTUP_TOOLCHAIN`)이고, `make install`이 설치하는 component와 target을 적는다 |
  | `.php-version` | 실행이 `var/tools/bin/php`의 minor를 그것과 비교한다 |
  | `config/toolchain.json` | `var/tools`의 mise와 PHPUnit의 릴리스를 고정한다 |
  | `config/phpunit/composer.json`, `config/phpunit/composer.lock` | `var/tools/phpunit`의 PHPUnit을 선언하고 고정한다 |
  | `package.json`, `package-lock.json` | `devEngines`가 npm을 적고, `var/tools`의 도구를 설치하는 `@polyspec/kit`을 선언하고 고정한다 |
  | `.npmrc` | checkout의 패키지를 설치하는 npm을 설정한다 |
  | `.gitignore` | 실행이 이 목록의 추적되지 않은 파일을 `git ls-files --exclude-standard`로 찾으며, 그것이 이 파일을 읽는다 |

  같은 파일의 `NOT_READ`는 실행이 읽지 않는 추적 파일을 이유와 함께 적는다(`.gitattributes`: `git archive`는 commit tree의
  속성을 읽고, `git diff --name-only`는 속성과 관계없이 파일을 적는다). `packages/ts`의 그 목록 시험은 `packages/`, `tests/`,
  `docs/` 밖의 문서가 아닌 추적 파일이 어느 목록에도 없으면 실패하고, 목록의 파일이 추적되지 않아도 실패한다. checkout의
  스크립트는 생성기의 소스를 import하지 않는다: commit tree의 스크립트가 시작 뒤에 그것을 읽는다. 이유: 새 파일이 보이지 않게
  지나갈 수 있는 목록은 어느 실행이 증거인지 말하지 못하고, 목록의 디렉터리는 어느 실행도 읽지 않는 파일까지 비교한다.
  `var/tools`가 가진 도구는 추적 파일이 아니다. 실행은 각 도구를 이 목록의 고정으로 찾으며(GN-14a), 고정은 그대로인데 도구가
  고정과 다르면 이 검사는 그것을 보지 못한다.
- **GN-14c** target마다 자기 파일을 생성하고(`binding generate --target`, GN-1b) 빌드하고 시험을 따로 끝까지 실행한다.
  실패한 단계는 그 target의 원인이 되고, 그 단계가 주는 것을 읽는 그 target의 뒤 단계는 돌지 않으며, 다른 target은 계속한다.
  코어의 lint와 모든 target이 필요로 하는 레포의 단계(사본과 그 변경, 코어 시험, `binding check`, case)는 모든 target을
  실패시킨다. WASM 시험은 Node 단계가 pack하고 설치한 npm 패키지 안에서 돌므로, 그 단계의 실패는 wasm의 원인이기도 하다. 모든
  runner를 센다: `node --test`와 PHPUnit의 JUnit 기록, `go test -json`의 사건, unittest의 요약. 시험이 없거나, 실패했거나,
  건너뛴 시험이 있는 실행은 그 target을 실패시킨다. 실행은 target마다 lint, 수를 단 시험, 실패의 원인을 한 줄에 하나씩 적고
  끝나며, 실패한 target이 있으면 실패한다. 실패한 `binding check`, `scaffold`, `generate`의 원인은 그 finding이나 거부를 하나씩
  이름한다. 이유: 첫 실패에서 멈추는 실행은 다른 target이 통과하는지를 감추고, 그러면 한
  target의 거부가 모든 target의 실패로 읽힌다.
- **GN-14d** 레포의 사본은 실행의 binding을 받는 변경, 곧 레포가 그 binding을 받을 때 스스로 하는 변경만 받고, 실행은 그것을
  하나씩 출력한다: 실행의 `binding scaffold`가 추적 바인딩 package를 쓴다. 그 파일은 그것을 쓰는 binding의 것이기 때문이다(CK-19는
  레포의 파일을 그 lock이 고정한 binding과 비교하며, 그것은 실행의 binding이 아니다). 그리고 `Cargo.lock`의 `polyspec-binding-core`
  항목이 실행의 commit을 적거나 그 항목만 가진 lock을 쓴다. 레포의 lock은 그 레포가 받은 binding을 고정하기 때문이다(GN-14).
  레포의 결함은 사본에서 고치지 않으며 모든 target의 이름 있는 실패다: target의 바인딩 crate를 구성원으로 갖지 않는 루트
  workspace(GN-4; 실행은 `cargo metadata --no-deps`로 구성원을 읽는다); snake_case가 아닌 case 키나 field 객체가 아닌 record 값(G-5),
  group마다 그 키와 값을 한 줄로; `binding_core`에 의존하지 않거나 `Kinds`를 구현하지 않거나(F-2, E-3) binding의 crate를 옛 이름으로
  적는 코어, 이것은 컴파일러가 이름하며 실패한 명령의 원인은 그 stderr 가운데 `error`로 시작하는 줄을 싣는다;
  `<Library><Category>Error`가 아닌 이름의 오류 class, 이것은 `binding check`가 이름한다(CK-10). 그 member의 인자를 그 타입의
  형태로, 또는 그 class의 factory 인자를 주지 않는 raising case는 사본에서 빠지고 출력되며, case를 뺀 실행은 끝에서 실패한다:
  그런 case가 레포의 결함인지 case 규약에 없는 형태(인자로 주는 class 값 등)인지 정해지지 않았으므로, 실행은 그것을 보이지 않게
  버리지도 그 레포의 다른 case를 거부하지도 않는다. 시험 준비는 레포의 파일을 바꾸지 않는다: `tests/e2e/<library>`의 case runner를
  생성 시험 옆에 복사하고(`cases_test.go`는 `packages/go/tests`로), 빌드한 addon에서 플랫폼의 npm 패키지를 묶어 라이브러리의
  패키지와 함께 그 tarball에서 다른 플랫폼의 선택 패키지 없이 설치하며(T-2), runner는 생성 시험이 필요로 하는 설정을 받는다:
  crate마다 시험 feature(GN-5, GN-13b), Go에는 정적 라이브러리 디렉터리를 가진 `CGO_LDFLAGS`, 그 feature의 tag를 가진 `GOFLAGS`,
  `GOTOOLCHAIN=local`, WASM에는 `--expose-gc`(GN-18a), 그리고 case 파일을 적은 `CASES`. `tests/e2e`의 레포는 모든 레포처럼 바인딩
  crate를 workspace의 구성원으로 갖고, 바인딩 package는 추적하지 않으며 그것은 실행의 scaffold가 쓴다. 이유: 레포가 하지 않은
  사본의 변경은 어느 commit에도 없는 레포를 확인하고, 그러면 고쳐 준 결함은 실행에서 통과하고 레포에 남는다.

- **GN-14e** 실행은 레포의 모든 계약을 받는다(L-1): `packages/rust/interface.json`과 각
  `packages/<component>/rust/interface.json`을 경로 순서로 받고, 계약이 없는 레포는 실패한다. 각 계약은 자기 배치(`place`,
  L-2a)에서 scaffold, 검사, 생성, 빌드, 시험을 받고, 실행 기록은 계약의 경로를 적는다. host Node 패키지의 생성 시험은
  옆의 생성 진입점을 import하므로, 실행은 그 시험을 설치된 패키지 안의 사본과 같은 자리에 둔다.