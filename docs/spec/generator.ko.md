<!-- doc-id: generator -->
<!-- source-sha256: 6cf28f93db3a8dabf0993f286f445a92c61dc029879a33edf6fbb4d0a9982337 -->
# 생성기

[English](generator.md)

`binding generate [--root <repository>] [--out <directory>]`는 `packages/rust/interface.json`을 검사하고
(docs/spec/contract-check.md) 그 target의 바인딩을 쓴다. 이 문서는 설계가 생성기에 맡긴 규칙을 적는다. 설계 id는 binding
설계의 것이다.

## 범위

- **GN-1** 생성기는 functions unit, class unit(생성자, static member, receiver `&self`·`&mut self`인 메서드와 property(GN-6h), kind `iterate`·`stringify`·`to_json` member, GN-6f, GN-6g), record(parameter와
  결과 형태, 다른 레포의 것 포함), 값 alias(다른 레포의 것 포함, GN-6k), enum, 상수, 오류 클래스, 오류 unit(GN-7a), variant unit(GN-6v), class가 구현하는 이 계약의 callback interface(GN-6w), member 없는 generated interface(GN-6ap)에 대해, 그리고 Python·Node·PHP·WASM은 parameter의 타입 `source`(GN-6j)와
  parameter와 record field의 기본값(GN-6i)에 대해, receiver가 `self`인 method(GN-6o)와 `cleanup`이 있는 class unit(GN-6p)에 대해, Python·Node·PHP·Go는 언어 코드에 닿는 `blocking_io` member(GN-6q)에 대해 PHP(ext-php-rs 0.16.4), Python(PyO3 0.30.1, abi3-py314),
  Node(napi 3.16.2), Go(C ABI 정적 라이브러리 위의 cgo, GN-15), WASM(wasm-bindgen 0.2.130, GN-18)을 쓴다. public unit과 internal unit을 모두 쓰고(GN-6r), host unit은 아무것도 쓰지 않는다(GN-6ag). callback interface(U-3, receiver를 `core.receiver`에 적은 동기 member)도 쓴다. 그 밖의 항목(비동기
  callback, value unit, `none`, `blocking_io`(GN-6m), `async_driver`(GN-6n)가 아닌 wait, GN-6i가 적지 않은 기본값, abstract class, `native`, 이름 예외, 바깥 variant가 없는 다른 라이브러리의 kind(GN-7c), parameter가 아닌 자리의 타입 `source`, public unit의 internal member)은 그 target의 무엇을 쓰기 전에 이름으로 거부한다(G-4, P-4, GN-1c). Go는 class unit, callback unit, 값 alias(다른 레포의 것 포함), 타입 `source`, 기본값, 오류 unit, 다른 레포의 record를 GN-15a~GN-15f대로 생성하고, 패키지가 서로 import하게 될 module은 거부한다(GN-15a). WASM은 class unit을 GN-18a대로, 값 alias(다른 레포의 것 포함)와 callback unit을 GN-18b와 GN-18c대로 생성한다.
  Go는 variant unit과 interface를 구현하는 class를 GN-6v와 GN-6w대로 생성한다.
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
  명령줄 오류만 상태 2와 함께 찍는다. 계약, case 파일, manifest가 일으킨 실패는 그 문장을 찍고 stack trace를 찍지 않으며, 생성이
  그런 문장으로 실패한 target은 그 항목으로 거부된 target이어서 다른 target을 멈추지 않는다. binding 자신의 결함만 stack
  trace를 찍는다. target 하나를 build하고 시험하는 저장소는 `--target`으로 그 target만 생성하므로, 다른
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
  가리키는 Python, Node, PHP의 `build.rs`; 그래서 생성 전에도 `cargo fmt --all`과 workspace metadata가 된다). Rust 파일은 모두
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
    `native/generated/index.mjs`, `native/generated/index.d.ts`, 그리고 GN-3c의 release 필드 `"type": "module"`, `napi.binaryName`, `napi.targets`를 갖는다. release가
    빌드하고 배포하는 패키지가 host 패키지이기 때문이다. host 코드는 `native/generated/index.mjs`(또는 `index.cjs`)를 상대 경로로 import하고,
    생성 시험도 `native/generated/tests/`에서 그렇게 한다. WASM crate는 `native/wasm/`이고, 그 module, glue, 선언은
    `native/wasm/generated/`이며 host의 `files`가 그것을 적는다(`native/wasm/generated/*.mjs`, `*.js`, `*.d.ts`,
    `*.wasm`). 그 시험은 `native/wasm/generated/index.mjs`를 상대 경로로 import한다.
  - PHP: 확장은 별도 Composer 패키지(type `php-ext`) `<host 패키지>-native`이고 자리는
    `packages/<component>/php/native/`다. `scaffold`가 그 crate와 `composer.json`을 거기에 쓰고 `generated/`도 그 옆이다.
    host 라이브러리 `packages/<component>/php/composer.json`은 `ext-<확장 이름>`(`*`)을 require하며, 확장은 PHP가 로드할 때
    클래스와 함수를 등록한다. host 배치에는 `php-ext/` 디렉터리가 없다. 확장의 `composer.json`은 `scaffold`가 쓰므로 `check`는
    GN-3c의 `php-ext.download-url-method`를 포함해 그 파일 전체를 비교한다.
- **GN-3c** Node addon은 T-2(계획)의 플랫폼마다 npm 패키지 하나에 든다. 이름은 napi-rs 플랫폼 이름 `linux-x64-gnu`,
  `linux-arm64-gnu`, `darwin-arm64`를 붙인 `<npm 패키지>-<platform>`이고, `<scope 없는 npm 이름>.<platform>.node`를 `main`으로
  `os`, `cpu`, `libc`와 함께 갖는다. 라이브러리의 npm 패키지나 host 패키지(L-2a)는
  addon을 갖지 않는다. 플랫폼 패키지는 배포 도구가 빌드해 내고(K-3), 배포 도구는 패키지를 pack할 때 pack하는 manifest의
  `optionalDependencies`에 모든 플랫폼 패키지를 그 release의 버전으로 적어 npm이 그 기계의 것을 설치하게 한다. source manifest와
  workspace의 lock은 그것을 적지 않는다. 한 버전의 플랫폼 패키지는 그 버전의 release가 만들므로, 그것을 적은 lock은 그 release
  전에는 설치할 수 없고, `npm ci`는 lock에 없는 의존을 적은 manifest를 거부한다.
  생성된 진입점은 `<npm 패키지>-<platform>`을 로드하고, 설치되어 있지 않으면 checkout의 빌드가 진입점 옆에 둔 파일
  `<name>.<platform>.node`를 로드한다. 끝에서 끝까지 확인은 그 기계의 플랫폼 패키지를 배포처럼 pack해 두 tarball을 설치하므로, 진입점은
  `optionalDependencies` 없이도 플랫폼 패키지를 찾는다.
  target `node`를 가진 라이브러리에 `scaffold`가 쓰는 `package.json`은 배포의 napi CLI가 읽는 설정을 적는다.
  `napi.binaryName`은 scope 없는 npm 이름이며 진입점이 로드하는 addon 파일의 `<name>`이다. `napi.targets`는 위 순서의
  플랫폼의 Rust triple(`x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `aarch64-apple-darwin`)이다. 이것이 없으면
  배포가 그 패키지를 거부한다(kit K1189). `scaffold`가 쓰는 npm 패키지의 manifest는 모두 `"type": "module"`을 갖는다.
  패키지의 `.js` 파일은 `wasm-bindgen --target web`의 글루뿐이고 그것은 ES 모듈이며, Node 진입점은 확장자가 꼴을 정하는
  `.cjs`와 `.mjs`이기 때문이다. 이 필드가 없으면 Node는 ES 모듈인 `.js` 파일을 `MODULE_TYPELESS_PACKAGE_JSON` 경고와 함께
  읽는다. PHP 확장(type `php-ext`, GN-3b의 `<host package>-native`도)의 `composer.json`은 `php-ext.extension-name`과
  `php-ext.download-url-method` `["pre-packaged-binary"]`를 적는다. 그래서 PIE가 그 기계의 PHP와 플랫폼에 맞는 배포의
  binary를 설치한다(kit K1189). `binding check`는 파일 전체를 비교하듯 이 필드도 비교한다(CK-19).
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
- **GN-3e** `scaffold`가 쓰는 manifest는 다른 polyspec 라이브러리(T-3)를 코어의 `polyspec-<library>` 의존 줄의 꼴대로 적는다.
  manifest가 적는 라이브러리는 생성된 코드가 그 타입을 이름하는 라이브러리다. 곧 계약이 이름하는 라이브러리와, 계약이 다른
  라이브러리의 callback unit을 받을 때 그 unit의 member가 이름하는 라이브러리다. 바인딩이 그 callback을 감싸고 member의 값을
  변환하기 때문이다(GN-6s). 바인딩 crate의 Cargo manifest는 그 각각의 의존 줄을 가지며 코어도 그 줄을 적는다.
  `pyproject.toml`은 그 각각의 Python package를 가진다. `go.mod`는 그 가운데 그 타입들에 record나 값 class가 있는 라이브러리를
  require한다(GN-15f). manifest는 그 생태계의 생성된 코드가 import하거나 로드될 때 필요로 하는 다른 라이브러리의 package도
  적는다. `package.json`은 그 타입들에 값 class가 있는 각 라이브러리의 npm package를 `dependencies`에 적는다. Node addon과
  WASM 모듈의 entry가 그 class를 위해 그 package를 import하기 때문이다(GN-6x). `composer.json`은 그 타입들에 record나 값
  class가 있는 각 라이브러리의 확장 `ext-<extension name>`과 Composer package를 `require`에 적는다. 확장이 그 확장의
  class의 인스턴스를 만들고 읽으며, PHP가 그 확장을 먼저 로드하기 때문이다. 다른 라이브러리의 계약이 다른
  자리에서만 이름하는 라이브러리, 예를 들어 이 계약이 받지 않는 class의 member 타입에만 있는 라이브러리는 어느 manifest에도
  없다. `scaffold`는 라이브러리의 계약을 그것을 이름하는 라이브러리의 코어에서 의존 줄의 `path`로 읽고, 나머지는
  `cargo metadata`로 읽는다. Cargo가 실패하면 계약 자신이 이름하는 라이브러리로 package를 쓰고 상태 1과 GN-15f의 안내로
  실패한다. 그때는 callback unit만이 이름하는 라이브러리를 알 수 없기 때문이다.
  버전 `=X.Y.Z`나 tag `vX.Y.Z`를 적고 branch나 commit을 적지 않은 줄은 release 꼴이며, manifest는 그 버전을 적는다(`go.mod`
  `vX.Y.Z`, GN-15f; `pyproject.toml`은 의존 `polyspec-<library>==X.Y.Z`; `package.json`과 `composer.json`은 package의 버전 `X.Y.Z`). 그 밖의 줄(path, branch, commit, 버전 범위)은 모두 개발 꼴이며, 라이브러리의 release가 나오기 전까지
  레포가 쓴다. manifest는 release의 버전 없이 라이브러리를 적고(`go.mod` `v0.0.0`; `pyproject.toml`은 이름 `polyspec-<library>`만; `package.json`과 `composer.json`은 package와 `*`), 개발
  checkout은 그것을 개발 링크와 개발 설치로 해석한다. 줄의 어떤 꼴도 `scaffold`, `generate`, `check`를 멈추지 않는다. `binding check --release`가 개발 꼴을 하나씩
  보고한다(CK-70). 바인딩 crate의 `polyspec-binding-core` 의존 줄도 같은 방식으로 코어의 그 줄을 따른다. `scaffold`는 코어가
  적은 출처(`git`과 그 `branch`나 `tag`, `version`, 또는 바인딩 crate의 자리까지 올라가는 `path`)를 바인딩 crate에 필요한
  feature와 함께 쓰고, 스스로 무엇도 고정하지 않는다. 그래서 binding의 release tag를 적은 코어는 그 release의 바인딩 crate를
  준다. 다른 라이브러리의 값을 넘겨주기만 하는 코어처럼 코어가 `polyspec-binding-core` 줄을 적지 않은 때에는 `scaffold`가
  생성기 자신의 줄을 쓴다. release의 생성기는 그 버전으로 설치되어 자신의 commit을 알지 못하며(docs/spec/contract-check.md
  CK-20), binding의 Git 저장소를 자기 버전의 tag `vX.Y.Z`로 쓴다. 이것은 release 꼴이다. 개발 생성기는 자신의 commit을
  알며(checkout, `git archive`가 쓴 tree, Git에서의 설치), binding의 Git 저장소를 개발 branch `v1/rust-core`로 쓰고,
  release의 검사가 그것을 바인딩 crate마다 보고한다. 생성된 코드는 그것을 쓰는 생성기의 `binding_core`에 맞추어
  쓰이므로(L-2), 코어가 줄을 적지 않은 때에 맞는 줄은 생성기의 줄 하나뿐이다. Go module이 없는 라이브러리의 record를 이름하는 계약의 Go module처럼 `scaffold`가 쓸 수 없는 추적
  package는 그 이유와 함께 이름한다. `scaffold`는 다른 package를 쓴 뒤 상태 1로 실패하고, `check`는 그것을 CK-19의 finding으로
  보고하며 다른 package를 비교하고, `generate`는 추적 package를 읽지 않는다. 이유: Go module의 버전은 한 target의 한
  manifest의 문제이므로 다른 target을 멈추지 않으며, release가 담으면 안 되는 것은 그 줄을 이름하는 finding이고, 던진 오류는
  그 줄을 이름하지 않았다.
- **GN-3f** `scaffold`가 쓰는 manifest 가운데 licence 항목이 있는 것은 모두 코어 crate의 licence를 담는다. 그것은 코어
  manifest의 `package.license`이며, 코어가 `license.workspace = true`를 적으면 root manifest의 `workspace.package.license`다.
  바인딩 crate의 Cargo manifest는 그것을 `license`로, `pyproject.toml`은 `project.license`로, `package.json`과
  `composer.json`은 `license`로 갖는다. `go.mod`에는 그런 항목이 없다. licence를 적지 않은 코어는 `binding check`의
  finding이며(CK-71), 그때 `scaffold`는 그 항목 없이 manifest를 쓴다. host 패키지(GN-3b)의 손으로 쓴 manifest도 같은 licence를 적으며, `check`는 그것을 host manifest의
  항목으로 읽는다(CK-19). host의 `pyproject.toml`의 `project.license`, host의 `package.json`과 host 라이브러리의
  `composer.json`의 `license`다. 이유: 바인딩 package는 다른 언어로 된 코어이므로 코어의 licence를 갖고, binding이 스스로 적은 licence는 레포가
  고르지 않은 조건을 말하게 된다.
- **GN-3g** 생성된 PHP 확장은 그 `composer.json`의 `php-ext.extension-name`(GN-3c), 곧 `polyspec_<library>`라는 이름으로
  등록된다. 그 module은 `ModuleBuilder::name`으로 자기 이름을 적는다. ext-php-rs 0.16.4의 `#[php_module]`은 module을 crate
  이름 `polyspec-<library>-php-ext`로 이름하기 때문이다. PHP는 module의 이름이 무엇이든 확장의 class와 function을
  등록하므로 바인딩의 시험은 어느 이름에서도 통과한다. 그래서 end-to-end 확인은 시험을 실행하는 PHP 프로세스마다 실행의
  각 `composer.json`의 `extension-name`에 대해 `extension_loaded`가 참인지 묻고, 참이 아니면 그 프로세스는 시험이 실행되기
  전에 그 이름과 함께 실패한다. 이유: PIE와 release 도구는 binary를 로드하고 PHP에 `extension-name`으로 확장을 묻는다.
  그래서 다른 이름의 확장은 설치되고도 로드되지 않았다고 보고된다.
- **GN-4** 바인딩 crate는 레포 workspace의 구성원이고(L-2) 레포의 모든 패키지처럼 `lints.workspace = true`로 lint를
  받는다. 그래서 한 표가 코어와 바인딩의 R-1 lint를 정한다. 그 표는 `unsafe_code`를 forbid가 아니라 deny한다.
  ext-php-rs, napi-rs, PyO3, wasm-bindgen의 macro가 unsafe 코드로 펼쳐지고, 생성 코드의 unsafe 블록마다 이유를 단 allow가
  있기 때문이다. Cargo는 workspace 표를 모든 구성원에 똑같이 적용하므로, 한 crate의 예외는 이유를 단 그 소스의
  attribute(`#![allow(<lint>, reason = "...")]`)다. lint가 죽은 코드를 금하므로 생성 코드는 쓰는 도우미 함수만 갖는다.
  시험 feature(`panic-test`, `fault-test`, `codec-test`)의 진입점만 쓰는 Go C ABI의 도우미는 그 feature에서만
  컴파일된다(`#[cfg(any(feature = ...))]`). 그 feature 없는 정적 라이브러리에는 그런 진입점이 없어서 도우미가 쓰이지 않기
  때문이다.
  도우미를 쓰는 것은 코드가 그 이름으로 그것을 부르거나 넘길 때다. 같은 이름의 method(`map.insert(...)`)는 도우미
  `insert`를 쓰는 것이 아니다. method만 그 이름을 적는 도우미는 죽은 코드이고, crate가 선언하지 않은 타입을 적을 수 있기
  때문이다. 생성기는 쓰임을 Rust 코드의 단어가 아니라 token에서 읽는다. 문자열, 주석, attribute는 도우미를 가리키지
  않는다. field(`name:`), 그 이름의 macro, 다른 path의 연관 항목(`Type::name`), 그리고 둘러싼 함수의 local도 가리키지
  않으며, local은 parameter, `let`, `for`·`if let`·match arm의 pattern, closure의 parameter다. 도우미는 item의
  묶음이며, 모든 괄호 밖의 빈 줄이 묶음을 나눈다. 그래서 본문에 빈 줄이 있는 함수와 method를 가진 `impl` 블록은 각각
  한 묶음이다. 묶음은 코드나 남는 다른 묶음이 그 묶음이 선언한 이름(함수, trait, 타입, static, 상수, macro)을 쓸 때
  남는다. `impl` 블록의 묶음은 그 블록이 속한 타입과 함께 남고, 블록이 코드의 타입에 속하면 그 trait과 함께 남는다.
  묶음의 item이 읽는 Rust 코드 밖에서 이름으로 불리면 그 묶음은 남는다. `pub`이거나, ABI를 갖거나(`extern "C" fn`),
  macro의 attribute를 가진 경우다. 이름을 선언하지 않는 묶음도 남는다.
  생성 Rust는 레포의 `clippy.toml`이 금하는 method를 하나도 부르지 않는다. 그 method는 모두 오류나 부재를 그럴듯한 값으로
  바꾸기 때문이다: `Result::ok`, 그리고 `Result`와 `Option`의 `unwrap_or`, `unwrap_or_default`, `unwrap_or_else`,
  `map_or`, `map_or_else`다. 생성 코드는 값을 match하거나(`match`, `let ... else`) `?`로 오류를 넘긴다. 아무것도 주지
  않거나 고정 값을 주는 arm에는 그것이 맞는 의미인 이유를 적은 주석이 붙는다: 독이 든 lock이나 빌린 table은 가진 것을
  그 스레드의 cleanup까지 지닌다, kind를 읽을 수 없는 예외는 인식된 예외가 아니다, `usize`를 넘는 handle은 어떤 위치도
  가리키지 않는다. 시험 진입점의 개수가 그 언어의 정수에 맞지 않으면 가장 큰 정수가 아니라 오류다. 그런 호출을 allow로
  덮지 않는다. allow는 다음 호출을 숨기기 때문이다. `clippy::disallowed_methods`의 allow는 생성기가 쓰지 않는, 의존성
  macro의 펼침을 담은 module에만 남는다.
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
- **GN-4c** 생성된 crate의 함수 이름: `in_<name>`과 `out_<name>`은 계약의 unit의 변환이고, `<name>`은 unit 이름의
  snake_case다. crate의 다른 함수는 `in_`이나 `out_`으로 시작하는 이름을 갖지 않는다. 다른 레포의 unit의 변환인
  `in_<name>`, `out_<name>`, 그리고 value alias의 `make_<name>`은 crate의 module `library_<library>`의 함수다. 그 module은
  `use super::*;`를 갖고, 모든 module의 코드는 그 함수를 경로 `library_<library>::in_<name>`으로 부른다. 이유: 라이브러리와
  unit을 `_`로 이은 이름은 두 가지로 읽힌다. 그래서 라이브러리 `c`의 unit `a_b`와 라이브러리 `c_a`의 unit `b`가 한 함수
  `in_c_a_b`였고, 자체 unit `c_a_b`가 세 번째였다. `::`는 어떤 이름에도 없으므로 경로는 한 가지로만 읽힌다. module은
  함수처럼 계열을 먼저 적는다. 라이브러리는 어떤 이름이든 가질 수 있고 `std`, `core`, `exports`나 생성된 코드가 쓰는
  crate의 이름도 그렇기 때문이다. 그 이름 그대로의 module은 그 crate를 가리거나, 생성된 코드의 module의 두 번째 정의가
  된다. helper는 방향을 끝에 적는다: 내장 타입의 변환은 `<type>_in`과 `<type>_out`이고(`text_in`, `list_out`),
  default, callable, passthrough의 helper는 `default_in`, `callable_in`, `passed_out`이다. 코어가 보관할 수 있는 GN-6z의
  함수를 만드는 helper는 `kept_function_in`이다. `function_`은 진입의 계열이고 `callable_in`은 machine의 함수(GN-6ae)를
  검사하기 때문이다. 새 helper도 같은 규칙을
  따른다. 이유: unit은 어떤 이름이든 가질 수 있고 `default`, `callable`, `text`, `list`, `scope`도 그렇다. `in_<word>`라는
  이름의 helper는 그 이름의 unit이 있는 계약의 crate에서 두 번 정의되어 컴파일되지 않는다. 계약에서 이름이 오는 모든
  함수에 같은 것이 적용된다: 계약의 이름과 crate의 helper는 같은 이름을 쓰지 않는다. 그런 함수는 자기 계열을 앞에 적고,
  helper는 어느 계열의 접두로도 시작하지 않는다: `in_`과 `out_`(unit), `held_`(parameter 자리의 class), `make_`(값
  alias), `alias_in_`(`codec-test`의 진입), `recognized_<callback>_<member>`, `error_of_<library>`와
  `failure_of_<library>`(다른 library의 오류, U-7), `check_<unit>`(`core_type`이 없는 value class의 검사, GN-6af),
  `alias_round_<unit>`(alias의 왕복 진입, GN-13e), 그리고 functions unit의 함수의 진입인
  `function_`이다. 그 진입에는 attribute가 언어의 이름을 준다(`#[php(name = ...)]`, `#[pyfunction(name = ...)]`,
  `#[napi(js_name = ...)]`, `#[wasm_bindgen(js_name = ...)]`).
  event loop를 받는 함수의 Python 진입(GN-6ae)은 `loop_function_<name>`이다. class의 member는 그 `impl` 블록의
  함수이고, 그 블록에는 helper가 없다. 진입은 자기 module이 아니라 접두를 갖는다. 접두는 진입의 이름만 바꾸고 언어의
  이름은 이미 attribute가 주지만, module은 진입에서 helper로 가는 모든 경로와 각 framework가 진입을 등록하는 형태를
  바꾸기 때문이다. Go crate의 함수나 member의 진입은 GN-17의 C symbol(B-8), 곧 member 앞에 module과 class를 둔 `<prefix>_<member>`이고,
  Go 코드가 그 이름으로 부른다. 그래서 그 계열은 `polyspec_`이며 어떤 helper도 그것으로 시작하지 않는다. Node와 WASM의 함수 parameter의 helper는 PHP와 Python처럼
  `callable_in`이다. 함수는 어떤 이름이든 가질 수 있고 `guard`, `pass`, `called`, `throw`, `in`도 그렇다. 이름 그대로의
  진입은 Node crate에서는 helper의 두 번째 정의이고, WASM crate에서는 export의 module 안에서 helper를 가린다. WASM crate에는
  class의 `impl` 블록이 없어서, class의 member의 진입은 그 module 안의 module `class_<unit>`의 함수
  `member_<member>`다. 그 module은 `use super::*;`를 갖는다. class의 해제는 export의 module의 함수 `free_<unit>`이고, 그
  export는 `__free_<Class>`다. 이유: class와 member를 `_`로 이은 이름은 두 가지로 읽힌다. 그래서 class `a`의 member
  `new_x`와 class `a_new`의 member `x`가 한 함수 `class_a_new_x`였고, member `free`는 해제 `class_<unit>_free`와 그 export
  `__<Class>_free`였다. 밑줄 둘의 구분자는 snake_case 이름이 아니어서 lint가 거부한다. member는 자기 class의 module
  안에서도 접두어를 유지한다. `guard`처럼 helper와 같은 이름의 member가 그 안에서 helper를 가리기 때문이다. class의
  이름은 대문자로 시작하므로 어떤 member의 export도 `__free_<Class>`가 아니다. 다섯 crate가 이 규칙을 적용한다. Go crate의
  class의 member의 C 심볼은 class와 member 사이에 밑줄이 둘인 `<prefix>_<unit>__<member>`이고, package `binding`의 그
  함수는 CamelCase의 두 이름 사이에 밑줄이 하나인 `<Unit>_<Member>`다. module의 segment는 심볼에서는 밑줄 셋으로,
  package `binding`의 함수에서는 밑줄 둘로 끝난다(GN-17). 이유: 심볼 `<prefix>_<unit>_<member>`와 함수
  `<Unit><Member>`는 두 가지로 읽힌다. 그래서 위의 두 class가 한 심볼 `<prefix>_tag_new_x`와 한 함수 `TagNewX`를
  주었고, module `tag`의 함수 `x`가 class `tag`의 member `x`의 심볼을 주었다. snake_case 이름에는 빈 단어가 없어서
  밑줄 둘이 이어지지 않고 CamelCase 이름에는 밑줄이 없으므로, 각 구분자는 한 가지로만 읽힌다. module의 함수와 root의
  class의 member는 둘 다 이름이 둘이므로, module의 구분자는 class의 구분자와 다르다. 심볼은 C ABI의 `#[no_mangle]`
  함수이고, lint `non_snake_case`는 그것을 읽지 않는다. class의 해제는 심볼 `<prefix>__release_<class>`와 package
  `binding`의 함수 `Release<Class>`이고, 둘 다 class만 이름한다. module의 단어를 class의 단어 앞에 두면 module `tag`의
  class `k`와 root의 class `tag_k`가 한 함수 `ReleaseTagK`를 가졌다.
- **GN-5** 모든 crate는 `rust-version = "1.99.0"`과 B-7 시험의 진입점을 더하는 feature `panic-test`를 갖는다. 바인딩
  crate의 시험 feature는 이 표의 것뿐이다. 각 feature는 아래 이름의 진입점을 더하고, `binding scaffold`가 쓰는
  매니페스트는 어느 것도 기본으로 켜지 않으며, 릴리스 빌드에는 어느 것도 없다(G-5). `<Alias>`와 `<alias>`는 그 alias
  이름을 언어의 클래스 형태와 snake_case로 쓴 것이다.

  | feature | 용도 | Python | Node | PHP | Go C 기호 |
  |---|---|---|---|---|---|
  | `panic-test` | B-7, B-5c의 poison(GN-6h), PHP 시험의 errno 기호 값(GN-8a) | `_panic_test`, `_panic_test_held` | `__panicTest`, `__panicTestHeld` | `<namespace>\Internal\panicTest`, `panicTestHeld`, `errnoOf` | `<prefix>__panic_test`, `<prefix>__panic_test_held` |
  | `codec-test` | Go 값 변환의 왕복(GN-13b), 값 alias의 `in` 함수만 실행(U-7), 그 `in` 함수 다음에 `out` 함수 실행(GN-13e), 수 parameter 자리의 다른 타입 Go 값(GN-13g) | `_alias_in_<alias>`, `_alias_round_<alias>` | `__aliasIn<Alias>`, `__aliasRound<Alias>` | `<namespace>\Internal\aliasIn<Alias>`, `<namespace>\Internal\aliasRound<Alias>` | `<prefix>__echo_<type>`, `<prefix>__alias_in_<alias>`, `<prefix>__number_in`. WASM은 `__aliasIn<Alias>`, `__aliasRound<Alias>` |
  | `fault-test` | 실패 주입(GN-8a) | `_arm_faults`, `_fault_left` | `__armFaults`, `__faultLeft` | `<namespace>\Internal\armFaults`, `faultLeft` | `<prefix>__arm_faults`, `<prefix>__fault_left`. WASM은 `__armFaults`, `__faultLeft` |
  | `case-test` | 인자가 그 언어에서 꼴을 갖지 않는 case(GN-13) | 아직 없음 | 아직 없음 | `<namespace>\Internal\caseTest<n>` | 아직 없음. WASM도 아직 없음 |
  | `thread-test` | 다른 스레드에서 부른 함수의 kind `wrong_thread`(GN-6z) | — | `__threadTest` | `<namespace>\Internal\threadTest` | — |
  | `native-count-test` | owner 표가 가진 언어 객체의 수(GN-6u) | — | `__nativeCount` | `<namespace>\Internal\nativeCount` | `<prefix>__native_count`. WASM은 `__nativeCount` |
  | `thrown-count-test` | 던져진 것을 보관하는 table의 항목 수(GN-6ae). member가 callback이나 함수 타입을 받거나 값 alias가 있는 계약의 crate에 있다 | `_thrown_count` | `__thrownCount` | `<namespace>\Internal\thrownCount` | `<prefix>__thrown_count`. WASM은 `__thrownCount` |

  쓰기 쪽 자리가 있는 class(GN-6h)를 가진 계약에서는 `panic-test`가 B-5c 시험의 poison 진입점도 더한다. 그 진입점은
  인스턴스를 받아 쓰기 guard를 얻고 panic한다. 이 진입점들은 일부러 panic하므로, 각각 B-7을 이유로 적은
  `#[allow(clippy::panic)]`를 갖는다. `clippy::panic`을 deny하는 레포는 다른 모든 항목에 그 deny를 유지하며, 다른 생성
  항목은 panic하지 않는다.
  시험 feature의 진입점만 쓰는 import, helper, 타입은 그 feature 아래에서 생성된다(`use` 줄이나 그 항목의
  `#[cfg(feature = "<feature>")]`). feature 없는 빌드는 그 진입점을 컴파일하지 않으므로, 그 항목은 거기서 쓰이지
  않고, lint가 쓰이지 않는 import와 죽은 코드를 deny하기 때문이다(GN-4).
  진입점은 target이 생성자나 그 class를 돌려주는 static member로 만드는 class의
  인스턴스를 받는다. target이 만들 수 없는 class의 시험에는 줄 인스턴스가 없고, Go 진입점이 그런 class의 인스턴스 표를
  `panic-test`에서만 읽으면 그 feature가 없을 때 읽는 함수가 쓰이지 않기 때문이다.
  Python·Node·PHP·WASM crate는 계약의 alias에 `in_raises`가 있으면 `codec-test`를 갖고, Go crate는 왕복 진입점 때문에
  늘 갖는다. Node·PHP crate는 member가 함수 타입을 받으면 `thread-test`를 갖는다. 그 target은 함수를 owner 스레드에 두기
  때문이며, 그 진입점은 함수를 다른 스레드에서 불러 실패의 kind를 준다. 모든 crate는 계약에 `faults`가 있으면 `fault-test = ["<코어 crate>/fault-test"]`를 갖는다. 코어의 그 feature는
  `fault-test = ["polyspec-binding-core/fault-test"]`이며 장전 자료를 컴파일한다. case는 다른 라이브러리의
  지점(`<library>.<id>`, G-5)을 장전할 수 있다. 그러면 각 바인딩 crate의 그 feature는 그런 라이브러리마다
  `polyspec-<library>/fault-test`도 적고, crate는 코어가 하듯이 그 코어에 의존한다(T-3). Cargo feature는 직접 의존의
  feature만 켜기 때문이며, 계약의 코어가 그것을 적을 필요는 없다. `binding scaffold`는 case 파일의 지점에서 라이브러리를
  읽고, 코어가 의존하지 않는 라이브러리의 지점은 그 이름을 대고 scaffold를 멈추며, `binding check`는 manifest를 그것과
  비교한다(CK-19). 지점(`fault::point!`)은 자기 feature `fault-test`가 켜진 crate에서만 살아 있다. Cargo가 build 전체에서
  binding_core의 feature를 합치기 때문이다. 그래서 이 목록이 빠뜨린 feature는 그 라이브러리의 지점을 꺼 둔 채로 두고, 그
  case는 실패한다. 그런 지점은 다섯 target 모두에서 member의 장전(GN-8a)으로 장전한다. 바인딩 crate는 계약의 코어와 그
  라이브러리의 코어를 하나의 `binding_core`와 함께 링크하므로, 이 crate의 `fault-test` 진입점(`_arm_faults`와 위 표의
  이름)이 이 계약의 member에 대해 그 지점을 장전하고, member의 진입점이 그 장전을 설치하며, 이 계약의 코어가 그
  라이브러리의 코어를 부르는 곳에서 지점이 그것을 읽는다. 그 라이브러리의 바인딩 package는 여기에 쓰지 않는다. 그 crate는
  자기 `binding_core`를 링크하고, 이 crate 안의 코어는 그 장전을 읽지 않기 때문이다. 호출이 닿지 않은 지점은
  `_fault_left`에 남아 시험을 실패시키고(GN-13), `binding check`는 그 이름을 그 라이브러리의 계약과 비교한다(CK-22).
  아직 생성하지 않고 이름을 대고 거부하는 것(G-4): 자기 `faults`가 없는 계약에서 다른 라이브러리의 지점을 장전하는
  case. GN-8a의 항목은 `faults`가 있는 계약에만 쓰기 때문이다. 지점을 가진 코어는 자기 자신을 dev-dependency `<core crate> = { path = ".", features = ["fault-test"] }`로
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
  int64)은 더 좁은 Rust 정수여도 되며 생성 코드가 `From`으로 넓힌다(정수와 그 참조에 대한 trait `WideUint`, `WideInt`.
  `usize`와 `isize`는 GN-6ac대로 넓힌다). parameter는 표의 타입으로 바꾼 뒤 코어 자신의 타입으로 바꾼다(GN-6ac). Rust 키워드인 계약 이름은 raw identifier(`r#type`)다.
- **GN-6a** 함수가 돌려주거나 parameter의 원소인 record는 언어마다 결과 형태(T-4)를 갖는다: Python은 `<root>._types`의 frozen
  keyword-only `dataclass`, Node는 member의 plain object, PHP는 생성자가 모든 field를 이름으로 받는 public readonly 속성의
  final 클래스. 바인딩은 양방향으로 바꾸며(`in_<record>`, `out_<record>`), 그 자리의 다른 타입 값은 kind
  `invalid_argument_type`이다.
- **GN-6t** tuple(T-1)은 정확히 그 부분들로 된 열로 들어오고, 각 부분은 그 타입대로 바뀌므로 코어는 부분들의 Rust tuple을
  받는다: Python은 `tuple`, Node와 WASM은 `Array`, PHP는 list(키가 0부터 n-1까지 차례인 배열)를 받는다. 다른 타입의 값이나
  항목 수가 다른 열은 kind `invalid_argument_type`이다. tuple은 입력의 모든 자리에서 받는다: parameter, list의 항목, record
  parameter의 field, `optional`의 안. 코어는 tuple parameter를 참조로 받는다(T-1). Go는 GN-16대로 tuple을 받는다.
  이유: tuple은 각 언어에서 그 열로 나가므로, 한 호출이 돌려준 값이 그대로 다른 호출에 들어간다.
- **GN-6ac** 값은 코어 자신의 Rust 타입으로 코어에 들어가고 그 타입에서 나오며, 계약은 그 타입을 적지 않는다(T-1).
  parameter, field, 항목, tuple 부분의 정수는 먼저 표의 타입(`uint`는 u64, `int`와 `int64`는 i64)으로 바뀐 뒤 생성 crate의
  trait `IntoCore<T>`를 거쳐 코어에 주어지고, 값을 받는 자리(코어 호출이나 struct literal의 field)가 `T`를 정한다.
  `IntoCore`는 정수를 `TryFrom`으로 코어가 받는 정수(`uint`는 u8, u16, u32, usize, `int`는 i8, i16, i32, isize)로 좁히고,
  list와 optional은 항목마다 받으며, tuple은 부분들의 Rust tuple로, 부분의 타입이 하나이면 배열(`[T; n]`)로 받는다. 코어
  타입의 범위 밖의 값은 인자의 이름을 subject로 하는 kind `invalid_number`다(B-2). 그래서 `usize`가 32비트인 wasm32에서는
  모든 target에서 코어 `u32`에 대해 그렇듯 2^32를 거부한다. 코어에서 나오는 tuple은 `partsN`(trait `Parts1`부터 `Parts8`)으로
  읽으며, 이것은 Rust tuple, 배열, 그 둘의 참조에서 각 부분의 참조를 준다. `usize`나 `isize`인 정수 결과는 assertion
  `const _: () = assert!(usize::BITS <= 64);`(`isize`도 같다) 뒤에 `as`로 넓힌다. assertion은 그보다 넓은 target에서 빌드를
  실패시키고, 표준 라이브러리는 둘 어느 것에도 `From`을 구현하지 않기 때문이다. 넓힌 값은 각 언어에서 u64나 i64처럼 그 계약
  타입의 결과 규칙대로 나간다. list parameter는 GN-6ad대로 넘긴다. Go C ABI의 crate도 인코딩된 인자에서 각 parameter를
  읽은 뒤 같은 방식으로 바꾼다. GN-6ad의 컴파일 시험은 이 꼴들을 덮는다: `[usize; 2]`인 tuple parameter, `u32`와 `u8`
  parameter, `[u32; 2]`인 tuple 결과, struct literal이 `[usize; 2]`와 `u32` field를 받는 record parameter, `usize`와
  `isize` 결과.
  이유: 코어는 index나 길이의 `usize`처럼 자기 코드가 필요로 하는 정수 타입을 유지하고, 계약은 값의 범위만 적는다. 코어의
  signature가 대상을 정하는 trait는 계약에 코어 타입 없이 바꾸므로, 값을 가진 어떤 코어에도 계약은 같다.
- **GN-6ad** 항목이 좁혀지는(GN-6ac) list parameter, 곧 정수나 정수를 가진 tuple의 list는 표의 타입으로 된 지역 `Vec`으로
  바뀌고, `IntoCore`가 그것을 코어 항목 타입의 `Vec`으로 바꾸며, 코어 호출은 `&values[..]`를 받는다. 그래서 `&[usize]`,
  `&[u32]`, `&[[usize; 2]]`처럼 더 좁은 항목의 slice를 빌리는 코어가 그것을 받는다. 코어 타입의 범위 밖의 항목은
  parameter의 이름을 subject로 하는 kind `invalid_number`다(B-2). 다른 항목의 list는 GN-6대로 `&values`로 넘긴다. Go도
  같은 방식으로 바꾼다.
  이유: 코어는 list를 slice로 빌리고, `&values[..]`는 그 slice를 자기 타입 `&[T]`로 주며, 그 항목 타입은 호출 자리의 deref
  coercion 없이 코어의 parameter가 정한다. 단위 시험은 생성기가 `tests/e2e/shapes`에 쓰는 WASM 진입점의 본문을 GN-6ac의
  helper, 그 fixture의 코어 함수와 함께 host와 wasm32로 컴파일하므로, 생성된 호출과 추론을 컴파일러가 확인한다.
- **GN-6v** variant unit(T-9)은 그 `core_type`이 이름하는 Rust enum이고, 각 case는 그 enum의 struct variant다: case의 Rust
  이름은 그 값의 UpperCamelCase이고, 각 field는 계약의 이름으로 match하고 만들므로 field가 없는 case는 `Case {}`다. 타입이나
  그 `optional` 안의 타입이, unit의 field와 `optional`만 거쳐 자기를 가진 variant에 다시 닿는 unit인 field는 `Box<T>`(또는
  `Option<Box<T>>`)다. Rust enum은 자기를 담을 수 없기 때문이다. `list`는 상자 없이 variant를 담는다. 바인딩은 wildcard가 없는
  case의 match로 variant를 양방향으로 바꾸므로(`in_<variant>`, `out_<variant>`), 코어나 계약에 없는 case는 컴파일되지 않는다.
  각 case는 그 field의 record의 결과 형태(GN-6a)를 `<Variant><Case>`라는 이름으로 갖는다: Python은 `<root>._types`의 frozen
  keyword-only `dataclass`와 alias `type <Variant> = <Variant><Case> | ...`, Node와 WASM은 tag member(unit의 `tag`, 그 언어의
  이름)가 case 값을 가진 plain object이고 선언은 case interface의 union, PHP는 interface `<Variant>`를 구현하는 case마다의
  final 클래스다. Go는 module 패키지의 interface `<Variant>`이고 그 유일한 method는 unexported `is<Variant>()`이며, 각
  case는 계약 타입의 Go 타입인 field들의 struct `<Variant><Case>`로서 value receiver로 그 interface를 구현한다. 그래서 variant를
  담는 field는 그 interface다. Go C ABI는 variant를 계약 안의 case 번호와 그 뒤의 field들로 차례대로 읽고 쓰며, Go는 case
  struct가 아닌 값(nil이나 case struct의 포인터)을 수 2^64 - 1로 인코딩한다. case가 아닌 값(tag가 없는 객체, 어느 case도
  이름하지 않는 tag, 다른 class의 인스턴스, case struct가 아닌 Go 값)은 kind `invalid_argument_type`이다. case 파일에서 variant 값은 tag 키가 case 값을 갖고 나머지 키가 snake_case 이름의 field인
  객체다(G-5). 기본값이 `{literal: null}`(T-4)인 `optional` field는 빠질 수 있고, 빠진 field는 null이며 코어는 `None`으로
  받는다: Python은 dataclass field에 기본값 `None`을 주고, Node와 WASM은 없거나 `undefined`인 member를 null로 읽고 그 member를
  선택적으로 선언하며, PHP는 생성자의 그 자리에서 null을 받고(GN-6i), Go는 field의 포인터를 nil로 두며, case 값은 그 키를
  뺄 수 있다. 그런 field는 늘 그 값이나
  null로 나간다. 이름으로 거부한다: `core_type`이 없는 variant, Rust 이름이 같은 두 case, tag의 이름을 가진 field, 그리고 아직
  생성하지 않는 그 밖의 case field 기본값과 이 계약의 class·callback·값 alias를 담는 field.
  case의 field는 record의 field처럼 다른 레포의 unit(T-3, GN-6c)을 담는다: 내장 타입 field만 가진 record, 그 레포의 값
  alias, 그 레포의 value class이며, `list`·`optional`·`map`·`keyed_map`·tuple 안에 있어도 된다. variant의 변환은 그
  unit의 변환(`library_<library>::in_<unit>`, `library_<library>::out_<unit>`, GN-4c)을 부르고 그 변환에 필요한 것을 받는다: Node에서는 모든
  record와 variant의 `in` 변환이 env를 첫 인자로 받는다. 값 alias와 class가 env를 읽기 때문이다. Go에서는 case에 값
  alias나 callback이 있는 variant의 함수 `encode<Variant>`가 member의 call을 첫 인자로 받는다. 그 call이 값을 훑기
  때문이다. case의 결과 형태는 GN-6c가 target마다 적은 대로 그 unit을 이름한다.
  이유: case의 언어 값이 어느 case인지 말하므로 바인딩은 짐작 없이 바꾸고, wildcard 없는 match는 한쪽에 없는 case를 실행 중
  잃는 값 대신 컴파일 오류로 만든다.
- **GN-6b** class unit(T-5)은 코어 값을 가진 final 언어 클래스다: Python은 native module의 frozen `pyclass`, Node는 JavaScript
  이름으로 내보내는 napi 클래스, PHP는 final 플래그를 단 `php_class`. 메서드와 property는 가진 값을 receiver로 코어 경로를 부르고,
  클래스를 돌려주는 static member나 생성자는 값을 감싼다. 클래스의 결과는 코어가 소유한 값으로 주든 빌린 값으로 주든 새 인스턴스다(accessor는
  `&T`를, optional이나 list의 항목은 그 둘 중 하나의 참조를 준다): 변환 `out_<class>`는 `impl CoreForm<T>`를 받아 소유한 값은 그대로 두고
  빌린 값은 복제하므로, 인스턴스는 코어를 빌리지 않는다. `constructible: false`면 생성자가 없다(PHP는 private으로 선언).
  property는 Python과 Node에서 getter, PHP에서 메서드다(I-3). napi-rs는 클래스 메서드를 configurable하지 않게 정의하므로,
  인자를 받는 Node 메서드와 static member는 addon의 `__<name>`(열거되지 않고 선언에 없다)이고 진입점이 그 위에 G-7 확인을
  하는 `<name>`을 정의한다. 진입점은 그 함수를 `<name>`이라는 이름의 함수 식이 아니라 계산된 key `<name>`의 메서드로 쓴다.
  member는 JavaScript가 예약한 이름(`null`, `delete`)을 가질 수 있는데 그 이름은 함수 이름이 될 수 없고, 메서드는 `<name>`을
  `name`으로 지닌다. napi-rs는 파싱한 클래스를 macro 프로세스 상태에 두는데 rustc는 struct와 impl의 펼침 사이에 그 상태를
  유지하지 않으므로, Node 생성자는 static `__new`이고 진입점은 `construct`가 인자를 확인하고 그것을 부르는 `Proxy`로 클래스를
  내보낸다. `instanceof`는 proxy를 거쳐 클래스의 prototype을 읽는다. 클래스 parameter는 그 인스턴스를 받고(다른 값은 kind
  `invalid_argument_type`) 코어는 가진 값을 빌린다(GN-6h). Node에서는 인스턴스를 그 class의 type tag를 확인하는
  `ClassInstance`로 꺼낸다: napi-rs는 참조 `&T`를 자기가 생성한 인자 변환에서만 주고 호출 본문이 만든 참조를 거부하며,
  생성 함수는 날 값을 받아 스스로 판정한다(T-8). `in` 행이 클래스 자신만 가리키는 origin `value` 클래스(U-1)는 그런 클래스로
  생성하며, `types`에 이름을 둔 값 타입은 그 unit이다.
- **GN-6h** class unit의 잠금(U-2 busy, B-5c). class의 자리는 호출이 그 인스턴스를 받는 곳이다: member의 receiver, 또는 타입이
  그 class 자체인 parameter. 쓰기 쪽 자리는 receiver `&mut self`·`self`, 그리고 `core`가 `&mut`인 parameter다. 그 밖의
  자리는 모두 읽기 쪽 자리다. class unit은 다음 중 하나이면 코어 값을 try로만 얻는 잠금에 담는다: (1) 그
  unit의 member에 쓰기 쪽 자리가 있다, (2) 그 class의 값이 언어에서 들어온다(parameter, 그 안의 record field나 list 원소,
  callback의 반환), (3) 그 unit의 member가 언어 코드에 닿는다. 타입이 언어 코드를 담는 것은 callback unit(다른 레포의 것 포함, GN-6s), 함수 타입,
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
  때문이다. 코어는 읽기 쪽 자리에 `&*guard`를, 쓰기 쪽 자리에 `&mut *guard`를 받는다. 생성 코드는 모든 잠금을 얻은 뒤 그 참조를 자리의 이름으로
  묶으므로, 어떤 `T`의 `&T`든 받아 guard의 참조를 deref하지 않는 trait의 코어 경로(`std::string::ToString::to_string`)도 값을 받는다. 코어 호출이 future나 호출이 다른 스레드로 옮기는 closure 안에서 돌면(Node: GN-6n의 `driving`과
  GN-6m의 pool, WASM: GN-6n의 future), guard는 그 안으로 옮겨지고 참조는 그 안에서 묶인다. 호출의 지역 변수를 빌린 참조는 호출보다 오래 살지 못하기 때문이다. class의 parameter는 그 참조의
  `CoreForm::core_form`을 코어에 준다(GN-6b): 코어 parameter의 타입이 `&T`면 참조를, `T`면 사본을
  고른다(`OrderedMap::insert(&mut self, key: Value, value: Value)`). 그래서 계약이 형태를 적지 않는 value class의
  parameter(CK-67)는 그 코어가 받는 형태를 받는다. 타입이 generated class이거나 그 `optional`인 parameter는 코어가 받는
  빌림을 `core`에 적고(`&`, `&mut`, `value`), 적지 않은 parameter는 이름을 대어 거부한다(G-4). 기본값은 아무도 적지 않은 빌림을
  주장하게 되고, 호출만으로는 틀린 빌림을 찾지 못하기 때문이다. `core`가 `value`인 parameter는 읽기 guard 아래 값의 복제
  `(*<자리>).clone()`을 받으므로 그 class는 `Clone`이다. 모든 바인딩 crate는 빌림을 적은 parameter를 가진 member마다 단언
  `const _: () = { let _: fn(<receiver>, <param>, ...) -> _ = <core path>; };`을 둔다. receiver는 그 class 코어 타입의
  `&T`·`&mut T`·`T`이고, 빌림을 적은 parameter는 그 class 코어 타입의 `&T`·`&mut T`·`T`이며, 다른 parameter는 `_`다. 그래서
  코어와 다른 빌림은 컴파일되지 않는다(I-2). 이유: binding은 Rust 소스를 읽지 않으므로 계약이 빌림을 적는다. 또 `&mut`는
  `&`로 강제 변환되므로 호출만으로는 코어가 `&`를 받는데 계약이 `&mut`를 적은 것을 찾지 못한다. 타입이 class의 `optional`인
  parameter의 `core`는 이름을 대어 거부한다(G-4). 다른 타입 안의 class 값(list 원소,
  record field, callback의 반환)은 읽어서 복제하고 곧 놓으므로 그런 class는 `Clone`이다. 쓰기 쪽 자리가 있는 class의 잠금은
  `poisoned` 표지를 가진다: 쓰기 쪽 자리의 guard를 쥔 동안 난 panic은 guard를 놓기 전에 표지를 세우고, 그 뒤 그 객체를 어느
  자리로든 받는 모든 호출은 kind `internal`로 실패한다. tokio의 잠금에는 poisoning이 없고 panic이 값을 반쯤 바뀐 상태로 남겼을
  수 있기 때문이다(P-2). 잠금은 `polyspec-binding-core`의 feature `lock`에 있으며 Python·Node·PHP 바인딩 crate의 manifest가
  그것을 켠다.
- **GN-6c** 다른 레포의 unit(T-3)은 모든 target에서 그 레포 패키지의 unit이다: 이 계약의 패키지는 그 이름을 내보내지 않고,
  호출자와 생성된 테스트는 그 unit을 그 레포의 패키지에서 가져오며, 이 계약의 패키지는 로드될 때 그 패키지를 필요로 한다.
  record의 경우: Python은 그 패키지에서 클래스를 import하고(`pyproject.toml`이 의존으로 적는다), 생성된 테스트는 그 패키지의
  모듈을 `foreign_<library>`로 import해 거기서 클래스를 부른다. PHP는 그 레포의 namespace에 있는 이름으로 class table에서
  클래스를 찾고(그 확장이 먼저 로드되어 있다), 테스트는 그 클래스를 부른다. Go는 그 레포의 Go 모듈 패키지의 struct를
  import한다(GN-15f). Node와 WASM은 plain object를 주고받으며 선언은 field로 적으므로 아무것도 import하지 않는다. 바인딩
  crate는 코어의 의존 줄 그대로 그 레포의 crate에 의존하고, `binding scaffold`가 그 줄을 옮겨 적는다. 이유: 이 계약의
  패키지에 그 record의 두 번째 클래스가 있으면 그것은 다른 타입이고, record를 가진 레포의 함수가 그것을 거부하므로, 한
  값이 두 패키지를 함께 지날 수 없다.
- **GN-6d** callback interface(U-3)는 언어 객체를 갖고 코어 trait를 구현하는 struct다. 그것을 받는 member는
  `Result<T, Failure<E>>`를 돌려주고(E-1c) 코어는 `&mut`(강제 변환으로 `&`도)로 받는다. 객체가 들어올 때 각 member가 호출
  가능해야 한다(kind `invalid_callback`). 호출은 인자를 내보내고(T-1대로 빌린 형태) 결과를 들인다. 언어 코드의 예외나 호출 중
  바인딩의 실패(다른 타입의 결과, Node와 PHP에서 `thread: owner`에 다른 스레드가 한 호출인 kind `wrong_thread`)는 바인딩 표의 그것을
  가리키는 `Native`를 가진 `Raised`로 코어에 가고, 생성된 호출자가 같은 객체를 다시 던진다. 어느 호출자도 다시 던지지 않은
  `Raised`의 마지막 drop은 GN-6u대로 그 항목을 지운다. 선언은 `<root>._types`의 Python `typing.Protocol`, Node
  interface, 확장이 등록하는 PHP interface다. 바인딩 crate는 feature `construct`를 켠 `polyspec-binding-core`에 의존한다.
- **GN-6z** 함수 타입(T-2)은 코어가
  `Box<dyn Fn(<parameter>…) -> Result<R, binding_core::Failure<E>> + Send + Sync>`로, 값으로 받는다. 각 parameter는
  callback member의 인자처럼 빌린 형태이고(T-1, GN-6d), `R`은 반환의 Rust 타입(`none`이면 `()`), `E`는 코어 오류다.
  생성된 crate는 이 타입을 type alias로 이름한다. alias의 이름은 `Function`과 그 타입의 SHA-256의 16진 여덟 자리이고,
  타입은 crate 끝의 alias 정의에 한 번만 쓴다. lint가 `let`과 closure의 결과에 쓴 boxed 타입을
  거부하기 때문이다(`clippy::type_complexity`).
  코어는 호출 뒤에도 함수를 가질 수 있으므로(template `engine.register`) 이 꼴은 `'static`이고 `Send`이며 `Sync`다. 값이
  들어올 때 호출 가능해야 한다(kind `invalid_argument_type`). 호출은 인자를 내보내고 결과를 들이며, 언어 코드의 예외나 호출
  중 바인딩의 실패는 GN-6d대로 `Raised`로 코어에 간다. Python은 호출 가능한 객체를 함수 안에 갖고 parameter를
  `collections.abc.Callable`로 선언한다. Node, PHP, WASM은 한 스레드와 한 환경에 속한 언어 값을 가지므로 함수가 그것을
  `Native`(GN-6u)로 갖고 parameter를 함수 타입(TypeScript `(…) => R`, PHP `\Closure`)으로 선언한다. `Native`의 owner가 아닌
  스레드에서의 호출은 kind `wrong_thread`이고, owner의 cleanup(Node의 env, PHP의 요청) 뒤의 호출은 kind `internal`이며, 둘 다
  `Raised`로 코어에 간다. 그 `Raised`의 `Native`는 어느 스레드든 가질 수 있는 `BindingError`를 갖는다. 언어의 오류 객체는 owner 스레드에서만
  만들어지고, 실패는 그곳에서 변환되기 때문이다. Go는 parameter를 `func(<parameters>) (<R>, error)`로, `none`이면
  `func(<parameters>) error`로 선언하고, nil func는 kind `invalid_argument_type`이다. Go 값은 어느 스레드에도 묶이지
  않으므로 Go에는 kind `wrong_thread`도 feature `thread-test`도 없다. func는 호출의 func와 그 안의 index로 들어오고,
  C ABI는 export `<prefix>__go_keep`에 `cgo.Handle`을 묻는다. package `binding`은 그때부터 그 handle 아래에 func의
  dispatch를 갖고, C ABI는 그 handle을 `Native`(GN-6u)로 갖는다. 그 `Native`는 호출보다 오래 살고, 마지막 drop이 어느
  스레드에서든 handle을 지운다. C ABI가 읽기 전에 실패한 호출의 func는 그 호출만 갖고, 호출은 끝난다. 함수는 export
  `<prefix>__go_function`으로 func를 부른다. 그 export는 호출의 handle이 아니라 `Native`의 handle을 받는다. 코어가
  보관한 함수를 나중의 호출에서, 또는 자기 스레드에서 부르기 때문이다. export는 인자를 디코드하고 func를 부르고 결과를
  인코드한다. export는 어떤 member도 만들지 않은 package `binding`의 자기 호출 안에서 func를 실행하고, 결과는 그 호출의
  handle로 시작한다. C ABI는 결과의 값 alias를 그 호출을 통해 읽고(GN-15c), 이는 callback의 결과를 member의 호출을 통해
  읽는 것과 같다. 결과의 func는 `<prefix>__go_keep`으로 읽고, 그다음 export `<prefix>__go_end`로 그 호출을 끝낸다. 실패한
  실행은 package `binding`에서 자기 호출을 끝낸다. 그래서 보관된 함수의 결과는 다른 target의 함수 결과처럼 그 alias의
  `in` 함수로 변환된다. 그 호출을 읽는 동안 value class owner의 member가 돌려준 오류(node 12, GN-15c)는 다음에 적는 어느
  호출의 것도 아닌 table에 보관하고, node 12는 호출 0과 그 key를 이름한다. 함수가 실행된 호출의 member가 실행의 호출이
  끝난 뒤에 그 오류를 돌려주기 때문이다. func가 돌려준 `error`와 panic의 값은 package `binding`의 mutex 뒤의 table에 보관한다. export는 호출이
  callback의 panic을 recover하듯(GN-15b) 그 panic을 recover한다. 그 table은 어느 호출의 table도 아니며, key는 table의
  count이고, `Raised`가 그 key를 이름한다. 함수가 실행된 호출의 member는 항목을 꺼내어 같은 error 값을 돌려주거나, C
  ABI의 호출이 돌아온 뒤 같은 값으로 panic한다. 어떤 member도 돌려주지 않은 `Raised`의 마지막 drop은 어느 스레드에서든
  export `<prefix>__go_release_raised`로 항목을 지운다. `thrown-count-test`의 진입점은 그런 `Raised`를 다른 것과 같이
  센다. 호출 0과 key를 이름하는 바인딩 실패의 `Raised`도 마지막 drop이 같이 항목을 지운다. 함수 타입의 결과는
  C ABI가 결과를 읽으면 끝나는 실행의 호출의 callback을 담지 않는다. callback unit과 machine의 함수(GN-6ae)는 어느 타입의
  결과도 아니기 때문이다(T-2). 함수 타입을 받는 member의 Go 시험은 nil
  func에 kind `invalid_argument_type`을 요구한다. case의 함수 값은 case의 행으로 답하고 어떤 행도 답하지 않는 호출을
  기록하는 func이며, 시험은 그런 호출이 없기를 요구한다. 함수 값에 행이 있는 case는 코어가 그 호출에서 func를 부름을
  보이므로, 시험은 그 case의 인자로 func가 돌려준 error가 그 호출의 error와 같은 값이고 func의 panic이 그 호출의
  panic임을 요구한다. receiver가 앞선 호출에서 행이 있는 func를 받았고 member가 `core.failure`를 이름하는 case에서는,
  시험이 그 나중 호출에 같은 것을 요구하고, error 뒤에 `thrown-count-test`의 count가 0임을 요구한다. Go 시험은 다른
  타입의 결과를 주지 않는다. func의 Go 타입이 결과를 정하기 때문이다.
- **GN-6aa** 다른 타입 안의 callback(record의 field, list의 항목, `optional`)은 `Box<dyn <core trait> + 'a>`로 받는다.
  `'a`는 호출 동안이고, `Send`와 `Sync`는 trait가 요구하는 대로다. callback을 담은 list, `optional`, record는 코어에 값으로
  넘긴다. 이것은 T-1의 예외다. 바인딩이 호출마다 그 값을 만들므로 가질 것이 없고, 빌린 list로는 코어가 receiver가
  `&mut self`인 member를 부를 수 없기 때문이다. callback field를 가진 record의 코어 타입은 lifetime 매개변수 하나를 가진다
  (`polyspec_x::Options<'a>`). 계약은 `core_type`에 그 경로를 적고, 생성기는 그 타입을 적는 곳에 lifetime을 적는다. callback이
  호출의 환경에 사는 Node에서는 `'env`, 다른 target에서는 `'static`이다. 그런 record는 바인딩이 호출의 인자로 만드는 자리인
  record parameter(T-4)로 생성하고, 다른 자리에서는 이름으로 거부한다. 코어가 호출
  뒤에도 갖는 callback은 `Box<dyn <core trait> + Send + Sync>`(`'static`)이고, Node, PHP, WASM은 GN-6z대로 native 수명 위에서
  그것을 준다. 계약은 코어가 값을 갖는 parameter에 `keeps: true`로 그것을 적는다(U-2). 그 parameter는 callback unit이거나
  그것을 담은 record, list, `optional`이며, `binding check`는 다른 parameter의 그 속성을 보고한다(CK-90). 계약이 적어야 하는
  이유는 lifetime이 `core_type`의 경로에 없고 생성기가 Rust를 읽지 않기 때문이다. `keeps`가 있는 parameter에 대해 생성기는
  모든 target에서 box와 record의 코어 타입을 적는 곳에 `'static`을 적고(`polyspec_x::Options<'static>`), 없는 parameter에는
  호출의 lifetime을 적는다. 코어는 컴파일러가 판단한다(I-2). `keeps`가 없는 parameter의 값을 갖는 코어는 box가 `'env` 동안인
  Node에서 컴파일되지 않는다. Python, PHP, WASM, Go는 다른 타입 안의 모든 callback에 `'static`을 적으므로 `keeps`는 그
  crate의 text를 바꾸지 않는다. 아직 생성하지 않는 것(G-4): Node는 `keeps: true`가 있는 parameter를 이름을 대고 거부한다.
  다른 타입 안의 callback의 wrapper가 JavaScript 객체를 호출의 환경 동안 갖고, owner 스레드의 `Native`(GN-6u)로 갖는
  wrapper가 없기 때문이다. 또 PHP와 WASM의 wrapper가 호출보다 오래 사는지를 보인 실행이 아직 없으며, 그런 callback을 갖는
  end-to-end check의 계약이 그것을 보여야 한다.
- **GN-6w** 이 계약의 callback interface를 `implements`하는 class unit(U-1, U-3)은, interface의 member 가운데 같은 이름으로
  선언하지 않은 것마다, 가진 값에 trait 메서드 `<core_type as <trait>>::<method>`를 부르고 그것이 돌려주는 `Failure<E>`를
  던지는 메서드를 갖는다(GN-6d). 선언은 interface를 이름한다: Node와 WASM은 `class <Class> implements <Interface>`, PHP는
  stub과 class의 항목에서 확장이 등록하는 interface, Python은 `Protocol`이 이름하는 메서드를 갖는다. Go는 class의 포인터에
  callback의 Go interface의 메서드를 가지므로 그 포인터가 interface를 만족하며, `var _ <Interface> = (*<Class>)(nil)`이 이를
  단언한다. callback의 호출은 U-3의 dispatch로 그 메서드를 부르고, 메서드는 C ABI로 trait 메서드를 부른다. 그래서 class의 인스턴스는
  그 member를 가진 언어 객체처럼 callback을 받는 자리에 들어오고, callback의 호출은 그 메서드를 거쳐 가진 값에 닿는다. case에서
  callback의 자리에 인스턴스 값(GN-13f)이 올 수 있다. 아직 생성하지 않아 이름으로 거부한다: 다른 레포의 interface, class가
  `&self`가 아닌 receiver로 구현하는 member, abstract class(U-1).
  이유: 코어 타입이 trait를 구현하는 class는 이미 callback이므로, 호출자는 호출마다 넘겨 주는 자기 객체 대신 그 인스턴스를
  callback을 받는 자리에 넘긴다.
  `errors.recognize`가 오류 unit을 적은 member(U-3)는 언어 코드의 예외가 그중 하나의 인스턴스이면(Python `isinstance`, PHP
  `instanceof`, Node·WASM의 prototype 사슬, Go의 `errors.As`) 그 `kind`와 메시지를 읽는다. 그 kind가 `class`가 그 unit이거나
  그 unit을 확장한 unit인 `errors.kinds` 행의 kind이면 코어는 `Failure::Kind(<recognized>(<kind 값>, &message))`를 받는다.
  `errors.recognized`는 코어 함수 `fn(<kind 값>, &str) -> E`를 적고, kind 값은 그 행의 variant 경로를 식으로 쓴 것(중첩 경로는
  `<바깥>(<안쪽>)`, GN-7b)이며 `errors.code`가 있으면 code enum의 값이다. 그 밖의 예외와 kind가 그 행들의 kind가 아닌
  인스턴스는 `Raised`로 코어에 가고 호출자가 같은 객체를 던진다. Node는 읽으려고 대기 중인 예외를 꺼내고, recognize하지
  않으면 다시 던져 둔다. Go는 recognize한 오류의 kind와 메시지를 오류의 index 대신 C ABI에 넘긴다. 이유: recognize한 실패의
  뜻은 코어가 정하고(U-3), binding은 Rust 소스를 읽지 않으므로 코어 오류를 만드는 함수를 계약이 적는다. 언어 코드가 만든
  인스턴스는 property 값이 없으므로(GN-7a) 인스턴스의 property는 코어에 가지 않는다. 다른 라이브러리의 오류 unit을
  recognize하는 것은 이름을 대어 거부한다(G-4).
- **GN-6ap** origin이 `generated`인 interface unit(U-1)은 core가 호출하지 않는 interface다: 한 parameter가 받는
  계약의 class들을 이름한다. 그 `core_type`은 그 interface로 type된 parameter에서 core가 받는 Rust 타입이고, 계약의
  class 가운데 그것을 `implements`하는 class(구현 class)의 core 타입 `C`마다 core는 `impl From<&C> for <core_type>`을
  갖는다. core 타입이 구현 class의 enum인지 trait object의 box인지는 그 `From` 뒤에 있으므로, 계약은 타입만 말하고
  `From`이 없으면 생성된 crate가 컴파일되지 않는다. interface로 type된 값은 함수나 class member의 parameter로
  들어오며 `optional` 안에도 들어온다. 다른 자리(반환, field, list, callback의 member)에서는 그 타입을 이름으로
  거절한다. binding은 언어 값이 어느 구현 class의 instance인지 계약 순서로 찾고, 그 instance의 값을 다른 타입 안의
  class 값을 읽듯 읽어(GN-6h: 읽고 clone하고 놓는다) 그것의 `<core_type as From<&C>>::from`을 core에 준다. 따라서
  구현 class의 core 타입은 `Clone`이고, core가 값을 받으므로 parameter는 `core` 빌림을 이름하지 않는다. 그 밖의
  언어 값은 `InvalidArgumentType`이고 그 `expected`는 interface의 언어 이름이다. 선언은 interface를 이름한다: PHP는
  extension이 등록하는 interface이고 각 구현 class의 entry와 stub이 `implements`로 이름한다. Python은 types module의
  `abc.ABC` class이고 패키지가 각 구현 class를 그것에 등록하며(`<Interface>.register(<Class>)`) class의 stub은 그것을
  base로 갖는다. member 없는 `Protocol`은 모든 값을 받기 때문이다. Node와 WASM은 선언 파일의 `export interface
  <Interface>`이고 각 구현 class가 `implements`로 이름한다. Go는 export되지 않은 method 하나를 가진 interface여서
  다른 package가 구현하지 못하고, 각 구현 class의 pointer가 그 method를 가지며 `var _ <Interface> = (*<Class>)(nil)`이
  이를 확인한다. 그 method는 구현 class들 가운데 그 class의 위치와 값의 handle을 주고 호출이 이를 인코딩한다.
  Go에서 구현 class는 interface의 module에 있고, 다른 module은 Go에 대해서만 이름으로 거절한다. case에서 그런
  parameter의 argument는 구현 class의 instance 값(GN-13f)이고, 아무 값이나 필요한 테스트는 factory가 있는 첫 구현
  class의 instance를 쓴다. 이름으로 거절하며 아직 생성하지 않는 것: member를 선언하는 generated interface, 다른
  레포의 generated interface. 이유: 여러 handle 가운데 하나 위에서 도는 core는 그것들에 대해 한 타입을 받고,
  호출자는 가진 instance를 스스로 변환하지 않고 넘긴다.
- **GN-6aq** 타입 `cancel`(T-1)이나 그것의 `optional`인 parameter는 언어의 취소를 받고, core는
  `binding_core::Cancel`을 값으로 받는다(`optional`이면 그것의 `Option`). 생성 코드는 `binding_core::cancel_pair()`의
  쌍을 만들어 `Cancel`을 core에 주고 `CancelTrigger`를 언어 값에 묶는다. 그래서 trigger는 언어 값이 발화할 때
  발화하고 다른 때에는 발화하지 않는다: 호출 뒤에도 `Cancel`을 갖는 core(그것을 지니는 handle)는 언어 값이 사는
  동안 취소될 수 있고, 발화하지 않고 버려진 언어 값은 trigger를 버리며 이는 아무것도 취소하지 않는다. 호출 전에
  이미 발화한 언어 값은 core를 부르기 전에 trigger를 발화시킨다. 그 밖의 값은 `InvalidArgumentType`이다. 이 타입은
  parameter에만 있고, 다른 자리에서는 이름으로 거절한다. 언어 값은 T-1의 것이다:
  - Node와 WASM: `AbortSignal`. binding은 `aborted`를 읽고, 아니면 `once`로 `abort`의 listener를 더하며 그것이
    signal의 thread에서 trigger를 발화시킨다. signal은 자기 thread에 속하므로, 다른 thread는 owner thread가
    `AbortController`의 `abort()`를 부르게 하여 취소한다.
  - Python: future, 곧 `cancelled()`와 `add_done_callback`을 가진 객체(`asyncio.Future`,
    `concurrent.futures.Future`). binding은 `cancelled()`를 읽고, 아니면 done callback을 더하며 그것은 future가
    취소되었을 때 trigger를 발화시키고 결과를 가졌을 때에는 발화시키지 않는다. 다른 thread는
    `concurrent.futures.Future`를 `cancel()`로, `asyncio.Future`를 `loop.call_soon_threadsafe(future.cancel)`로
    취소한다.
  - Go: `context.Context`, member의 첫 parameter `ctx`(`optional`은 nil `ctx`). binding은 `ctx.Err()`를 읽고, 아니면
    `context.AfterFunc`를 등록하며 그것이 context가 시작하는 goroutine에서 trigger를 발화시킨다. 기다리거나
    polling하는 goroutine은 없다. trigger의 handle은 그것을 쥔 Go 값이 도달 불가능해질 때 놓인다
    (`runtime.AddCleanup`).
  - PHP: root namespace의 생성된 final class `Cancellation`. `__construct()`, 멱등인 `cancel(): void`,
    `isCancelled(): bool`을 갖는다. 한 PHP process는 core 호출이 도는 동안 언어 코드를 실행하지 않으므로 `cancel()`은
    호출 사이에 불린다: signal handler(`pcntl_async_signals`), core의 callback, 또는 다른 process와 공유하는 상태를
    호출 전에 읽어 그 상태가 그렇다고 할 때 `cancel()`을 부르는 host 코드가 부른다. binding은 그런 상태를 모르며,
    그것이 필요한 레포가 그 host 코드를 쓴다(GN-6ag).
  case에서 이 타입의 값은 `{"cancel": "fired"}`이거나 `{"cancel": "open"}`이다(GN-13, CK-22): 생성된 테스트는 이미
  발화한 언어 값이나 발화하지 않는 언어 값을 만들어 넘긴다. 이유: 호출자만이, 자기 언어가 이미 가진 취소로
  취소하고, core는 한 타입으로 그것을 관찰한다.
  구현되지 않음: 생성기는 이 타입을 받는 member를 모든 target에 대해 이름으로 거절한다(`the type cancel is not
  generated yet`).
- **GN-6e** `core: {in, out}`을 가진 값 alias(U-7)는 바인딩이 한 단계씩 기술하는 `HostValue`(B-1)로 들어오고, 코어의
  `in` 함수가 `HostValues`를 통해 판정한다. 그 실패는 코어의 kind이거나, 코어가 값을 도는 동안 언어 코드(getter, iterator)가
  던진 예외이며 그대로 다시 던진다. 언어 값이 어떤 `HostValue`인지는 binding의 규칙이다. Python은 정확한 내장 타입을 받고
  (`int`, `float`, `str`, `bytes`의 하위 클래스는 `Other`) `str`은 UTF-8 byte로, surrogate를 가진 `str`은 code point로
  받는다. WASM은 `isWellFormed`인 string을 UTF-8 byte로, 그 밖의 string을 UTF-16 단위로 받으므로 흔한 text는 text
  하나로 경계를 한 번 건넌다(B2.89). Node는 number를 `UntypedNumber`, bigint를 `Int`(`i64` 밖이면 십진
  토큰), string을 UTF-16 단위, Array, Map, plain object(prototype이 `Object.prototype`이나 `null`, 자기 열거 가능한 문자열
  키), Date, 함수로 받고 typed array와 symbol은 `Other`다. PHP는 참조인 원소를 identity를 가진 `PhpReference`로, 배열을
  `array_is_list`와 함께, stdClass를 그 객체의 모든 자리에서 같은 handle로(코어는 그 handle로 이미 본 객체를 안다),
  그리고 Closure를 받는다. 코어 값은 코어의 `out` 함수가 주는 `OutValue`로 나가고 alias의 `out`
  행으로, 내장 형식이나 member로 만든다. member는 계약의 생성된 class의 생성자나 static member로, 하나뿐인 parameter가 그
  kind의 내용(bool, int, int64, float, text, bytes)이고 실패하지 않는 것이며, 그 내용으로 그 코어 경로를 부르고 그 값은 그
  class의 instance로 나간다. 다른 member와 다른 레포 alias의 member는 이름을 대고 거부한다(G-4). 형식 `{"keyed_map": {"key": [...]}}`은 map으로 만들고,
  그것이 적은 종류의 각 key는 항목과 같이 행으로 만든다(T-2). Python과 Node에서는 같은 handle이 같은 객체이고, 배열이
  값인 PHP에서는 자기를 만드는 중에 다시 나온 handle이 kind `internal`이다. 코어가 보관할 수 있는 언어
  객체(`Object`, `Callable`)는 `Native`로 들어온다(B-1). 코어는 그것을 다른 값처럼 복제하고 보관하고 drop하며, `native` 행은 같은
  객체를 돌려준다. 컨테이너, `Date`, `Other` 값의 handle은 그것을 준 `in`이나 `out` 호출 안에서만 유효하다. 바인딩은 `Date`와
  `Other` 값에 그 호출 안의 순서로 번호를 매기며, 이후의 호출은 그 번호를 읽지 않는다. `Native`가 무엇을 갖고 마지막 drop이 무엇을 하는지는 target의 규칙이다(GN-6u).
- **GN-6u** `Native`(B-1)가 갖는 것과 마지막 drop이 하는 일은 target마다 다음과 같다.
  - Python은 `Py<PyAny>`를 갖고 drop에서 해제한다. PyO3는 GIL 없는 drop을 다음 GIL 획득으로 미루므로, crate는
    `pyo3_disable_reference_pool`과 함께 컴파일되지 않는다. crate의 `build.rs`가 그 cfg를 선언한다
    (`cargo::rustc-check-cfg`). rustc는 어느 crate도 선언하지 않은 cfg를 거부하고, crate의 manifest는 lint를
    workspace에서 받기 때문이다.
  - WASM은 그 한 스레드의 표에서 `JsValue`를 가진 key를 갖고, drop이 그것을 지운다.
  - Node와 PHP는 owner, 그 generation, owner 표의 key를 갖는다. 그 표는 언어 참조를 그것을 가진 스레드에 둔다. 그 스레드의
    참조는 다른 스레드에서 해제할 수 없기 때문이다. owner 스레드의 drop은 곧바로 해제하고, 다른 스레드의 drop은 key를 owner의
    해제 대기열에 넣으며, 그 owner의 모든 생성 진입점은 동기 부분의 처음에 대기열을 비운다. Node에서 다른 스레드의 drop은
    owner의 threadsafe function도 부른다. 그 함수는 한동안 진입점이 없을 때 owner 스레드에서 대기열을 비우므로, 해제가 다음
    진입점을 기다리지 않는다. owner는 표를 만들 때 JavaScript 함수 없이 그 함수를 만들고 unref하므로, 그 함수는 event loop를
    붙잡지 않는다. Node env cleanup hook과 PHP request shutdown은 표가 가진 것을 해제하고 generation을 올리며, Node hook은
    owner들의 lock 안에서 threadsafe function을 abort로 해제한다. drop은 그 lock 안에서 generation을 비교한다. 이전
    generation의 drop은 key를 버리고 환경이 사라진 언어의 어떤 것도, 참조도 threadsafe function도 건드리지 않으며, 그런
    `Native`의 `out`은 kind `internal`이다.
  - Go는 값 alias의 func의 `cgo.Handle`, 또는 함수 타입(GN-6z)의 func의 dispatch의 `cgo.Handle`을 갖고, drop이 어느
    스레드에서든 그것을 지운다. 결과로 나가는 `Native`는 결과의 node 13이며, 결과의 다른 어떤 node도 그 번호를 갖지
    않는다(11은 GN-6x, 12는 GN-6af).
  - `Raised`(GN-6d)의 `Native`는 던져진 객체 표의 key를 갖고, 마지막 drop이 그 항목을 지운다. 그래서 코어가 돌려주지 않고
    버린 예외가 남지 않는다. Python, Go, WASM은 drop에서 지운다. Node와 PHP는 그 표를 던진 스레드에 그 스레드의 번호와 함께
    둔다. 그 스레드의 drop은 항목을 곧바로 지우고, 다른 스레드의 drop은 그 스레드가 살아 있는 동안 key를 그 스레드의
    대기열에 넣는다. 그 스레드는 다음에 예외를 보관하거나 다시 던질 때 대기열의 key를 지우고, 끝날 때 대기열을 버린다. 다른
    스레드에서 난 바인딩의 실패(GN-6z)의 `Native`는 `BindingError` 자체를 갖고, drop이 그것을 버린다.
  - 값 alias가 그 target의 `native` 행을 갖고, 함수가 그 alias를 하나뿐인 parameter로 받아 그것을 돌려주면 왕복과 해제를
    시험한다. 시험은 준비 호출 한 번 뒤 바인딩이 가진 것을 세고, 시험의 class의 새 인스턴스를 그 함수에 주어 결과가 같은
    객체인지 확인하고, 그것을 버린 뒤, 해제 대기열을 비우는 호출을 한 번 더 하고(Node는 먼저 event loop를 한 번 돌린다), 다시
    센다. 두 수는 같아야 한다. 세는 것은 Python에서는 대상의 살아 있는 참조 수(`sys.getrefcount`)이고, 대상을 지운 뒤 죽은
    weak reference를 함께 본다. 다른 target에서는 `native-count-test`의 진입점이다. Node, PHP, WASM은 owner 표의 항목 수,
    Go는 Native의 살아 있는 `cgo.Handle` 수이며, Go의 func는 비교할 수 없으므로 시험은 수만 확인한다. `out`의 바이트는 `Native`보다 오래 살므로,
    `native` 행은 func의 새 `cgo.Handle`을 준다. Rust가 Go에 주는 모든 버퍼(결과, 실패, callback의 인자)는 그 버퍼가 주는
    handle의 목록으로 시작하고, func의 node는 그 목록 안 handle의 위치다. Go는 다른 무엇을 디코딩하기 전에 그 목록을 읽어
    handle마다 func를 꺼내고 handle을 곧바로 지운다. 그래서 디코딩이 이후에 무엇을 만나든(Go 형태가 없는 값, 잘못된 node),
    호출자가 버퍼를 디코딩하든 않든, 어떤 handle도 그 버퍼보다 오래 살지 않는다.
- **GN-6k** 다른 레포의 값 alias(T-3, U-7 (a'))는 자기 레포의 alias(GN-6e)와 같은 방식으로 주고받는다. 바인딩이 언어 값을
  `HostValue`로 기술해 소유 코어의 `in` 함수를 부르고, 소유 코어의 `out` 함수가 주는 `OutValue`를 alias의 `out` 행으로
  만든다. `out` 행은 소유 레포의 계약에서 읽는다. 소유 코어의 두 함수가 유일한 변환이다(P-1). 변환의 이름은
  module `library_<library>`의 `in_<alias>`와 `out_<alias>`다(GN-4c). 두 라이브러리의 같은 이름 alias가 겹치지 않게 하기 위해서다. `in`의
  실패는 소유 레포 오류 enum의 변형이다. kind, status, errno는 소유 레포의 것이고(`Kinds`), 클래스는 소유 레포 E-1이 그
  변형에 준 category의 이 레포 클래스다(E-2). 그 클래스는 소유 레포 kinds에 대한 wildcard 없는 match로 고르므로, 소유 계약에
  없는 변형이 있으면 컴파일되지 않는다(I-2 (3)). 소유 코어가 값을 도는 동안 언어 코드가 던진 예외는 그대로 다시 던진다.
  바인딩 crate는 소유 레포의 crate에, Python 패키지는 소유 레포의 패키지에 의존한다(GN-6c). 소유 레포가 제3 라이브러리의
  kind를 그대로 전달하거나(E-1b (a)) 오류 enum 둘을 적은 alias는 이름을
  대고 거부한다(G-4). owner의 class를 이름하는 행은 GN-6ar대로 생성한다. WASM은 그 alias를 GN-18b대로, Go는 GN-15c대로 받는다. 다른 레포 alias의 `in_raises`는 이 레포에 생성할 것을 주지 않는다: 그 alias의 case, kind 단언,
  feature `codec-test`의 진입점(GN-5, GN-13)은 소유 레포의 바인딩에 속하고 거기서 한 번 실행된다. 이 레포의 crate는 자기
  alias가 있을 때만 그 feature를 갖는다.
- **GN-6ar** 다른 레포의 값 alias의 행은 owner의 class를 이름할 수 있다(U-1, GN-6af). `make`가 owner의 public class의
  public constructor인 `out` 행과, 언어 타입이 그런 class인 `in` 행이다. 바인딩은 다른 레포의 값 class의 member를
  부르듯이(GN-6x) owner package의 언어 API로 인스턴스를 만들고 읽으며, owner 바인딩의 native 객체를 꺼내지 않는다.
  Python은 owner package의 module에서 class를 읽고, Node addon과 WASM module의 JavaScript entry는 module이 로드될 때
  GN-6x의 class 뒤에 그 class들을 넘겨준다. WASM은 class의 `Symbol.hasInstance`로 인스턴스를 검사하고 `Reflect.construct`로
  만든다. 나갈 때: constructor는 parameter가 하나다. 행의 kind의 bool, 정수, float은 그대로
  넘긴다(Node와 WASM은 bool과 float). 그 alias의 keyed map은 kind `object`나 `map`의 entry를 언어의 새 map(`dict`, `Map`)으로
  받고, 인스턴스는 그 map을 그대로 보관하므로(GN-6af) 바인딩은 빈 map으로 인스턴스를 만든 다음 만든 entry를 그 map에
  넣는다. alias 자체는 kind `reference`의 값을 받는다. 바인딩은 언어의 null로 인스턴스를 만들고, parameter와 이름이 같은
  그 class의 writable property에 언어의 대입처럼 만든 값을 넣는다(WASM은 `Reflect.set`). 그래서 object와 reference는 내용보다 먼저 만들어지고 자기 handle의
  모든 자리에서 같은 인스턴스이며(U-7 (d)), 그것을 지나는 순환이 만들어진다. 들어올 때: 그 class의 인스턴스는 행의 한
  case(`when` 없음)의 kind를 가진 `HostValue::Value`이고, `HostValues`의 `read`는 그 case가 이름한 public property를
  준다. 타입이 bool, 정수, float인 property는 그 타입의 `HostValue`다. JavaScript의 number만으로는 정수와 float을
  구별할 수 없기 때문이다. 그 밖의 property는 언어의 규칙으로 다시 묘사한다. property를 다시 묘사하는 인스턴스는 코어의
  한 번의 순회 안에서 handle이 하나다(Python은 주소로, Node와 WASM은 순회의 `Map`으로). bool이나 수를 가진 인스턴스는 값이므로
  그럴 필요가 없다. 타입의 이름이 `only`가 그 target에서 뺀 class(GN-6af)의 이름인 행은 거기서 언어의 타입을 이름한다.
  PHP의 `reference`가 그렇다. `package.json`은 owner의 npm package를 적는다(GN-3e). 이름을 대고 거부하는 것(G-4):
  public constructor가 아닌 member, 다른 parameter를 받는 constructor, 그런 writable property가 없는 class의 reference,
  case가 여럿이거나 `when`이 있는 `in` 행, class의 public property가 아닌 `read`. 아직 생성하지 않고 이름을 대고
  거부하는 것(G-4): Go의 꼴. GN-15c의 Go 호출에는 다른 module의 class의 인스턴스를 constructor로 만드는 node가 없기 때문이다. PHP에는 그런
  class가 없으므로(GN-6af, CK-78) 그것을 이름하는 PHP 행도 이름을 대고 거부한다. 이유: owner의 코어가 값을 주고
  받으며, 두 package를 함께 쓰는 사용자가 한쪽의 인스턴스를 다른 쪽에 넘길 수 있는 꼴은 owner의 언어 class뿐이다.
- **GN-6as** 값 alias(U-7), 다른 레포의 값 alias(GN-6k), 다른 레포의 값 class(GN-6x)의 변환은 값의 깊이에 비례하는
  native stack을 쓰지 않는다. core의 `OutValue`에서 언어의 값을 만드는 함수 `make_<name>`은 heap의 작업 stack을 가진
  loop로 값을 걷고, 자기 자신이나 그 alias의 변환을 부르지 않는다. stack은 자식이 다 만들어지지 않은 container마다
  level 하나를 담는다: container의 handle, 길이와 다음 자식의 index, 만든 자식을 받는 언어의 container, 그리고 map의
  entry에서는 값이 만들어질 때까지 만든 key. 뒤의 자리가 다시 이름할 수 있는 container(U-7 (d))는 자식보다 먼저
  만들어 handle 아래에 두므로, cycle은 전과 같이 만들어진다. owner의 member가 만든 자식으로 만드는 인스턴스(GN-6x)는
  마지막 자식이 만들어졌을 때 만든다. 자식은 값의 순서대로, entry마다 한 번, key를 값보다 먼저 만들도록 요청한다.
  binding은 언어의 값을 한 level씩 기술하므로(B-1), 들어오는 값을 걷는 것은 core의 `in` 함수의 loop이고, binding은
  거기에 자기 level을 더하지 않는다. 이유: 계약이 말하는 깊이 한계 안의 값은 다섯 대상에서 같은 결과를 가진다. binding은
  Node의 main thread나 WASM module의 stack 같은 host의 stack을 키울 수 없다. 더 큰 stack은 process가 끝나는 깊이를
  옮길 뿐이다. Node와 WASM에 생성된다. 아직 생성되지 않는 것: Python, PHP, Go의 make 함수. 이들은 아직 level마다 자기
  자신을 한 번 부른다.
- **GN-6x** 다른 레포의 값 class(T-3, U-1)는 다른 레포의 값 alias(GN-6k)와 같은 방식으로 주고받는다.
  이때 owner가 그 class에 `core: {in, out}`으로 적은 두 함수와 `core_type`에 적은 코어 타입을
  쓴다(CK-8). 그것이 없는 다른 레포의 값 class는 이름으로 거절한다(G-4). 생성 코드가 그 인스턴스의 묘사를 직접 코어
  값으로 바꾸면 owner 규칙의 두 번째 구현이 되기 때문이다(P-1). 들어올 때: parameter는 owner 패키지에서
  import한 owner 언어 class의 인스턴스를 받는다(T-3). 그 밖의 값은 kind
  `invalid_argument_type`이다. 생성 코드는 자기 언어의 `in` 행의 `by` member를 owner의 언어
  API로 부르고, 그 결과를 `is`로 가진 case의 kind로 인스턴스를 열지 않고 `HostValue::Value`로 묘사한다.
  그 handle의 `HostValues::read`는 그 case의 `read` member를 부르고 결과를 한 단계씩 묘사한다.
  list는 list로, 각 항목은 다시 이 규칙으로 묘사한다(PHP에서 kind가 `list`인 case의 `read` member가 주는, key가
  순서대로 0부터 n-1인 배열은 PHP 배열이 아니라 `HostValue::List`로 묘사한다. owner의 walk가 case가 적은 kind를
  읽기 때문이다). `iterate` member가 `{key, value}`를 내는
  owner의 생성 class 인스턴스는 그 iteration의 entry로 이루어진 map으로 묘사하며, map을 묘사할 때
  snapshot을 뜬다(GN-6f). 값 class의 인스턴스는 다시 `HostValue::Value`로, text나 bool은 그
  kind의 `HostValue`로 묘사한다. `read` member가 `uint`의 list를 주는 kind `text16`의 case는 모든 언어에서
  text의 UTF-16 code unit을 짝 없는 surrogate까지 `HostValue::Text(HostText::Utf16)`로 묘사한다. `units`를 가진 kind
  `text`의 case는 `read` member를 한 번 부른다. text는 언어의 text로(PHP, Go, Node, WASM은 UTF-8 byte, Python은 code
  point) 묘사하고, 없음이면 `units`를 불러 그 code unit을 `HostText::Utf16`으로 묘사한다. 그래서 text의 code unit은
  짝 없는 surrogate를 가질 때만 경계를 건넌다(B2.89). 묘사는 owner의 `in` 함수가 판정한다. 그 실패와 언어 코드의 예외는
  GN-6k대로 보고한다. 나갈 때: owner의 `out` 함수가 코어 값을 `OutValue`로 주고, 생성 코드는 자기 언어에
  대한 class의 `out` 행으로 언어 값을 만든다. 각 `make`는 owner 패키지의 언어 API로 부르는 owner의 공개
  `constructor`나 `static` member다. parameter 하나가 그 kind의 내용인 member는 그 내용으로
  부른다(bool, text, kind `number`면 `OutValue::Number`의 literal, kind `text16`이면 `OutValue::Text16`의
  code unit을 언어의 정수 list로). 그래서 짝 없는 surrogate가 있는 text는 언어의 문자열이 담지 못하는 곳에서도
  owner가 가진 그대로 나간다. parameter 하나가
  값 타입의 list인 kind `list`의 member는 각각 이 행으로 만든 항목으로 부른다. parameter 하나가
  owner의 생성 class인 kind `map`의 member는 parameter 없는 공개 constructor로 만든 그
  class의 인스턴스로 부른다. 생성 코드는 key와 값 타입의 value를 받는 그 class의 공개 method로 각 entry를
  순서대로 넣고, key는 그 kind(`text`나 `text16`)의 행으로 만든다. 그 밖의 `make`는 이름으로 거절한다(G-4). Python,
  Node, PHP는 이렇게 주고받는다. WASM은 owner의 WASM 패키지의 JavaScript class로 Node와 같이
  주고받는다(GN-18b). Go는 owner class의 Go 타입으로 받으며, GN-15c의 host 질문에 대한 답이 그
  `by`와 `read` member를 부른다. 줄 때는 GN-15c대로 `out` 행이 적은 owner Go 패키지의 export 함수로 만든다.
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
  member가 없다. 수를 돌려주는 primitive는 Node와 WASM의 `valueOf`이며, Python·PHP·Go에는 그런 hook이 없으므로 그 member가
  없다. PHP 확장은 stringify가 있는 class에 `\Stringable`을 적지 않는다. PHP는 `__toString`이 있는 모든 class에 그
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
  parameter에 엔진이 `null`을 주고 확장은 둘을 구별할 수 없기 때문이다. 기본값이 있고 뒤에 다른 parameter나 options
  record가 오는 parameter는 호출의 가운데에서 생략되며, 언어마다 그 호출의 꼴은 하나다. 선언이 그 꼴을 받고 생성된
  테스트가 그 꼴로 쓴다(GN-13d, GN-13e). Python은 그 뒤의 인자를 모두 keyword로 주고 선언 `name: T = <기본값>`이 그것을
  받는다. PHP는 그 뒤의 인자를 모두 이름 있는 인자로 주고 stub `mixed $name = <기본값>`이 그것을 받는다. Node와 WASM은
  그 parameter의 자리에 `undefined`를 준다. JavaScript의 인자에는 자리만 있기 때문이며 선언 `name?: T`가 그것을 받는다.
  그래서 options record를 그 앞 parameter의 자리에서 읽는 일은 없다. Go는 GN-15e의 포인터인 nil을 준다. 기본값
  `{empty: "object"}`가 있는 record
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
- **GN-6y** 타입 `path`(T-1, B-3)는 OS 경로의 바이트이고 모든 자리에 쓴다: parameter, 결과, field, 원소, 그리고
  `optional` 안. 코어는 parameter를 `&std::path::Path`로, `optional<path>`를 `Option<&Path>`로 받고, 결과와 field를
  `std::path::PathBuf`로 준다. 언어마다 입력은 다음이다. Python은 `str`, `bytes`, `os.PathLike`를 `os.fsencode`한
  바이트로 받는다. Node는 string을 그 UTF-8로, 또는 `Uint8Array`를 받는다. PHP는 string을 받고 그 바이트를 그대로
  넘긴다. Go는 `string`을 받고 그 바이트를 그대로 넘긴다. 출력은 다음이다. Python은 `os.fsdecode`한 `str`이다.
  Node는 바이트가 UTF-8이면 string이고 아니면 `Uint8Array`다. 어떤 바이트도 대체 문자로 바꾸지 않기 위해서다. PHP는
  그 바이트의 string이고, Go는 그 바이트의 `string`이다. kind는 모든 언어에서 같다. 다른 타입의 값과, Python에서
  `os.fsencode`가 `TypeError`로 거부하는 값은 kind `invalid_argument_type`이다. 짝 없는 surrogate가 든 Node string은
  kind `invalid_text`다(B-3). NUL 바이트가 든 경로, `os.fsencode`가 인코딩하지 못하는 Python `str`, 그리고 OS 경로가
  바이트가 아닌 곳(Windows)에서 UTF-8이 아닌 바이트는 kind `invalid_path`다. 바이트는
  `binding_core::path_from_bytes`와 `binding_core::path_bytes`가 바꾸므로 모든 target이 한 함수로 판정한다. WASM에는
  OS 경로가 없다. 계약은 `path`를 가진 member에 `wasm`이 없는 `only`를 준다(Q-4, CK-15). WASM target에 닿은 `path`는
  이름으로 거부한다. 타입 `path`의 case 값(G-5)은 부분 사이를 `/`로 적은 상대 경로다. 생성된 시험은 그것을 시험마다
  새로 만든 임시 디렉터리 안에서 풀고, 시험이 끝나면 그 디렉터리를 지운다. Python은 시험의
  `tempfile.TemporaryDirectory`, Node는 `mkdtempSync`와 `afterEach`, PHP는 `sys_get_temp_dir()` 아래 디렉터리와
  `tearDown`, Go는 `t.TempDir()`을 쓴다. 한 시험의 입력과 기대 결과는 같은 디렉터리에서 풀리므로, 경로를 내는 결과는 그
  디렉터리 안의 경로로 비교한다. 빈 경로, 절대 경로, `..` 부분이 있는 경로는 시험의 디렉터리를 벗어나므로 이름으로
  거부한다(G-4). 그 case의 시험은 모든 target에서 그 이유로 실패한다(GN-13e).
- **GN-7** member의 코어 경로가 `Result`를 돌려주는지는 `core.result`가 정한다(E-1c). 없으면 `raises`가 이 계약 자신의
  코어 오류 variant를 가리키거나 member가 callback을 받을 때 돌려준다. 그런 경로의 오류는 `core.failure`가 참이면, 그리고
  그것이 없으면 parameter가 callback이나 함수를 담을 때 kind 또는 언어 코드가 던진 것인 `binding_core::Failure<E>`다.
  `core.failure: true`는 receiver가 보관한 언어 코드를 부르는 member(template `engine.render`)를 가리키며, 생성 코드는 그
  오류를 callback을 받는 member의 오류처럼 변환한다(GN-6d, GN-6z). 생성 코드는 그런 경로를
  `match … { Ok(value) => …, Err(error) => … }`로 부르고 그 밖의 경로는 그것 없이 부르므로, 코어와 맞지 않는
  `core.result`는 컴파일되지 않는다(I-2). `errors.kinds`가 코어 오류를 가리키지 않는 계약의 `core.result: true`는 이름을
  대고 거부한다. kind를 가리키지 않으면서 다른 저장소의 value alias나 value class를 받는 계약은
  `binding_core::Failure<()>`를 받는 함수 `failure_error`를 가진다. 소유자의 실패 함수가 언어 코드가 던진 것과 callback의
  실패를 이 함수에 넘기고, 이 함수의 kind는 어떤 member도 주지 않는 unit이므로 그 갈래는 kind `internal`이며, 그런
  crate에 없는 코어 오류 변환을 부르지 않는다(E-1c, GN-6x). 그 오류는 wildcard 없는 match로 kind의 category
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
  bytes이거나 그 optional이거나 `list<text>`이며, `list<text>`의 함수는 list 출력과 같이 text 항목의 아무 iterable을
  돌려준다(T-2). `raises`가 있는 property는 코어 오류 `E`의 `Result<T, E>`를 돌려주는 함수를 가리킨다. 생성 코드는 오류를
  만들 때 모든 property를 읽으므로, 그 함수의 `Err`는 변환에 실패한 property 값과 같이 코어가 돌려준 오류 대신 그 자신의
  kind의 오류로 일어난다. property의 `raises`의 각 변형은 `errors.kinds`의 kind이며 그 class는 raise하는 property를 가진
  오류 unit이 아니다. 그래서 오류 하나를 만드는 일은 다른 오류를 많아야 하나 만든다. 다른 변형은 이름으로 거부한다. Node addon은 그 클래스를 category의 여섯 클래스 뒤에 보관하고, PHP 확장은 `kind`,
  `status`, `errno`를 그 클래스가 상속한 category 클래스의 scope에서 읽고 쓴다. 실패하는 case의 생성 시험(B-4)은
  unit의 클래스를 정확한 클래스로 적는다. 행은 case의 kind로 찾으며 kind는 변형의 마지막 마디의 snake_case다(CK-22).
  다른 kind의 member, 다른 타입의 property, 이름이 `kind`·`status`·`errno`·`message`인 property,
  그 행의 category의 오류 unit을 가리키지 않는 `class`는 이름으로 거부한다(G-4). `library`가 있는 행(E-1b (a))은 GN-7c대로 생성한다. 루트가
  아닌 module의 오류 unit은 PHP에서는 그 module의 namespace에 있는 클래스이고(GN-10), Python에서는 `<root>.<module>`이
  import하는 `<root>._errors`의 클래스이며(GN-11), Node와 WASM에서는 module의 다른 이름과 같이 그 이름으로 entry가
  내보낸다. Go는 오류 unit을 module과 관계없이 패키지 `errors`에 GN-15d대로 생성한다. WASM은 오류 unit을 Node와 같이 생성한다: parent를 상속하는 ES 모듈의 클래스이며
  category의 클래스들 뒤에 모듈에 넘기고, 그 property는 모듈이 인스턴스의 읽기 전용 own property로 정의한다(GN-18).
- **GN-7b** 모든 바인딩 crate는 member가 `raises`에 적은 variant마다 그 member의 코어 경로가 돌려주는 코어 오류(`Failure<E>`의
  `E`)에 대한 단언 `const _: fn(&<error>) -> bool = |error| matches!(<scrutinee>, <pattern>);`을 둔다. 그 타입의 variant가
  아닌 경로는 컴파일되지 않는다(E-5, I-2). 한 계약의 모든 member는 E-1의 코어 오류 하나를 돌려주므로, 여러 member가 내는
  variant는 한 번 단언한다. scrutinee는 `error`이고, `errors.code`가 투영 함수를 적으면 `<투영>(error)`이다. 경로의 pattern은
  `<path> { .. }`이다. 중첩 경로 `<바깥>/<안쪽>`은 코어가 그대로 전달하는 의존 레포의 variant(E-1b (a))를 가리키고, GN-7c가
  그것과 그 pattern `<바깥>(<안쪽> { .. })`을 정하며, 그 kind는 `<안쪽>`의 마지막 마디를 snake_case로 쓴 것이다. 모든 target의 `core_error`
  match, 오류 unit의 property를 위한 두 번째 match(GN-7a), `in_raises`의 단언(U-7)은 같은 scrutinee와 같은 pattern을 쓴다.
  `errors.code`는 코어 오류가 code enum을 담은 구조체이고 `errors.kinds`가 그 code enum의 variant를 적을 때의 `{error, path}`다.
  `error`는 코어 경로가 돌려주는 타입이고, `path`는 생성 코드가 오류를 넘겨 부르는 투영 `fn(&E) -> &Code`(또는 `-> Code`)다.
  이때 kind의 오류 enum은 그 code의 enum(중첩이면 바깥 경로의 enum)이고, 하나를 생성한다. 이유: binding은 Rust 소스를 읽지
  않으므로 계약이 오류의 타입과 그 code를 주는 함수를 적는다.
- **GN-7c** 코어가 그대로 전달하는 의존 레포의 kind(E-1b (a)): `errors.kinds`의 행은 라이브러리와 경로 `<바깥>/<안쪽>`을 적는다.
  `<바깥>`은 그 라이브러리의 오류를 담은 이 레포 코어 오류의 variant이고, `<안쪽>`은 그 라이브러리 계약의 행이 적은 그 오류의
  variant다. member는 `raises`에 같은 경로를 적는다. 코어 오류의 모든 match(클래스, property)와 GN-7b의 단언은 GN-7b의 scrutinee에 pattern
  `<바깥>(<안쪽> { .. })`을 쓰므로, 바깥 variant가 그 안쪽 variant를 담지 않는 경로는 컴파일되지 않는다(I-2). category는 라이브러리
  계약에서 `<안쪽>` 행의 category이고, 클래스는 이 레포 E-2 표의 그 category 클래스이거나 행이 `class`에 적은 오류 unit이며, kind,
  status, errno는 자기 행처럼 코어 오류가 주는 것(`Kinds`)이다. 그런 kind를 내는 case의 생성 시험은 그 클래스로 쓴 GN-13의
  시험이다. `library`가 있는데 variant에 `<바깥>/`이 없는 행과, `library`가 없는데 variant에 그것이 있는 행은 이름을 대고 거부한다
  (G-4, CK-10). 이유: 코어 오류는 라이브러리의 오류를 자기 variant 하나 안에 담으므로, 안쪽 variant까지 내려가는 경로만이
  컴파일러가 코어 오류에 대해 검사하는 pattern을 준다(E-1b (a)).
- **GN-8a** 실패 주입(G-5, X-1): `faults`를 가진 계약에서 각 바인딩 crate는 `faults[].core`의 상수마다
  `const _: &str = <core>;`를 두어, 코어에 없는 점이면 컴파일되지 않게 한다(I-2). member의 모든 진입점은(hook과 iterate
  포함) 코어 호출을 `with_faults("<member id>", …)` 안에서, 작업 전체를 `shielded(…)` 안에서 실행한다. feature
  `fault-test`가 켜지면 `with_faults`는 시험이 이 스레드에서 그 member에 장전한 것을 꺼내고
  (`binding_core::fault::take`), 없으면 빈 장전을 꺼내, 코어 호출 동안 설치한다. `shielded`는 작업 동안 빈 장전을
  설치한다. 꺼지면 둘 다 받은 것만 실행한다. 장전은 코어 호출에만 걸린다: 진입점은 `with_faults`보다 먼저 인자를
  변환하고 place의 잠금을 잡는다(GN-6h). 그래서 코어에 닿기 전에 실패한 호출은(거부된 인자, kind `busy`) 장전을 그
  member의 다음 호출에 남긴다. iterate의 코어 호출은 순회 전체이며, 진입점은 그 항목을 `with_faults` 안에서 모은다.
  그래서 receiver나 인자를 만드는 호출은 시험 대상 member의 장전을 가져가지 않고, callback 안에서 다시 들어온
  진입점은 인자 변환을 포함해 바깥 장전을 보지 않는다. `machine`이 있는 member는 그 대신 machine의 wait마다
  `armed_future("<member id>", …)`로 장전한다(GN-6n). 그래서 member의 각 진입은 장전 하나와 shield 하나를 갖는다. Node와
  WASM의 `Driven` 객체의 `advance`(GN-6ab)는 자기 코어 호출이 없는 진입점이다. 언어 코드가 다른 member의 호출 안에서
  그것을 부를 수 있으므로 그 작업은 `shielded(…)` 안에서 돌고, 아무것도 장전하지 않는다. `_arm_faults(member, faults)`는 member id와 case `faults`의 JSON
  목록을 받아 장전 id를 준다. 장전되지 않는 목록(대상에 없는 errno 기호 등)은 이유를 담은 kind `internal`이다.
  `_fault_left(id)`는 주입되지 않은 fault의 점 이름을 준다. 모든 계약의 PHP 확장에는 모든 시험 빌드가 켜는
  feature `panic-test`(GN-5)에서 `Internal\errnoOf(symbol)`가 있다. 이것은 확장이 실행되는 기계에서 errno 기호가 갖는
  값을 fault를 장전하는 표(`binding_core::errno::value`, feature가 필요 없다)에서 읽어 주고, 그 기계에 없는 기호에는
  kind `internal`을 준다. PHP에는 그 기계의 errno 기호 표가 없으므로, Python과 Node가 그 값을 언어에서 읽듯이 PHP 시험은
  fault 주입점이 없는 계약에서도 그 값을 바인딩에서 읽는다. end-to-end 검사는 PHP 확장을 feature 없이 빌드하고,
  `llvm-nm`이 그 안에서 시험용 진입점(`panic_test`, `arm_faults`, `fault_left`, `errno_of`, `alias_in_`)을 찾으면 실패한다. 같은 검사가
  feature 없는 빌드에 `errno_of`도 B-7의 진입점 `panic_test`도 없음을 보인다. 둘 다 feature `panic-test`의 것이기 때문이다. 대기하는 member는 아직 생성하지 않으므로(GN-1) 장전은
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
  호출의 file, line, trace를 갖는다. startup은 무엇이든 등록하기 전에 라이브러리 클래스가 상속하거나 구현하는 PHP 클래스를 모두
  찾고, 엔진에 없는 클래스가 있으면 module 시작이 실패한다(startup이 실패를 돌려준다). 등록이 실패한 라이브러리 클래스도
  같다. 그래서 등록이나 호출이 읽는 클래스는 모두 있고, 확장은 없는 클래스 때문에 panic하지 않는다. `kind()`, `status()`, `errno()`는 private 속성을 읽는다. 모든 category 클래스는 공개 생성자 `__construct(string $message,
  string $kind, ?int $status = null, ?int $errno = null)`를 가지며 모든 오류 unit이 이를 상속한다. 그래서 PHP 코드는
  Python·Node·WASM 코드처럼 kind를 가진 오류를 만든다(GN-7a). 이 생성자가 없으면 kind는 그것을 선언한 클래스의 scope에서만
  적을 수 있는데, 그것은 공개 API가 아니다. 확장이 일으키는 오류의 객체는 생성자 없이 만든다(B-4). enum은 backed enum이다(T-6). PHP는 키워드나 타입 이름을 enum case 이름으로
  받지만 ext-php-rs의 매크로 `php_enum`은 `#[php(name)]`이 주는 이름까지 대소문자 없이 거부하므로, 그런 case는 뒤에 `_`를 붙인다
  (`Kind::Object_`, `Kind::List_`). backed 값은 계약의 값 그대로다.
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
  `bytes`, `str`이다. 그 밖의 key는 kind `invalid_argument_type`이고, map은 같은 `dict`로 나간다(T-2). `map<T>`는 key가
  `str`인 순서대로의 `dict`이며, 그 밖의 key는 kind `invalid_argument_type`이다. `polyspec`에는 `__init__.py`가 없다(P-1).
- **GN-12** Node: addon은 원시 값을 받는다(T-8). 생성된 CommonJS 진입점은 인자의 개수, 이름, options record member의 존재를
  확인하고(G-7, T-4), list parameter에서 문자열이 아닌 iterable을 배열로 바꾼다(T-7). 진입점은 로드될 때 라이브러리
  클래스를 addon에 넘기고 addon은 각각의 참조(napi `FunctionRef`)를 갖는다. 실패는 addon이 메시지, kind, status, errno로
  만든 그 클래스의 인스턴스이며 addon이 던진다(B-4). ESM 진입점은 CommonJS 진입점을 다시 내보내므로 둘은 클래스를 함께 쓴다.
  `map<T>`는 key가 문자열인 `Map`이고, `keyed_map<T>{key}`는 key가 계약이 적은 종류의 안전 정수나 문자열인 `Map`이다(T-2).
  타입의 모든 자리에서 그렇다: parameter, 반환, record의 field나 variant의 case의 field, 그리고 list, tuple, optional,
  다른 map의 항목. addon은 값을 판정하는 자리에서 `Map`을 읽는다: `Map`이 아닌 값(쌍의 배열, 일반 객체)은 kind
  `invalid_argument_type`이고, addon은 `Map`의 순서대로 항목을 받아 key마다 판정하며(안전 정수가 아닌 number key는 kind
  `invalid_number`(GN-12a), 그 밖의 key나 값은 kind `invalid_argument_type`), 코어가 준 항목으로 그 순서의 새 `Map`을
  만들어 돌려준다. 진입점은 그런 값을 그대로 넘긴다. 이유: 값은 타입을 아는 자리에서 변환되므로, 다른 타입 안의 map도
  전체가 map인 값과 같은 규칙을 따른다. `Map`이 정체성으로 비교하는 바이트 문자열 key는 모든 자리에서 이름으로
  거부한다(G-4).

- **GN-12a** 모든 target(T-1, CK-64): 바인딩이 인자, list·tuple·map·optional의 항목, record의 field로 받는 `int` 값은
  안전 정수 −(2^53 − 1)~2^53 − 1이고 `uint` 값은 0~2^53 − 1이다. 그 범위 밖의 정수는 Node와 WASM처럼 PHP, Python, Go에서도
  kind `invalid_number`다(B-2). Node와 WASM의 number는 더 큰 정수를 정확히 담지 못한다. 이유: 한 계약은 모든 target에서 같은
  결과를 주어야 하는데, 한 target이 받고 다른 target이 거부하는 정수는 결과를 둘로 만든다. `int64`는 모든 target에서 i64
  범위를 받는다. 계약이 `int` key를 나열한 `keyed_map`의 정수 key도 안전 정수다: 그 범위 밖의 정수 key와, Node·WASM에서
  정수가 아닌 number key는 모든 target에서 kind `invalid_number`다. 전에는 Node와 WASM이 `invalid_argument_type`을 냈다.
  계약이 나열하지 않은 종류의 key는 그대로 kind `invalid_argument_type`이다(T-2). 이유: 거부된 수는 모든 자리에서 B-2의
  kind를 가지므로, 같은 key는 모든 target에서 같은 kind를 준다.
  Node와 WASM: `int64` parameter는 i64 범위의 `bigint`나 안전 정수의 number를 받고, 그 밖의 값은 kind
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
  - Go는 member의 cgo 호출 안에서, 호출 goroutine의 OS 스레드에서 코어를 부르고, 코어가 돌아올 때 호출이 돌아온다(B-8).
    Go runtime은 cgo 호출을 막는 호출로 다룬다. goroutine은 호출이 돌아올 때까지 자기 스레드를 쥐고, runtime은 다른
    goroutine을 다른 스레드에서 돌린다. 그래서 기다리는 호출은 OS 스레드 하나를 쥐고 다른 goroutine을 멈추지 않는다.
    C ABI의 진입점은 코어를 부르기 전에 그 스레드에서 자기 자리의 lock을 잡고 결과를 변환할 때까지 쥔다(GN-6h).
    receiver가 `&self`이고 기다리는 member의 class는 `Shared`에 담기므로 두 goroutine이 한 객체 안에서 동시에 기다리고,
    어떤 호출이 그 객체 안에서 기다리는 동안 그 객체의 쓰기 자리가 필요한 호출은 kind `busy`로 실패한다. Go에는 함수의
    꼴이 하나뿐이므로 그 member는 기다리지 않는 member와 같은 이름과 결과를 갖고, 기다리면 안 되는 호출자는 goroutine을
    띄운다. 어떤 호출도 취소되지 않는다. token `Io`는 취소를 지니지 않고 타입 `cancel`은 생성하지 않으므로(GN-13)
    그 member는 `context.Context`를 받지 않는다.
  - WASM에는 그런 member가 없다. 계약이 그 member에 `wasm`이 없는 `only`를 준다(Q-4, CK-15).
  언어 코드에 닿는 `blocking_io` member는 GN-6q대로 생성한다. 기다리는 constructor·property·iterate·hook(N-4)은 이름을
  대고 거부한다. 언어에 그것을 기다리는 꼴이 없거나, 언어가 hook을 아무것도 기다리지 않는 자기 protocol로 부르기
  때문이다.
  `wait: process_wait`인 member(B-5 (b))는 다른 프로세스가 움직일 때까지 기다리므로, 그 기다림은 그 프로세스만큼 길 수
  있다. 그 member는 `Io` token의 자리에 `binding_core::ProcessWait::for_generated_call()`을 넘기고, 언어 코드에 닿는
  경우(GN-6q)를 포함해 `blocking_io`인 member의 형태를 갖는다. 다만 그 형태가 다른 호출과 함께 쓰는 pool의 thread에서
  기다리는 곳은 다르다:
  - Python: `a<name>`은 `<name>`을 자기 thread(`threading.Thread`)에서 돌리고, 그 thread는 결과나 예외를
    `loop.call_soon_threadsafe`로 실행 중인 loop의 future에 준다. `asyncio.to_thread`를 쓰지 않는다. 프로그램의 모든
    `to_thread`가 기본 executor의 thread를 함께 쓰며, 프로세스만큼 긴 기다림은 그 하나를 붙잡기 때문이다. 취소된 future는
    결과를 받지 않는다. `<name>`이 끝나기 전에 loop가 닫혔으면 `call_soon_threadsafe`는 그 thread에서 `RuntimeError`를
    낸다. thread는 `loop.is_closed()`가 참일 때에만 그 실패를 잡고 결과나 예외를 버린다. 닫힌 loop의 future를 기다리는
    것이 없기 때문이다. 다른 예외는 thread를 떠난다. 그 thread는 daemon thread가 아니므로 interpreter는 끝날 때 코어
    호출을 기다리고, 코어가 도는 동안 끝나지 않는다. 그런 member마다 생성된 시험은 loop가 닫힐 때까지 호출의 thread가
    시작하지 못하게 한 뒤 그것을 시작하고 join하며, 어떤 예외도 thread를 벗어나지 않았음을 요구한다
    (`threading.excepthook`).
  - Node: 코어 호출은 자기 thread(`std::thread`)에서 돌고, 그 결과나 오류는 JavaScript thread에서 promise를
    정한다(`Env::create_deferred`). libuv pool을 쓰지 않는다. 그 thread는 프로그램의 파일 시스템 호출과 DNS 호출이 함께
    쓰기 때문이다. 호출의 panic은 kind `internal`로 promise를 reject한다(B-7).
  - PHP, Python `<name>`, Go는 `blocking_io`처럼 호출한 thread에서 기다린다.
  - WASM에는 그런 member가 없다. 이것은 생성기의 빈틈이 아니라 그 target의 규칙이다. WebAssembly module에는 프로세스가
    없고 하나뿐인 thread를 막을 수 없으므로, 계약은 그 member에 `wasm`이 없는 `only`를 준다(Q-4, CK-15).
- **GN-6n** `wait: async_driver`인 member(I-2 (4))는 토큰을 받지 않는 코어의 `async fn`을 부르고, 생성 코드가 그 future를
  tokio runtime에서 돌린다. 그래야 tokio 위의 코어(redis-rs)가 자기에게 필요한 runtime을 찾는다. tokio runtime이 없는
  WASM은 그것을 JavaScript의 event loop에서 돌린다. 진입점은 GN-6m처럼 호출
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
  - Go는 PHP처럼 member의 cgo 호출 안에서, 호출 goroutine의 OS 스레드에서 `binding_core::driver::block_on`으로 future를
    돌린다. 그 스레드가 future를 poll하고, 코어가 시작한 task는 runtime의 worker 스레드에서 돌며, future가 끝날 때 호출이
    돌아온다. 그래서 goroutine은 GN-6m대로 자기 스레드를 쥔다. 진입점은 결과를 변환할 때까지 자기 자리의 guard를 쥔다.
    runtime은 process의 것이다. `block_on`이 그런 첫 호출에서 만들고 process가 끝날 때까지 산다. 어떤 객체도 그것을
    소유하지 않으므로 마지막 객체의 해제는 어떤 스레드도 멈추지 않고, 코어가 쥔 연결은 그것을 담은 코어 값의 drop이
    닫는다. GN-6m대로 어떤 호출도 취소되지 않는다.
  - WASM은 `wasm_bindgen_futures::future_to_promise`의 `Promise`를 돌려준다. 브라우저에서도 Node에서도 JavaScript의
    event loop가 모듈의 스레드에서 future를 poll하고, 끝나면 그 결과나 오류를 변환하므로 실패는 promise를 reject한다.
    WASM crate는 자기 `wasm-bindgen`과 `js-sys`를 고정한 release의 `wasm-bindgen-futures`에 의존하고 binding_core의
    driver에는 의존하지 않는다. WebAssembly 모듈에서는 tokio runtime이 돌지 않으므로, future가 그것을 필요로 하는 코어는
    거기서 그 코어가 주는 오류로 실패하며, 그런 member는 지원하는 target을 `only`에 적는다. poll의 panic은 모듈이 unwind하는
    곳에서는 kind `internal`이고, 모듈이 abort하는 곳에서는 인스턴스를 trap시킨다(GN-18). ES 진입은 Node처럼 async 함수다.
  GN-6m이 기다리는 member를 거부하는 자리에서는 `async_driver`인 member도 이름을 대고 거부한다. 언어 코드에 닿는
  `async_driver` member는 GN-6ab대로 생성한다. runtime이 자기 스레드에서 poll하는 future는 그 스레드에서 언어 코드를
  부르게 되기 때문이다.
  이유: 네트워크 protocol을 쓰는 코어는 async이고, 호출자의 것을 빌리지 않는 future는 runtime의 어느 스레드에서도 돌 수
  있다. 그동안 각 언어의 호출자는 자기 언어의 꼴로 기다린다.
- **GN-6o** 코어 receiver가 `self`인 method는 자기 객체의 코어 값을 소비한다(E-1a, B-5c). 그 receiver는 쓰기 자리이고, 생성
  코드는 class의 잠금(`binding_core::Exclusive`나 `Shared`의 `take`)에서 값을 꺼낸다. 그래서 호출 뒤에는 잠금에 값이 없다.
  코어가 실패해도 그렇다. 호출 때부터 값은 코어의 것이기 때문이다. 그 뒤 그 객체가 receiver나 parameter로 들어가는 모든
  자리는, 어느 인자도 코어에 닿기 전에 category `type`의 kind `consumed`로 실패한다(E-1a). 기다리는 member는 호출
  스레드에서 값을 꺼내 자기 작업이나 future로 옮긴다(GN-6m, GN-6n). G-5는 그런 member마다, 그것을 부른 뒤 같은 객체의
  다른 member를 불러 kind `consumed`로 실패하는지 보는 시험을 생성한다. 모든 target이 그것을 생성한다. Go와 WASM에서는
  객체가 수거될 때까지 class의 table이 비워진 lock을 그 객체의 handle 아래에 두므로, 그 handle의 뒤 자리는 kind
  `consumed`다. 이유: 호출 뒤 코어가 가진 값에는 그 객체로 다시 닿을 수 없고,
  kind가 호출자에게 객체가 왜 거부하는지 알려 준다.
- **GN-6p** `cleanup`이 있는 class unit(B-10)은 코어 receiver가 `self`(GN-6o)이거나 `&mut self`인 그 unit의 method를
  가리킨다. 다른 member는 이름을 대고 거부한다. `self`인 cleanup은 객체를 소비하고, 그 뒤 그 객체의 모든 사용은 kind
  `consumed`다(GN-6o). `&mut self`인 cleanup은 객체를 남긴다. 코어가 cleanup이 있었다는 것을 간직하고 그 뒤 각 member가
  무엇을 주는지를 자기 kind로 정하며, 호출자는 cleanup을 다시 부를 수 있다. 그래서 계약은 cleanup의 두 번째 호출이
  아무것도 하지 않는 case를 갖는다(CK-76). 그런 cleanup의 생성된 호출은 receiver의 쓰기 guard를 쥐었을 때, 코어를 부르기
  전에, 그 뒤 코어가 무엇을 주든 객체의 lock에 표시한다(`binding_core::Exclusive`나 `Shared`의 `clean`). 어느 target의
  소멸자도 cleanup member를 부르지 않는다. cleanup은 기다릴 수 있고(`blocking_io`) 소멸자에는 기다릴 자리가 없기
  때문이다. PHP는 어느 문장 안에서든 객체를 해제하고, Python과 Node는 interpreter가 막히면 안 되는 곳에서 finalize하며,
  Go runtime은 모든 cleanup 함수를 goroutine 하나에서 돌리고, `FinalizationRegistry`의 callback은 event loop의 task다.
  소멸 때의 해제는 token을 받지 않는 코어 타입의 `Drop`이고, 기다리는 cleanup은 기다리는 여느 member처럼
  불린다(GN-6m). 그래서 `cleanup`이 있는 class의 코어 타입은 cleanup이 불리지 않았을 때 cleanup member가 놓았을 모든
  자원을 자기 `Drop`에서 놓는다. 이것은 코어의 의무이며, 계약 검사는 Rust 소스를 읽지 않으므로 그것을 검증하지
  않는다(CK-76). binding crate는 그런 unit의 코어 타입이 `binding_core::Cleanup`을 구현하고, 다른 모든 class
  unit의 코어 타입은 구현하지 않는다는 것을 컴파일 때 단언한다(모호한 trait 구현이며, 타입이 그것을 구현하면 컴파일이
  실패한다). 정리 호출이 필요한 자원이 계약에서 빠지지 않게 하기 위해서다. 값이 소비되지 않았고 lock에 표시도 없는 객체가 사라지면 그
  소멸자가 코어 값을 drop하고, 그 `Drop`이 자원을 놓으며, 정리 호출이 없었다는 경고를
  `<Class> was destroyed without <cleanup>(), so its destructor released it (B-10)` 메시지로 낸다:
  - PHP는 객체가 해제될 때 `E_WARNING`을 낸다. PHP는 메시지 앞에 실행 중인 함수의 이름을 붙이므로(`php_error_docref`)
    B-10 시험은 그 메시지로 끝나는 메시지를 요구한다.
  - Python은 객체가 finalize될 때 `ResourceWarning`으로 경고한다. 소멸자는 자기가 도는 동안 던져지고 있는 예외(객체가
    실패한 호출의 임시 값일 수 있다)를 맡아 두었다가 경고 뒤에 다시 설정한다. 예외가 설정된 채 부른 경고 호출은 실패하기
    때문이다.
  - Node는 class가 finalize될 때 `process.emitWarning`으로 type `ResourceWarning`의 경고를 낸다.
  - Go: struct가 수거될 때 `runtime.AddCleanup`이 돌리는 함수(GN-15a)가 `<prefix>__release_<class>`로 값을 놓는다. 그
    함수는 lock이 아직 값을 쥐고 있었는지 답하고, 그렇다면 표준 logger의 `log.Print`로 경고한다. 프로그램은 그 출력을
    `log.SetOutput`으로 정한다. Go는 프로그램이 고르지 않는 때에 객체를 수거하고 프로그램은 그 전에 끝날 수 있으므로,
    정리 member가 그 class의 명시적 해제다. `Close` 같은 두 번째 member는 생성하지 않는다.
  - WASM: ES 모듈의 `FinalizationRegistry`의 callback(GN-18a)이 `__<Class>_free`로 값을 drop한다. 그 함수는 lock이 아직
    값을 쥐고 있었는지 답하고, 그렇다면 host에 `process.emitWarning`이 있는 곳(Node)에서는 Node binding처럼 그 함수와
    type `ResourceWarning`으로, 없는 곳(브라우저)에서는 `console.warn`으로 경고한다. engine은 그 callback을 끝내 돌리지
    않을 수 있으므로, 거기서도 정리 member가 명시적 해제다.
  G-5는 그런 unit마다, sample receiver로 객체를 만들고 정리 호출 없이 버린 뒤 경고를 요구하는 B-10 시험을 생성하고,
  PHP와 Python에서는 정리 member를 부르고 객체를 버린 뒤 경고가 없음을 요구하는 시험도 생성한다. PHP는 error handler
  아래에서 객체를 unset하고, Python은 `warnings.catch_warnings(record=True)` 아래에서 지우며, Node는 `gc()`를 켜고
  (`v8.setFlagsFromString('--expose-gc')`와 `vm.runInNewContext('gc')`) 그것을 부른 뒤 process의 `warning` event 가운데 메시지가
  자기 class의 경고인 것을 기다린다. 앞선 시험의 객체들이 같은 수거에서 경고하기 때문이다. WASM은 자기 시험 실행의 `gc()`로 같은 일을 한다. Go는 표준 logger의 출력을 각 메시지를 간직하고 결코 막히지
  않는 writer로 정한다. logger가 쓰는 동안 자기 lock을 쥐기 때문이다. 시험은 객체의 `weak.Pointer`를 얻고 `runtime.GC()`를
  한 번 부른 뒤, weak pointer가 여전히 객체를 주면 곧바로 실패한다. 수거가 남긴 객체의 cleanup은 돌지 않기 때문이다.
  그다음 자기 class의 경고가 나올 때까지 메시지를 읽는다. 그 경고는 수거된 객체의 cleanup이 쓰며, 앞선 시험의 객체들이
  그보다 먼저 경고할 수 있다. Node, WASM, Go에는 경고가 없음을 보는 시험이 없다. event가 없다는 것은 시간 제한으로만 볼 수 있기 때문이다. 소멸자가 읽는
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
  - Go는 GN-6m대로 호출 goroutine의 스레드에서 코어를 부르고, 코어는 그 스레드에서 export `<prefix>__go_callback`으로
    callback을 부른다(GN-15b). 그 스레드는 callback을 넘긴 스레드이므로 `thread: owner`인 callback은 기다리지 않는
    호출에서처럼 자기 스레드에서 불린다. 다른 goroutine을 기다리는 callback은 돌아올 때까지 자기 호출의 lock을 쥔다.
  - WASM에는 그런 member가 없다(GN-6m).
  Node에서 다른 스레드를 쓰지 않는 이유: napi의 callback 객체는 JavaScript 스레드에서만 유효하다. callback 호출마다
  thread-safe function으로 그 스레드에 넘기고 답을 기다리는 pool 스레드는 호출 내내 libuv pool의 스레드 하나를 잡고, JavaScript
  스레드가 그 pool을 기다리면 끝나지 않는다. 호출마다 언어 코드에 닿는지 판단하는 코어(`core.reaches`)가 있으면 닿지 않는
  호출은 pool에서 실행할 수 있다. 그것은 아직 생성하지 않는다. G-5는 그런 member에 대해 Python에서, 예외를 던지는
  callback(K-2)으로 `a<name>`을 `asyncio.run` 안에서 기다리고 callback의 예외를 요구하는 시험을 생성한다. 그래서 코어가
  `asyncio.to_thread`의 worker 스레드에서 부르는 callback이 그 스레드에서 실행됨을 본다.
- **GN-6af** `only`가 있는 unit(Q-4)은 `only`가 있는 member와 같이 그것이 적은 target에만 생성하고, 다른 target의
  바인딩·선언·시험에는 그 unit의 아무것도 없다. `core_type`이 없는 origin `value`의 class(U-1, T-5)는 받은 언어 값을
  보관하는 언어의 class이고, 그 뒤에 코어 값은 없다. 그 constructor는 `core`에 인자를 판정하고
  `Result<(), Failure<E>>`를 돌려주는 코어 함수를 적는다. 그 함수의 첫 parameter는 `&mut dyn HostValues`이고, 값 alias의
  parameter, 또는 값 alias의 list나 keyed map인 parameter는 바인딩이 기술하는 `HostValue`(그것들의 `Vec`이나
  `KeyedMap`)이며, 기본값이 있는 parameter는 그것의 `Option`이고 호출이 생략하면 `None`이다. 실패는 다른 member의
  실패와 같이 던진다(E-2). instance는 각 인자를 언어가 준 그대로 보관하고, 생략된 인자는 그 기본값을 언어의 값으로
  보관한다: `{literal: null}`은 언어의 null이고 `{empty: "map"}`은 새 빈 map(`Map`, `dict`)이다. 코어가 `None`을 받으므로
  이 기본값에는 `default_core`가 필요 없다. `core`가 없는 property는 같은 이름의 constructor parameter가 보관한 값을
  준다. 쓰기 가능한 property(U-1 `writable`)는 그 값을 바꾸기도 하며, 바꾼 값은 쓰이는 곳에서, 곧 member가 값 alias로
  그것을 읽을 때 판정된다. constructor가 받는 keyed map은 type이 적은 kind의 각 key를 코어에 주며, Node와 WASM의 byte
  string key는 `Uint8Array`다. instance는 `Map` 자체를 보관하므로, entry가 entry들로 `Map`을 만드는 곳에서 그런 key를
  거부하는 GN-12는 여기에 적용되지 않는다. Python은 native module에 값마다 field를 둔 class를 정의하고, Node와 WASM은
  JavaScript entry에 값마다 자기 열거 가능한 data property(property가 쓰기 가능하면 쓰기 가능)를 둔 class를 정의하며,
  인자는 addon이 판정한다. class를 적은 값 alias의 `in` 행(U-1)은 그 instance를 그 행의 kind를 가진
  `HostValue::Value`로 기술한다. 코어가 자기 각 위치에서 한 객체를 보도록, 코어의 한 walk 안에서 같은 instance의
  handle은 같다. `HostValues`의 `read`는 그 handle에 대해 행이 `read`로 적은 property를 준다: 보관한 값을 다시 기술한
  것, 또는 그 property의 코어 경로가 돌려주는 값(bool, 정수, float)이다. make가 `core_type`이 없는 class의
  constructor를 적은 `out` 행은 코어를 부르지 않고 instance를 만든다: `object`나 `map`은 그 entry들의 map이고
  `reference`는 그것이 담은 값이며, 이 값은 쓰기 가능한 property가 보관한다. instance는 내용보다 먼저 만들어지고 그
  handle의 모든 위치에서 같은 instance다(U-7 (d)). Python, Node, WASM, Go가 이 class를 생성하며, Go는 GN-15c가 적은
  대로 생성한다. PHP는 자기 `stdClass`와 reference를 받으므로(GN-6e) 그런 class를 생성하지 않는다. 이것은 그 target의
  규칙이며 생성기의 현재 상태가 아니다. 그래서 계약 검사는 그런 class가 PHP가 없는 `only`를 적기를 요구한다(CK-78). PHP는 형식 `php_object`를 entry들을 property로 가진 새
  `stdClass`로 만들고, 각 이름은 그 key의 바이트이며 어떤 바이트든 담을 수 있다. 형식 `php_reference`는 만든 값을 값으로
  가진 새 reference로 만든다. bytes인 배열 key는 그 바이트의 문자열 key다. 객체와 reference는 내용보다 먼저 만들어지고
  그 handle의 모든 위치에서 같은 객체나 reference이므로, 그것들을 지나는 순환도 만들어진다. 값인 배열은 자기를 만드는
  중에 다시 나오면 여전히 kind `internal`이다.
- **GN-6ag** origin이 `host`인 unit(U-1: class, functions unit, record)은 레포가 손으로 쓰는 코드이고, 그 소스가 선언이다(I-1, L-3).
  생성기는 어느 target에도 그것을 쓰지 않는다. 진입점, 변환, 선언, 다시 내보내기, 생성 시험이 없고, 계약 검사는 그 case를
  요구하지 않는다(CK-22). host 패키지가 자기 진입점으로 그것을 내보낸다(L-2a). host unit은 생성 unit을 parameter로 받는다(설계의
  U-2: 생성 unit에 대한 host 동작은 host functions unit의 함수다). 타입에 host unit을 적는 생성 unit은 이름을 대고 거부한다(G-4).
  바인딩은 자기가 생성하는 타입만 변환하기 때문이다. 이유: host 코드가 바인딩을 부르고 바인딩은 host 코드를 부르지 않으므로,
  host unit을 생성한 사본은 그 소스와 달라질 수 있는 두 번째 선언이 된다.
- **GN-6r** internal unit(U-1, `visibility: "internal"`)은 같은 kind의 public unit과 같은 변환, 거부, 생성 시험으로 생성하고,
  각 언어는 그것을 공개 API가 아니라고 표시한다.
  - PHP: stub에 있는 그 선언마다 docblock에 태그 `@internal`을 둔다.
  - Python: 그 이름은 어느 `__all__`에도 없으므로 `<root>`가 다시 내보내지 않는다. 루트 module의 이름은 `<root>._root`에,
    module `m`의 이름은 internal 이름만 담은 module `<root>._m`에 있고, 생성 시험는 그 자리에서 부른다.
  - Node와 WASM: 그 선언마다 JSDoc에 태그 `@internal`을 둔다. 선언을 `stripInternal`로 만드는 패키지는 그것을 뺀다.
  - Go: 그 선언마다 doc comment가 문장 `It is internal to <library> (U-1) and is no public API.`로 끝난다. Go에는 한
    module만 쓰는 export 이름을 나타내는 표시가 없기 때문이다.
  internal unit의 member는 모두 그 unit과 함께 internal이다. public unit의 internal member는 이름을 대고 거부한다(G-4).
  그 꼴이 언어마다 다르고 아직 그런 member를 가진 계약이 없기 때문이다. 계약 검사는 internal unit의 이름을 public unit의
  이름처럼 판정한다(CK-23). 생성된 코드가 그 이름을 선언하기 때문이다. 이유: 레포의 코드(host, 명령 도구, case)는
  internal unit을 public unit처럼 바인딩으로 부르고, 패키지 사용자는 그것을 API가 아니라고 읽는다(U-1, P-3).
- **GN-6s** parameter인 다른 레포의 callback unit(T-3, U-3): 바인딩은 이 레포의 callback unit처럼 언어 객체를 그 unit의 코어
  trait(그 `core`)의 구현으로 감싼다. 객체가 들어올 때 member를 확인하고(kind `invalid_callback`), `thread: owner`가 적용되며, 각
  trait method는 그 언어의 API로 언어 객체의 method를 부르므로, 바인딩은 다른 바인딩의 native 객체를 꺼내지 않는다. trait
  method는 소유 레포 코어 오류의 실패(`binding_core::Failure<<소유 오류>>`, 소유 계약 `errors.kinds`의 오류 enum 하나)를 돌려주고,
  언어 코드의 예외는 `Failure::Raised`이며 이 레포의 코어가 그것을 넘긴다. 바인딩은 그 unit의 타입을 선언하지 않는다. 선언은 소유
  패키지의 타입을 적고(PHP는 그 namespace의 interface, Python은 `<소유 root>._types`의 Protocol, Node는 소유 npm 패키지가 내보내는
  타입, WASM은 그 패키지의 subpath `./wasm`이 내보내는 타입, Go는 go.mod가 요구하는 소유 Go module 안에서 그 unit의 module에 해당하는
  package의 interface), 사용자는 그 타입을 구현한다. Go는 이 레포의 callback unit의 dispatch를 그 unit의 package에 쓰듯이, member의
  인자를 decode하고 Go 값의 method를 부르는 그 unit의 dispatch를 그 unit을 받는 member가 있는 각 package에 쓴다. 그 자리의 case 값은
  소유 타입의 method를 가진 callback fixture이거나, make member가 돌려주는 class가 주는 instance 값이며, 이 레포의 case와 같다(G-5,
  GN-6aa, GN-13f). 그런 unit의 이름은
  이 계약의 어느 unit 이름과도 다르며, 같으면 생성기가 이름을 대고 거부한다(G-4). 아직 생성하지 않으며 각각 이름을 대고 거부하는
  것(G-4): 소유 레포의 member가 만드는 case 값(그
  member의 `new`, GN-13f)이며 그 생성 시험는 그 이유로 실패한다(GN-13). PHP 확장은 소유 패키지의 확장에 대한 module
  의존(`ZEND_MOD_REQUIRED`)을 선언하지 않으므로, PHP 설정이 그 확장을 먼저 불러온다. 생성기는 이것 때문에 거부하지 않는다. 이유: 다른 바인딩의 native 객체는 다른 module 안에 있으므로, 이 레포의 바인딩은 언어가 모든 객체에 주는
  method로만 그것에 닿을 수 있다(T-3).
- **GN-6ab** 언어 코드에 닿는(GN-6q: parameter의 타입이나 receiver의 class가 언어 코드를 지닌다) `wait: async_driver`
  member는 `core`에 `"machine": true`를 적고(CK-68), 그 코어 경로는 future 대신 I/O 없는 state machine을 돌려준다(c6
  6.2). 그것은 인자를 소유하는 `binding_core::machine::Machine`의 값이므로 코어 경로는 각 인자를 값으로 받는다. callback은
  생성된 struct(`impl <Trait> + 'static`)로, text는 `String`으로 받고, class parameter는 빌림 `value`일 때만 받는다(GN-6h).
  기본값이 있는 parameter는 이름을 대고 거부한다(G-4). `resume(io)`는 마지막 기다림의 출력(처음과
  call 뒤에는 `None`)으로 machine을 진행시키고 한 단계를 준다:
  - `Step::Io(future)`: 언어 코드에 닿지 않는 코어의 future. driver는 그것을 tokio runtime에서 poll하고 그 출력을 다음
    `resume`에 준다;
  - `Step::Call`: driver는 언어 코드를 소유한 스레드에서 machine의 `call()`을 부르고, machine은 거기서 callback(U-3)을
    부르거나 `Native` 값에 닿는다;
  - `Step::Done(result)`: member의 결과. member가 실패할 수 있으면 `Result<T, Failure<E>>`다(E-1c).
  member의 fault는 GN-6n처럼 각 Io future의 poll 둘레에 설치한다. 각 언어는 자기 꼴로 machine을 돌린다:
  - PHP는 호출 스레드에서 `binding_core::machine::drive`로 machine을 돌리고, 그것은 각 Io future를
    `binding_core::driver::block_on`에서 기다리므로 callback은 그 객체의 스레드에서 돈다.
  - Python: `<name>`은 PHP처럼 machine을 돌리고 각 Io future를 `py.detach`에서 기다리므로, 기다리는 동안 다른 Python
    스레드가 돈다. `a<name>`은 GN-6m처럼 `<name>`을 `asyncio.to_thread`에서 돌린다. callback은 machine을 돌리는
    스레드에서 GIL을 쥐고 불린다. Python 참조는 스레드가 아니라 GIL에 묶이므로 GN-6q가 이를 허용한다.
  - Node: 진입은 JavaScript 스레드에서 machine을 만들고 addon의 `Driven` 객체를 돌려주며, async 함수인 JavaScript
    진입은 machine이 끝날 때까지 그 `advance(settled)`를 부른다. 각 advance는 마지막 기다림의 출력을 machine에 주고,
    JavaScript 스레드에서 machine의 call을 하며, `[step, value]`를 돌려준다. Io future에 대해서는 `[0, promise]`이고,
    그 future는 napi의 tokio runtime에서 돌며 진입이 그 promise를 기다린다. machine이 기다리는 값에 대해서는
    `[1, value]`이고(GN-6ae), 끝에서는 JavaScript 스레드에서 변환한 `[2, result]`다. member의 실패는 advance에서
    던져지고 진입의 promise를 reject한다.
    machine은 그것을 만든 호출보다 오래 살므로, machine이 소유하는 callback은 생성된 struct `Owned<Callback>`이다. 그것은
    객체에 대한 napi 참조(`napi_ref`)와 JavaScript 스레드의 환경을 지니고, 각 호출에서 그 둘로 빌린 callback struct를
    만들며, drop될 때 참조를 지운다. drop은 `Driven` 객체가 끝나는 JavaScript 스레드에서 일어난다.
    machine이 소유하는 callback의 예외는 환경에서 꺼내어(`napi_get_and_clear_last_exception`) 그 `Raised`의 key 아래에
    `Owned`(GN-6ae)로 보관한다. machine은 그 호출 뒤에도 계속 진행하고, pending으로 남은 예외는 그 advance에서 뒤따르는
    Node-API 호출, 예를 들어 다음 Io future의 promise를 만드는 호출을 실패시키기 때문이다. `failure_error`가 보관한 값을
    다시 던지므로 호출자는 같은 객체를 받는다. callback이 error unit으로 인식하는 예외(U-3)는 그 kind의 core error이며
    보관하지 않는다.
    machine이 없는 member의 callback도 callback을 부르는 곳에서 예외를 같은 방식으로 보관한다. 코어는 `Raised`에
    응답하고 값을 돌려줄 수 있는데(U-3), 환경에 pending으로 남은 예외는 코어가 실패를 돌려주지 않았어도 그 호출을 그
    예외로 끝내기 때문이다.
  - Go는 PHP처럼 C ABI 호출 안에서 `binding_core::machine::drive`로 machine을 돌린다. 호출한 goroutine은 C ABI의 모든
    호출처럼 그 호출 동안 자기 스레드를 쥐고, 각 Io future는 `binding_core::driver::block_on`에서 기다리며, Go callback의
    각 호출은 어느 스레드에서나 할 수 있는 cgo를 거친다(c6 6.4). 그래서 callback은 그것을 넘긴 스레드에서 불린다(GN-6q).
  - WASM: Node처럼 진입은 모듈의 스레드에서 machine을 만들고 모듈의 `Driven` 객체를 돌려주며, async 함수인 ES 진입은
    machine이 끝날 때까지 그 `advance(settled)`를 부른 뒤 그것을 해제한다. 각 advance는 마지막 기다림의 출력을 machine에
    주고, 모듈의 스레드에서 machine의 call을 하며, Io future에 대해서는 GN-6n의 promise인 `[0, promise]`를, machine이
    기다리는 값에 대해서는 `[1, value]`를(GN-6ae), 끝에서는 `[2, result]`를 돌려준다. 두 곳 모두 JavaScript의 event loop가 모듈의 스레드에서 각 Io future를 poll하고 tokio
    runtime은 쓰지 않으므로, 브라우저와 Node는 같은 단계를 밟는다.
  `machine`이 있는 method는 receiver의 clone을 받고, 함수 타입의 parameter와 결과 `passthrough`를 생성하며,
  `async_allowed: true`인 함수는 기다린다. GN-6ae가 적는 대로다. `core.reaches`(c6 6.3)는 아직 생성하지 않는다(G-4). 이유: runtime이 자기
  스레드에서 poll하는 future는 그 스레드에서 언어 코드를 불러 Node나 PHP 참조의 owner를 어기고, `async_driver`인 다른
  member를 부르는 callback은 runtime 안에서 `block_on`을 돌리게 되는데 tokio는 이를 거부한다. I/O 없는 machine이면 각
  단계를 어디서 돌릴지는 각 언어의 runtime이 정하고, 코어는 자기 I/O를 tokio에 둔다.
- **GN-6ae** `machine`이 있는 member(GN-6ab)는 method일 수 있고, 함수 타입(T-2)의 parameter를 받고 `passthrough`를
  돌려줄 수 있다. transaction의 범위가 이것을 필요로 한다: member는 그 machine이 만든 class 인스턴스로 언어 코드를
  부르고, 그 코드가 돌려준 것을 돌려준다. 결함 86. 반환이 `passthrough`인 함수 타입이 이 규칙의 함수이고 `machine`이 있는
  member에 속한다. 그 밖의 함수 타입은 코어가 보관할 수 있는 GN-6z의 값이며, 그것을 받는 `machine` member는 이름을 대어
  거부한다. machine은 자기 함수가 돌려준 것을 `Passthrough`로 settle하기 때문이다. case는 이 규칙의 함수를 함수 fixture로
  주고 GN-6z의 값을 그 행으로 준다(CK-22).
  - Receiver: `machine`이 있는 method는 receiver `&self`를 적고, 생성 코드는 인스턴스가 쥔 값의 clone, 곧 인스턴스의
    lock이 주는 borrow(GN-6h)의 `Clone::clone(<receiver>)`을 인자보다 앞에 값으로 코어 경로에 주므로 코어 경로는 `self`를
    받는다. class의 코어 타입은 clone들이 한 상태를
    나누는 handle로 `Clone`을 구현하므로, machine은 쓰는 것을 소유하고 인스턴스는 machine이 도는 동안에도 언어 코드에서
    쓸 수 있다. `&mut self`와 `self`는 `machine`과 함께 이름을 대고 거부한다(CK-69). clone은 인스턴스에 다시 쓰지도,
    인스턴스를 소비하지도 않기 때문이다.
  - 함수 parameter: 코어는 코어 경로에서 generic인 closure `FnMut(<arguments>) -> Result<binding_core::Passthrough,
    Failure<E>>`를 받고, 생성 코드는 그것을 언어 함수(Python callable, Node와 WASM `Function`, PHP `callable`, 생성된
    signature의 Go `func`)로 만든다. machine은 그것을 `Machine::call`에서만, 언어 코드의 스레드에서 부른다(GN-6ab).
    closure는 각 인자를 내보내 변환한다: class 인자는 machine이 만든 코어 값이고, 생성된 class의 새 인스턴스가 된다
    (`db.transaction`이 만드는 `tx`). closure는 함수를 부르고, 함수가 돌려준 값을 `Passthrough`로, 함수의 예외를
    `Failure::Raised`로 준다. 코어는 그것에 rollback으로 답한 뒤 돌려줄 수 있고, 그러면 호출자는 같은 예외 객체를 받는다.
  - `passthrough`: `binding_core::Passthrough`는 언어 값을 변환하지 않고 binding의 table(B-3)에 쥔다. 코어는 그것을
    옮기기만 하고 읽지 않는다. member의 결과 `passthrough`는 그 값을 그대로 언어 코드에 돌려주며, 코어가 버린
    `Passthrough`는 그 값을 놓는다. `Passthrough`는 `Send`가 아니다. table은 언어 코드의 스레드에 묶여 있어서, 다른
    스레드에서 끝난 값은 거기서 아무것도 놓지 못하고 table에 남기 때문이다. table의 handle은 다시 주지 않는 수이므로, 놓은 값의 handle은 어떤 값도 가리키지 않고 다른 값을
    가리키는 일도 없다. handle이 값을 가리키지 않는 결과는 kind `internal`이다.
  - `Raised`: `Raised`는 그것의 마지막 drop이 해제한다. GN-6u가 `Raised`가 쥔 `Native`에 대해 정한 대로다. 코어는
    `Raised`에 응답하고 그것을 drop할 수 있다. rollback한 뒤 다른 실패를 반환하는 scope가 그렇다. 던져진 것은 그 drop에서
    binding의 table을 떠나며, 어느 스레드에서든 그렇다. table의 스레드에서 일어난 drop은 항목을 바로 제거한다. 진입점이
    기다리는 동안 코어가 자기 스레드에서 Python이나 Go의 callback을 부르는 경우처럼 다른 스레드에서 일어난 drop은,
    Python과 Go에서는 table의 mutex 뒤에서 항목을 제거하고, Node와 PHP에서는 그 key를 그것을 보관하는 스레드의 대기열에
    넣는다. 그래서 어느 진입점도 자기 호출의 `Raised`를 기록하지 않고, 여러 진입점이 advance하는 Node와 WASM의 machine도
    그 목록을 보관하지 않는다. machine의 함수는 callback이 쓰는 함수(`thrown`)로 `Raised`를 만들고, `failure_error`는
    `Raised`의 key로 던져진 것을 table에서 꺼낸다. feature `thrown-count-test`(GN-5)의 진입점은 table의 항목 수를 준다.
    Node와 PHP에서는 대기열의 key를 제거한 뒤의 수다. callback이나 함수 타입을 받는 member의 case마다 생성된 시험은
    그 case의 호출과 `after`의 호출 뒤에 그 수가 0일 것을 요구한다. Go에서 그 수의 시험은 build tag
    `polyspec_thrown_count_test`를 가진 `zz_generated_thrown_count_test.go`에 있고, 그런 case마다 호출을 다시 실행한다.
    실패를 주입하는 case는 `polyspec_fault_test`도 필요한 `zz_generated_thrown_count_fault_test.go`에 있다.
  - PHP: parameter는 `callable`을 받고(`is_callable`. 다른 값은 kind `invalid_callback`이다), stub에는
    `@param callable(<parameters>): mixed`로 선언하며, 결과는 `mixed`다. closure는 callable의 참조를 쥐고
    `ZendCallable`로 부른다. 그 코드의 예외는 executor에서 꺼내 U-3의 `Raised`로 쥐므로 `failure_error`가 같은 객체를
    다시 던진다. 값의 table은 handle에서 `Zval`로 가는 thread-local map이다. release 함수는 값을 table에서 꺼내고 table을
    놓은 뒤에 값을 끝낸다. PHP 값의 destructor가 binding으로 다시 들어오는 PHP 코드를 돌릴 수 있기 때문이다.
  - Python: parameter는 callable을 받고(`callable()`. 다른 값은 kind `invalid_callback`이다), `_native.pyi`에는
    `Callable[[<parameters>], object]`로 선언하며, 결과는 `object`다. closure는 callable의 참조를 쥐고, machine이 그것을
    부르는 스레드의 GIL로 부른다(`Python::attach`). 그 코드의 예외는 U-3의 `Raised`로 쥐므로 호출자는 같은 예외 객체를
    받는다. 값의 table은 handle에서 `Py<PyAny>`로 가는 thread-local map이다. machine은 시작부터 끝까지 그 호출의
    스레드에서 돈다. `<name>`은 호출자의 스레드에서, `a<name>`은 그 worker 스레드에서 돈다. 그래서 값은 한 스레드의
    table에 들어가고 나오며, 놓은 값은 GIL을 쥐고 끝난다. 함수가 awaitable을 돌려줄 수 있는 member에는 진입
    `_<name>_on_loop(<event loop>, /, <parameters>)`가 있다. `<name>`은 loop 없이 그것을 부르고, `a<name>`은 호출자의
    돌고 있는 event loop와 함께 그것을 `asyncio.to_thread`에서 돌리는 coroutine이다. driver는 함수가 돌려준 값마다
    `inspect.isawaitable`을 묻는다. awaitable이 아닌 값은 곧바로 settle한다. awaitable은 coroutine으로 감싸
    `asyncio.run_coroutine_threadsafe`로 그 loop에 주고, worker 스레드는 그 future의 결과를 기다리며 그 대기는 GIL을
    놓는다. loop가 없으면 coroutine을 닫아 Python이 기다리지 않은 coroutine을 경고하지 않게 하고, 호출은 kind
    `invalid_callback`으로 실패한다. 두 coroutine 함수는 crate가 처음 필요할 때 자기 소스로 만드는 module이다. Rust
    코드는 `async def`를 쓰지 못하기 때문이다.
  - Go: parameter는 생성된 signature의 Go `func`, 곧 `func(<parameters>) (any, error)`이고, 결과 `passthrough`는
    `any`다. Go의 method에는 type parameter가 없기 때문이다. nil `func`는 kind `invalid_callback`이다. 함수는 호출의
    callback(GN-15b)으로, 곧 호출의 handle(`cgo.Handle`)과 그 안의 index로 들어가고, C ABI의 closure는 모든 Go
    callback의 trampoline인 export `<prefix>__go_callback`으로 그것을 부른다. 함수는 member의 goroutine에서, 그
    스레드에서 돈다: goroutine은 C ABI 호출 동안 그 스레드를 쥐고, `machine::drive`는 machine의 각 call을 거기서 하며
    (GN-6ab), Go는 export된 함수를 그것을 부른 스레드에서 돌리므로, 어떤 `Passthrough`도 그것을 만든 스레드를 떠나지
    않는다. 함수의 dispatch는 각 인자를 풀고(class 인자는 closure가 쓴 handle을 감싼 새 인스턴스다, GN-15a), 함수를
    부르고, 함수가 돌려준 것을 package `binding`의 table에 쥔다: mutex 뒤에서 handle에서 값으로 가는 map이고, 그
    `Passthrough`가 끝날 때까지 garbage collector가 값에 닿을 수 있게 하며, handle은 table의 수다. closure는 그
    handle의 `Passthrough`를 만든다. 그 release 함수는 export `<prefix>__go_release_passed`로 값을 지우며, 어느
    스레드에서든 그렇게 한다. Go 값은 스레드에 묶이지 않기 때문이다. 결과 `passthrough`는 그 handle로 C ABI를 건너고,
    member는 값을 table에서 꺼낸다. 함수가 돌려준 `error`는 호출이 index로 쥐고 U-3의 `Raised`가 되므로(GN-15b),
    member는 같은 error 값을 돌려준다. 함수의 panic은 callback의 method의 panic처럼(GN-15b) 호출이 recover한다. C ABI의 frame을 지나 unwind하는
    panic은 코어의 destructor, 곧 그 guard와 machine의 것을 건너뛰기 때문이다: 호출은 panic의 값을 `Raised`로 쥐고,
    코어는 error일 때처럼 끝나며, member는 C ABI 호출이 돌아온 뒤 같은 값으로 panic한다.
  - Node: parameter는 함수를 받고(`typeof`가 `function`인 값. 다른 값은 kind `invalid_callback`이다), 선언은 각
    `passthrough`를 member의 타입 parameter로 이름한다. `transaction<T>(work: (arg0: Scope) => T):
    Promise<Awaited<T>>`다. 진입이 async 함수여서 그 promise는 thenable인 결과의 상태를 따르기 때문이다. machine은 그
    함수를 `Owned`(GN-6ab)로 소유하고, 그 napi 참조는 `Driven` 객체가 끝나는 JavaScript 스레드에서 지워지며, closure는
    `napi_call_function`으로 receiver `undefined`와 함께 함수를 부른다. table의 값과 예외의 `Owned`는
    그 값을 배열의 한 원소로 쥔다. Node-API 버전 8은 객체, 함수, symbol에만 참조를 만드는데 함수는 어떤 값이든
    돌려주고 던지기 때문이다. 함수의 예외는 환경에서 꺼내(`napi_get_and_clear_last_exception`) 그 `Raised`의 key
    아래에 그런 `Owned`로 쥔다. machine은 call 뒤에도 계속되고, 예외가 걸려 있는 동안에는 Io future의 promise를 만들
    수 없기 때문이다. `failure_error`가 쥔 값을 다시 던지므로(`napi_throw`) 호출자는 같은 객체를 받는다. 값의 table은
    handle에서 `Owned`로 가는 thread-local map이다. release 함수는 그 항목을 지우고, 항목의 drop이 참조를 지운다.
    Await: advance의 `[1, value]`는 `Step::Await`의 값이고, 그 값은 table을 떠난다. JavaScript 진입의 함수 `drive`는
    thenable이 아닌 값까지 그것을 기다리고, 그 결과를 다음 advance에 `settled`로 준다. `[true, <값>]`이거나
    `[false, <거부>]`다. 그 advance는 값을 다시 table에 넣거나 거부를 `Raised`로 쥐고, machine이 resume하기 전에
    `Driving::settle`을 부른다. `settled`는 시작할 때와 기다림 뒤에는 `undefined`이고, machine이 값을 기다리지 않는데
    결과를 받거나 값을 기다리는데 결과를 받지 못한 advance는 kind `internal`이다. `drive`는 Io future의 promise와
    기다리는 값을 값이 아니라 그것을 돌려준 advance의 step으로 가른다. step `0`의 promise의 거부는 binding의
    실패(poll의 panic, kind `internal`)이고 `drive`가 잡지 않으므로, 진입의 promise를 reject하고 machine은 다시
    advance되지 않는다. step `1`의 값의 거부는 함수의 결과이고 machine으로 가며, 그 뜻은 코어가 정한다.
  - WASM: parameter는 함수를 받고(다른 값은 kind `invalid_callback`이다), 선언은 Node의 것과 같다. machine은 그 함수를
    `js_sys::Function`으로 소유한다. 그것은 ES 진입이 `Driven` 객체를 해제할 때까지 사는 모듈의 값이다. closure는 모듈의
    스레드에서 `apply`로 receiver `undefined`와 함께 함수를 부른다. 함수의 예외는 그 호출이 모듈에 돌려주는 값이고(import가
    그것을 잡는다, GN-18b), 그 `Raised`의 key 아래에 두므로 호출자는 같은 값을 받는다. 값의 table은 handle에서
    `JsValue`로 가는 thread-local map이고, release 함수는 그 항목을 지운다. Await: Node처럼 advance의 `[1, value]`는
    `Step::Await`의 값이고 그 값은 table을 떠난다. ES 모듈의 함수 `drive`는 thenable이 아닌 값까지 그것을 기다리고
    `[true, <값>]`이나 `[false, <거부>]`를 다음 advance에 준다. 그 advance는 값을 다시 table에 넣거나 거부를 `Raised`로
    두고, machine이 resume하기 전에 `Driving::settle`을 부른다. machine이 값을 기다리지 않는데 결과를 받거나 값을
    기다리는데 결과를 받지 못한 advance는 kind `internal`이다. `drive`는 Node처럼 Io future의 promise와 기다리는 값을
    advance의 step으로 가른다. step `0`의 promise의 거부는 진입의 promise를 reject하고, machine은 다시 advance되지 않고
    해제된다. 각 advance는 `state.mjs`를 거친다(GN-18). 함수가 모듈의 member를 다시 부르는 advance도 그렇다.
  - `async_allowed: true`: 함수는 awaitable을 돌려줄 수 있고, machine은 call 뒤에 `Step::Await(Passthrough)`로 그것을
    driver에 준다. driver는 다음 `resume` 전에 그 결과를 `Machine::settle(Result<Passthrough, Raised>)`에 준다. Node와
    WASM은 아래 각 항목이 적는 대로 JavaScript 진입에서 그 값을 기다린다. Python: `a<name>`은
    worker 스레드에서 `asyncio.run_coroutine_threadsafe`로 호출자의 event
    loop에서 coroutine이나 다른 awaitable을 기다리고, `<name>`은 호출자의 event loop가 돌지 않으므로 awaitable 결과를
    `a<name>`을 이름하는 message의 kind `invalid_callback`으로 한다. PHP와 Go에는 awaitable이 없다: driver는 값을 곧바로
    settle하므로 PHP나 Go 함수는 그 결과를 돌려준다.
  - Case: 함수 타입의 인자는 함수 fixture `{"function": {"calls": [<step>], "result": <case value>}}`이거나 `"result"`
    대신 `"raise"`를 가진다. 생성된 함수는 인자에 각 단계 `{"on": "<위치>", "call": "<member id>", "args":
    {...}}`를 차례로 하고(`on`은 parameter의 위치 `"0"`, `"1"`, ...이며(CK-22), 단계의 함수 타입 인자는 다시 함수 fixture다). `result`를 적은 단계는 그 호출이 그 값을 돌려줄 것을 시험의 단언으로
    요구하고(CK-22), 그 단언의 실패는 함수의 예외다. 함수는 그 뒤 `result`를 돌려주거나 `raise`의 오류 unit을
    던지거나(GN-13), `"raise": "exception"`이면 언어의 예외를 던지며, case는 그것을 `raises: "callback"`으로 기대한다.
    `after`(CK-22)는 호출 뒤의 receiver를 관찰하므로, case는 commit, 던진 뒤의 rollback, 중첩된 범위를 보인다.
    `"awaits": true`(CK-22)가 있는 fixture는 awaitable을 돌려주는 함수다. Python은 `async def`, Node와 WASM은 `async`
    함수이고, 그 step은 binding이 awaitable을 기다릴 때 돌며 `result`나 `raise`는 그 awaitable의 결과다. 그런 함수의
    step은 기다리는 member의 호출을 기다리고(Python은 `await <인자>.a<name>(...)`), 그 case의 Python 시험은 event
    loop에서 `a<name>`을 부른다. PHP와 Go에는 awaitable이 없으므로 거기서는 같은 fixture가 보통 함수이고 driver가 그 값을
    곧바로 settle한다. 표시가 있는 case는 다섯 target에서 돌고 각 target에서 같은 결과, 예외, `after`를 요구한다.
  다섯 target이 그 member를 생성한다. PHP와 Python 시험은 함수 fixture, 같은 예외 객체를 요구하는 `raises: "callback"`
  case의 시험, `after`의 호출, callable이 아닌 값이 kind `invalid_callback`이라는 시험을 쓴다.
  Python의 함수 fixture는 시험 module의 함수다. lambda는 문장을 갖지 못하기 때문이다. Python 시험은 또
  awaitable을 돌려주는 함수를 받은 `<name>`이 `a<name>`을 이름하는 message의 kind `invalid_callback`일 것을 요구한다.
  Go 시험은 함수 fixture를 각 단계가 그 error를
  돌려주는 `func`로 쓰고, `result`를 적은 단계는 호출이 다른 값을 돌려주면 그 member를 이름하는 error를 돌려준다.
  `"awaits": true`가 있는 fixture도 같은 `func`다. Go 시험은 `raises: "callback"` case의 시험(그 `func`는 시험이 쥔 error 값을 돌려주고 시험은 바로 그
  값을 요구한다), `after`의 호출, 그리고 함수 타입의 parameter마다 nil `func`가 kind `invalid_callback`이라는 시험,
  member가 `func`가 돌려준 error 값을 돌려준다는 시험, member가 `func`의 panic 값으로 panic한다는 시험을 쓴다.
  package `binding`은 그 table의 handle을 다시 주지 않는다는 것과 handle이 값을 가리키지 않는 결과가 kind
  `internal`이라는 것을 시험한다. 오류 unit을 던지는 함수 fixture는 그 Go 시험을 이름을 대고 실패시킨다. 아직 어떤
  함수도 오류를 인식하지 않기 때문이다. Node 시험과 WASM 시험은 PHP 시험과 같은 시험을 쓰며, callable이 아닌 값 자리에는 함수가 아닌 값을 쓴다. Node와 WASM fixture의 함수는 arrow 함수이고, 결과를 이름하는 단계는 함수 안에서
  `assert.deepStrictEqual`로 그 결과를 요구하며, fixture가 `awaits`를 이름하거나 그 단계가 기다리는 member를 부르면 async
  함수다. 그래서 sample의 중첩 case는 기다리는 단계를 promise로, 다른 case는 thenable이 아닌 값으로 돌린다.
  end-to-end sample의 계약은 `store`와 `scope`를 가지므로, sample의 end-to-end 검사는 그것을 거부하는 target을 그 target이
  생성할 때까지 실패로 이름한다(GN-14c).
  end-to-end sample에는 class `store`가 있어 그 `transaction`은 `scope`의 함수를 받고 `passthrough`를 돌려주며, class
  `scope`의 `put`과 `get`은 대기 중인 항목을 쓰고 읽고 `nested`는 안쪽 `scope`의 함수를 받는다. 그 case는 commit하고,
  던진 뒤 rollback하고, 중첩한다. functions unit의 함수 `scoped`와 static member `store.once`는 같은 함수를 받고, 그 항목은
  호출과 함께 끝나며, 그 case는 돌려주고, 던지고, 기다린다. 그래서 end-to-end 검사는 함수를 받는 member의 종류마다, 곧
  method, 함수, static member의 진입을 컴파일하고 돌린다. 이유: transaction은 코어가 열고 언어 코드에 넘기고 그 코드가 돌아온 뒤 닫는 범위이므로,
  언어 코드가 언제 돌고 그 실패가 무엇을 뜻하는지는 코어가 정하고, machine은 범위의 I/O를 tokio에 둔다(GN-6ab).
- **GN-15** Go(E-7, B-8, L-1): `packages/go`가 Go 모듈이다(`packages.go`의 module과 `go 1.27.3`을 적은 `go.mod`). 계약
  module은 패키지 `packages/go/<module>`이고 이름은 마지막 마디를 소문자로 구분자 없이 쓴 것이다. 빈 module은 모듈 루트이며
  패키지 이름은 레포 이름에서 `-`를 뺀 것이다(P-1, `httpcookie`). import 경로의 마지막 마디 `go`는 식별자가 될 수 없으므로
  패키지 이름이 그것과 다르며, Go가 허용하는 형태이고 import alias는 필요 없다. 그
  `zz_generated_<package>.go`는 module의 함수, record(공개 field의 struct), enum(typed string과 값마다 상수
  `<Enum><Variant>`), 상수(typed `const`)를 담는다. 패키지 `errors`는 E-7의 category 타입 여섯을 E-2의 클래스 이름에 N-2의 Go 대문자를 적용해
  (`HTTPCookieValueError`~`HTTPCookieInternalError`) 이름 짓고, 각각 `Error()`, `Kind() string`, `Status() (int, bool)`, `Errno() (int, bool)`, `Unwrap() error`를 가진다. 이 타입은
  cgo 호출과 인코딩을 가진 `internal/binding` 타입의 별칭이므로 생성자가 공개 API가 아니다(L-3). C ABI crate
  `polyspec-<repository>-go`는 추적하는 얇은 package `packages/go/internal/ffi`(crate-type `staticlib`, lib
  `polyspec_<repository>_go`)이고 Go는 `-lpolyspec_<repository>_go`로 링크한다. 라이브러리 디렉터리는 Go 모듈 안의
  플랫폼 디렉터리이고 release가 그것을 채운다(GN-15g). tree에 라이브러리가 없는 checkout은 자기 빌드의 디렉터리를
  `CGO_LDFLAGS=-L<dir>`로 준다.
  parameter는 lower camel case이고 Go 예약어, 생성 본문의 이름, 계약 module의 패키지 이름과 같으면 끝에 `_`를 붙인다.
- **GN-15a** Go class unit(T-5, GN-6h): class unit은 그 module 패키지의 struct `<Class>`이며, 내보내지 않은 참조에 C ABI의
  handle을 담는다. C ABI는 코어 값을 그 handle 아래 표에 GN-6h의 lock 뒤로 두고(handle 0은 값이 없으며 kind
  `invalid_argument_type`), Go가 struct를 회수하면 `runtime.AddCleanup`이 `<prefix>__release_<class>`로 놓는다. 그 참조는 pointer를 갖는다. pointer가 없는 객체는 다른 작은 객체와 할당 block을 나누어 쓰고, 그 cleanup은 block의 모든 객체가 닿을 수 없을 때에만 돌기 때문이다. 생성자는
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
  때까지 번호로 지닌다. method의 panic은 호출(`Call.run`)이 recover한다. 호출은 모든 Go callback과 모든 Go `func`
  (GN-6ae)를 돌린다. C ABI의 frame을 지나 unwind하는 panic은 코어의 destructor, 곧 그 guard와 자리의 lock(GN-6h)을
  건너뛰어서 member가 빌린 인스턴스가 잠긴 채 남기 때문이다: 호출은 panic의 값을 U-3의 `Raised`로 쥐고, 코어는 error일
  때처럼 끝나며, member는 C ABI 호출이 돌아온 뒤 같은 값으로 panic한다. callback을 받는 member의 Go 시험은 호출자가 그
  값을 받을 것, member가 같은 인스턴스에서 다시 돌 것, 그 인스턴스를 쓰는 member가 panic 뒤에 kind `busy`가 아닐 것을
  요구한다.
- **GN-15c** Go 값 alias(U-7, T-3): 값 alias는 다른 레포의 것도 `any`다. C ABI는 export `<prefix>__go_host`에 묻는 방식으로
  Go 값을 읽으므로(종류, 항목, `fmt.Sprint` 순서의 map key) 코어의 `in` 함수가 복사 없이 값을 돈다. `in` 함수의 kind는 그
  category의 오류이며, 다른 레포의 alias는 소유 레포의 E-1을 따른다. 코어 값은 내장 형태인 첫 `out` 행의 Go 값으로
  나간다: `nil`, `bool`, `int64`, `float64`, `string`, `[]byte`, `[]any`, `map[string]any`, `*KeyedMap[any]`.
  package binding은 모든 Go 정수 타입의 정수와 `*big.Int`를 기술한다. `int64` 안의 것은 정수로, 그 밖의 것(`math.MaxInt64`를
  넘는 `uint64`, `int64` 밖의 `*big.Int`)은 10진 text로 기술하며, 코어는 그것을 `HostValue::Number`로 읽는다. Python과
  JavaScript가 그런 정수에 기술하는 token과 같다.
  member로 값을 만드는 행(GN-6e)은 class의 인스턴스를 준다. C ABI는 계약 안 class의 번호와 값의 handle을 적고, class의
  module 패키지가 그 번호로 인스턴스를 만든다. `internal/binding`은 그 패키지를 import하지 않기 때문이다. 그런 값을
  주는 다른 module의 member는 이름으로 거부한다. 그 class의 패키지만 인스턴스를 만들기 때문이다. `internal/binding`의 `AliasIn<Alias>`(feature `codec-test`)는 이 레포 alias의 `in` 함수만 실행한다.
  다른 레포의 값 class(GN-6x)는 그 module 패키지에 있는 owner class의 Go 타입의 포인터이며, `internal/binding`이 그
  패키지를 import한다. 패키지 binding은 인스턴스를 그 class의 Go `in` 행으로 묘사한다: `by` member를 부르고, 결과가
  `is`인 case의 kind와 handle을 담은 node 11을 쓴다. 그 handle에 대한 질문 read(op 2)는 case의 `read` member를 불러
  그 결과를 이 규칙대로 묘사한다. 다만 kind `text16`의 case는 그 결과인 부호 없는 정수 slice를 길이와 UTF-16 code
  unit을 담은 node 13으로 쓰고, static library는 그것을 `HostText::Utf16`으로 읽는다. `units`를 가진 kind `text`의
  case에서 `read`가 nil pointer를 주면 `units`가 주는 code unit의 node 13을 쓴다. `iterate` member가 `{key, value}`를 내는 owner class의 인스턴스는 그 순회의 entry들의
  map이다. owner의 member가 돌려준 오류는 call과 그 index를 담은 node 12이므로, Go 함수는 callback의 오류처럼(U-3) 그
  오류를 그대로 돌려준다. class의 코어 값은 값 class의 번호와 그 Go `out` 행의 번호를 담은 결과의 node 11로 나가고,
  그 뒤에 행 kind의 내용이 온다: `null`은 없음, bool, 수의 literal, text, `uint64` list인 `text16`의 code unit, 항목들,
  map의 entry들. 패키지 binding은 행이
  이름하는 owner의 export 함수를 그 내용으로 부르며, map은 constructor로 만들고 insert method로 채운 map class의
  인스턴스로 준다. 그 함수의 오류는 호출의 오류다. 다른 타입의 Go 값은 위 규칙대로 묘사하므로 owner의 `in` 함수가
  판정한다. `core_type` 없는 값 class(GN-6af)는 `internal/binding`의 struct `<Class>`이고, 그 module의 패키지가 alias로
  이름한다. 패키지 binding이 그 instance를 묘사하고 만들며, 그 패키지를 import하지 않기 때문이다. 쓰기 가능한 property는
  struct의 export된 field이고, 쓰기 가능하지 않은 property는 export되지 않은 field와 그 이름의 method다.
  `New<Class>`는 각 parameter를 그 Go 타입(`any`, `[]any`, `*KeyedMap[any]`)으로 받는다. default가 있는 parameter는
  포인터 형식을 갖지 않는다(GN-15e). 그 nil이 생략한 인자다. nil은 Go의 null이고 nil list나 keyed map은 비어 있으며,
  이것이 GN-6af의 default가 주는 값이기 때문이다. 그때 instance는 nil, 새 빈 slice, 새 빈 `*KeyedMap[any]`를 보관한다.
  constructor는 call과, parameter마다 값의 묘사, list 각 항목의 묘사, keyed map 각 key와 값의 묘사를 C ABI의 entry에
  쓰고, 그 entry는 코어의 판정 함수를 부르며 아무것도 돌려주지 않는다. 패키지 binding은 그런 struct의 포인터를 그
  class의 Go `in` 행대로 행의 kind와 handle을 담은 node 11로 묘사한다. handle은 한 call 안에서 같은 포인터에 대해 같고,
  그 handle의 질문 read(op 2)는 행이 이름한 property의 보관된 값을 묘사한다. `*KeyedMap[any]`는 그 entry들을 순서대로
  담은 map으로 묘사하며, 각 key는 정수, text, byte string이다. make가 그 constructor를 이름하는 `out` 행은 계약의
  `core_type` 없는 값 class들 가운데 그 class의 번호를 담은 결과의 node 12이고, 그 뒤에 reference의 값, 또는 object나
  map의 개수와 entry들이 온다. 패키지 binding은 내용을 읽기 전에 struct를 만들고, 같은 handle의 뒤 위치는 node 8이므로
  같은 포인터다. Go 이름이 패키지 binding의 타입 이름인 값 class는 이름으로 거부한다. 생성된 시험은 constructor와
  property의 case를 실행하고, constructor가 만든 instance에서 property를 읽으며, 그런 instance를 담은 결과를
  `reflect.DeepEqual`과 각 포인터가 처음 나타나는 순서로 비교한다. 그래서 case가 하나로 이름한 곳에 instance 둘을 담은
  결과는 실패한다. case 값의 map, keyed map, 반복 list, instance는 시험의 문장이 만들고 채우는 local이다. `gofmt`는 함수
  literal을 짧을 때만 한 줄로 두고, end-to-end 검사는 `gofmt`가 바꿀 생성 파일을 실패시키기 때문이다.
- **GN-15d** Go 오류 unit(E-2, E-7, I-3): 오류 unit은 parent(parent unit 또는 category 타입)의 포인터를 품은
  `internal/binding`의 struct `<Unit>`이므로 `errors.As`가 `Unwrap`을 따라 parent와 category를 찾는다. 패키지 `errors`는
  그것을 별칭으로 적고, property마다 C ABI가 코어 오류에서 읽은 값을 돌려주는 method가 있다. 행이 그 unit을 적은 kind는
  그 struct로 만든다.
- **GN-15e** Go `source`와 기본값(T-1, U-2, T-4): `source` parameter는 text의 바이트도 담는 `[]byte`이고 그 바이트가 코어로
  간다. 기본값이 있는 parameter나 record field는 포인터 `*T`다: nil이면 빠지고 코어가 값을 정한다. 기본값이 있는
  `optional` 타입은 포인터 `*T` 하나를 그대로 쓴다. nil이 이미 값이 없다는 뜻이기 때문이다(GN-6i). nil이 그 타입의 값이
  아닌 포인터인 Go 타입은 `optional`일 때도, 기본값이 있는 parameter나 field일 때도 두 번째 포인터를 받지 않는다:
  `map<T>`(`*Map[T]`), `keyed_map<T>`(`*KeyedMap[T]`), class의 인스턴스(`*<Class>`), 다른 레포의 value class(GN-6x)가
  그렇다. 그 nil이 없는 값이고 C ABI는 그 nil에 값이 없다는 태그를 쓰므로 `optional<keyed_map<T>>`는 `*KeyedMap[T]`다.
  `optional`의 `optional`은 두 번째 포인터를 그대로 둔다. 안쪽 포인터의 nil이 바깥 타입의 값이기 때문이다.
- **GN-15f** 다른 레포의 Go record(T-3, GN-6c): 다른 레포의 record는 그 레포 Go module(그 계약 `packages.go`의 module) 안, 그 module 패키지의 struct
  `<Record>`이며 패키지는 그 패키지를 패키지 이름으로 import한다. C ABI는 이 레포의 record처럼 field마다
  `library_<library>::in_<record>`와 `library_<library>::out_<record>`로 쓰고 읽는다(GN-4c). unit 타입 field가 있는 다른 레포의 record와, 패키지
  이름이 이 레포 패키지의 이름과 같은 record는 이름으로 거부한다. 계약이 Go module(`packages.go`)을 적지 않은 라이브러리는
  `generate`의 Go target을 그 라이브러리와 이유와 함께 거부하고 다른 target은 생성한다(GN-1c). `scaffold`가 Go module만 쓰지
  않은 것으로 이름하는 것과 같다(GN-3e). `binding scaffold`는 `binding generate`처럼 계약이
  이름하는 라이브러리마다 그 계약을 읽는다. 코어의 `path` 의존의 계약은 그 경로의 `interface.json`이라 Cargo가 필요
  없고, 다른 의존의 계약은 `cargo metadata`로 찾는다. `cargo metadata`는 workspace를 해석하므로 Cargo가 그것을 해석할 수 없는
  곳에서 실패한다. 이 머신이 fetch한 적 없는 Git 의존을 network 없이 해석할 때, 또는 manifest가 더 이상 없는 crate를 적을
  때다. 그때 `scaffold`는 Go module을 쓰지 않은 것으로 이름하고(GN-3e), Cargo의 상태와 함께 레포의 `Cargo.lock`의 crate를
  fetch하는 install target(`cargo fetch --locked`)을 실행한 뒤 `scaffold`를 다시 실행하라는 안내를 적으며, 그 계약을 읽지 않는
  다른 target의 package는 쓴다. `check`와 `generate`는 모든 target에서 그 계약을 읽으므로 같은 안내와 함께 실패한다. 계약이 record나 값 class(GN-6x)를 이름하거나 계약이 받는 다른 라이브러리의 callback unit의 member가 그것을 이름하는(GN-3e) 라이브러리마다
  `go.mod`에 `require <module> <version>` 줄을 적는다. Go 바인딩이 그 각각의 패키지를 import하기 때문이다(B2.87). 코어의 `polyspec-<library>` 의존 줄이 버전 `=X.Y.Z`나 tag `vX.Y.Z`를 적으면
  버전은 `vX.Y.Z`다. `path` 의존은 `v0.0.0`과, 이 레포의 Go module에서 그 레포의 Go module로 가는
  `replace <module> => <path>` 줄을 준다. 그 밖의 의존 줄(branch, commit, 버전 범위)도 개발 꼴이며(GN-3e) `replace` 줄 없이
  `v0.0.0`을 준다. 개발 checkout은 그것을 개발 링크, 곧 그 레포의 checkout을 적은 추적하지 않는 `go.work`로 해석한다(kit의
  `make link`가 쓴다). 그러면 Go 프로그램은 그 레포의 정적 라이브러리도 링크하며, end-to-end 실행은 그것을 이 레포의 것과 같은
  디렉터리에 빌드한다(GN-14).
- **GN-15g** Go 모듈의 정적 라이브러리(B-8, L-1, K-3): Go 모듈의 플랫폼은 라이브러리를 GNU C library용으로
  빌드하는 `linux_amd64`와 `linux_arm64`, 그리고 `darwin_arm64`이며, GN-3c의 플랫폼을 `<GOOS>_<GOARCH>`로 적은 것이다.
  musl은 지원하지 않는다. Go의 빌드 제약은 Linux의 C library를 구분하지 않으므로, musl의 소비자는 자기
  `<GOOS>_<GOARCH>`의 파일을 컴파일하고 GNU C library용 라이브러리의 링크가 실패한다. `binding generate`는 플랫폼마다 파일 둘을 쓴다.
  `internal/binding/zz_generated_link_<platform>.go`는 이름 때문에 Go가 그 플랫폼에서만 컴파일하며, 지시문
  `#cgo LDFLAGS: -L${SRCDIR}/../ffi/lib/<platform>`을 담고 패키지 `internal/ffi/lib/<platform>`을 import한다.
  `internal/ffi/lib/<platform>/zz_generated_lib.go`는 그 패키지의 유일한 파일이다. 플랫폼의 라이브러리는 그 파일 옆의
  `internal/ffi/lib/<platform>/libpolyspec_<repository>_go.a`다. 그 디렉터리가 바인딩이 import하는 패키지인 이유:
  `go mod vendor`는 빌드가 import하는 패키지의 디렉터리만 복사하므로, 모듈을 vendor하는 소비자가 모든 플랫폼의
  라이브러리를 받고, 지시문의 디렉터리가 라이브러리 없는 tree에도 있다. 추적하는 tree는 라이브러리도 생성 파일도 담지
  않는다. checkout은 자기 라이브러리를 빌드하고 그 디렉터리를 `CGO_LDFLAGS`로 가리키며(GN-14), linker는 그 디렉터리를
  지시문의 디렉터리보다 먼저 찾는다.
  Go는 모듈을 tag의 소스로 받으므로 release가 Go 모듈을 싣는다. release 도구는 tag `vX.Y.Z`의 commit에서 target go의
  `binding generate` 파일을 쓰고, crate `polyspec-<repository>-go`를 플랫폼마다 release profile로 feature 없이 빌드하고,
  레포가 고정한 Rust toolchain의 component `llvm-tools`의 `llvm-strip --strip-debug`로 각 라이브러리의 debug section을
  떼고(Cargo profile의 `strip`은 정적 라이브러리를 바꾸지 않으며, 그 3분의 1이 Rust 표준 라이브러리의 debug section이다),
  그 commit을 부모로 하는 commit 하나를 만든다. 그 commit의 tree는 Go 모듈 디렉터리 아래에 그 생성 파일과 각 플랫폼의
  라이브러리를 더한다. 도구는 그 commit에 tag `<Go 모듈 디렉터리>/vX.Y.Z`(`packages/go/vX.Y.Z`)를 단다. 이것은 Go가
  레포의 하위 디렉터리에 있는 모듈에서 읽는 tag다. 어느 플랫폼의 라이브러리가 없거나 시험 진입점을 담거나(GN-13b) debug section을 담으면 도구는
  commit도 tag도 만들지 않는다. 어느 branch도 그 commit을 담지 않으며, 그 commit과 tag를 손으로 만들지 않는다. 소비자는
  `require <module> vX.Y.Z` 한 줄만 필요하다. `CGO_LDFLAGS`도 `replace`도 없고, 소비자의 `go.sum`이 모듈을 라이브러리와
  함께 고정한다. 다른 플랫폼의 빌드는 디렉터리를 가리키는 파일을 컴파일하지 않으므로, 그 링크는 찾지 못한 라이브러리로
  실패한다.
  여러 라이브러리의 Go 모듈을 import하는 프로그램(GN-15f)은 각각의 정적 라이브러리를 링크하고, 각 라이브러리는
  `binding_core`와 Rust 표준 라이브러리의 사본을 따로 담는다. end-to-end 검사가 그런 프로그램을 release 형태로 실행
  플랫폼에서 빌드하고 시험하며(GN-14f), 그것이 사본들이 한 프로그램에 링크된다는 증거다. 그 검사는 `darwin_arm64`에서만
  실행되었다. 사본들이 Linux에서 링크된다는 것은 아직 확인하지 않았다.
- **GN-15h** 생성된 Go 패키지는 계약이 쓰는 도우미만 담는다. 패키지 `binding`은 `Writer`나 `Reader`의 method(`Bool`,
  `Tag`, `Uint`, `Int`, `Float`, `Len`, `Text`, `Bytes`, `Key`)를 생성된 Go 코드가 그 타입의 값으로 부를 때만 쓰고,
  타입 `Key`와 `IntKey`, `BytesKey`, `TextKey`, 그 method, 그리고 타입 `KeyedMap`과 그 method를 그 코드가 그것을 적을
  때만 쓴다. 빠진 도우미만 쓰던 import는 그 도우미와 함께 빠진다. 생성기는 쓰임을 주석과 literal 내용을 뺀 생성 Go
  코드에서 읽고, 남는 도우미가 다른 도우미를 부를 수 있으므로 더 남는 도우미가 없을 때까지 되풀이한다. 생성 코드는
  `Writer`의 method를 `enc`, `tenc`, `w`라는 이름의 값으로만, `Reader`의 method를 `dec`, `r`, `properties`라는 이름의
  값으로만 부른다. 다른 값으로 같은 이름을 부르는 것은 다른 타입의 method, 예컨대 계약의 class의 member(`made0.Key`)나
  `reflect.Value`의 method(`v.Float`)이고, 도우미의 쓰임이 아니다. 이유: 어떤 main
  패키지도 어떤 시험도 닿지 않는 함수는 모듈을 쓰는 저장소의 deadcode·unused lint를 실패시키고, 그 저장소는 생성
  파일을 고칠 수 없다. 그러므로 `keyed_map<T>`가 없는 계약은 keyed-map 도우미를 받지 않는다.
- **GN-15i** Go 정적 라이브러리는 link-time optimization 없이 빌드한다. target `go`가 있는 레포의 root manifest와
  `.cargo/config.toml`의 `[profile.release]`는 `lto`를 켜지 않으며(없음, `false`, `"off"`), `binding check`는 다른 값을
  보고한다(CK-91). 이유: LTO는 표준 라이브러리와 `binding_core`를 정적 라이브러리의 한 object에 넣으므로, 두 레포의 정적
  라이브러리를 링크하는 Go program(다른 레포의 타입을 이름하는 계약이 만든다, GN-15f)이 `rust_eh_personality` 같은 중복
  symbol로 실패한다. LTO가 없으면 각 사본은 자기 archive의 member이고 linker는 없는 symbol이 있을 때만 그것을 가져오므로,
  사본들이 한 program에서 링크된다(GN-14f).
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
- **GN-17** C ABI(B-8): 함수마다 `<symbol>(args, len, result) -> int32`다. `<prefix>`는 `polyspec_<repository>`이고,
  `<symbol>`은 `<prefix>_`, 그 뒤에 unit의 module의 각 segment를 snake_case로 쓰고 `___`를 붙인 것, 그 뒤에 class의
  member이면 class의 이름과 `__`, 그 뒤에 member의 이름(생성자는 `new`)이다: `<prefix>_<function>`,
  `<prefix>_<unit>__<member>`, `<prefix>_<segment>___<function>`, `<prefix>_<segment>___<unit>__<member>`. 그것을 부르는
  package `binding`의 함수는 같은 부분을 CamelCase로 쓰고 각 구분자의 밑줄이 하나 적다: `<Function>`,
  `<Unit>_<Member>`, `<Segment>__<Function>`, `<Segment>__<Unit>_<Member>`. 계약의 두 이름을 밑줄 하나로 잇지 않으므로,
  한 계약의 두 member가 한 심볼이나 한 함수를 갖지 않는다(GN-4c). Go는 인자를
  parameter 순서로 버퍼 하나에 인코딩한다: bool과 존재 표지는 0 또는 1의 한 바이트, 수는 little endian 여덟 바이트(int64는
  2의 보수, float64는 IEEE 754 비트), 문자열과 byte slice는 길이(여덟 바이트)와 바이트, list는 길이와 원소, record는 계약
  순서의 field, enum은 값 텍스트. C ABI는 디코딩하며 판정하고(T-8), 인자는 마지막 parameter에서 끝나야 한다. 코어의 결과나
  실패(E-1의 category 번호, 메시지, kind, status, errno)는 같은 방식으로 Rust가 할당한 버퍼에 인코딩해 `result`에 쓰고, Go는
  그것을 `polyspec_<repository>__free`로 해제한다. 반환은 결과면 0, 실패면 1이다. 인코딩을 따르지 않는 버퍼는 kind `internal`이다.
  member가 아닌 심볼(`__free`, `__panic_test`, `__echo_<type>`)은 접두어 뒤에 밑줄이 둘이며, 어떤 member의 심볼도 그렇지 않다. 접두어 뒤의 밑줄 하나 다음에 계약의 이름이 오기 때문이다.
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
  `internal`로 바꾸고 인스턴스를 망가진 상태로 표시한다. 그 뒤 모든 호출은 같은 kind로 실패한다. `bytes`는 양방향 모두
  `Uint8Array`이고 `source`는 Node와 같이 문자열(그 UTF-8) 또는 `Uint8Array`를 받는다(GN-6j, T-7). 기본값이 있는
  parameter나 field(GN-6i)는 Node와 같이 생략한다: 빠진 뒤쪽 인자, 옵션 record에 없는 member, 또는 `undefined`이며 모듈은
  이를 `None`으로 넘긴다. ES 모듈은 인자 개수를 필수 인자 수부터 전체 수까지 센다. 모듈을 다시 인스턴스화하지 않는다.
  그전 handle이 가리키던 상태가 사라지기 때문이다. 모듈이 unwind하는 곳에서는 다른 바인딩처럼 `catch_unwind`가 kind
  `internal`을 낸다(B-7).
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
  `cleanup`(B-10)이 있는 class unit과 receiver가 `self`인 method는 GN-6o와 GN-6p대로 생성한다.
- **GN-18b** WASM의 `core: {in, out}` 값 alias(U-7), 다른 레포의 것(GN-6k) 포함: 값은 Node와 같이 받고 준다(GN-6e). 모듈은
  JavaScript 값을 Node의 규칙대로 한 단계씩 `HostValue`로 기술한다: number는 `UntypedNumber`, bigint는 `Int`(`i64` 밖이면
  그 십진 token), string은 UTF-16 단위, Array, Map(`Array.from`의 항목), plain object(prototype이 `Object.prototype`이나
  `null`, 키는 `Object.keys`), Date, 함수, symbol, typed array, 그 밖의 객체(constructor 이름과 함께)다. Date와 Map은 전역
  class의 `instanceof`로 찾는다. 코어 값은 alias의 내장 형태 `out` 행으로 나가며, 같은 handle은 같은 객체다. 기술 중 값의
  코드(getter, proxy의 trap, iterator)를 실행할 수 있는 JavaScript 연산은 모두 `catch`로 부른다(`Reflect`와, `catch`로
  import한 `Array.isArray`, `Array.from`, `Object.keys`). 그래서 그 예외는 호출이 그대로 다시 던지는 값이며, 예외는
  WebAssembly 모듈의 frame을 거쳐 unwind하지 않는다. 그렇게 되면 모듈의 stack과 표가 망가진 상태로 남기 때문이다. 실패
  (`Fail`)는 그 예외를 지니고, 코어는 그것을 U-3의 `Raised`로 지닌다. 코어가 보관할 수 있는 언어 객체는 `Native`다(GN-6u).
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
  이름 있는 인자, Python keyword, Node options record의 member와 빠진 member). Python에서 parameter 없는 함수나 메서드는 인자
  없는 함수이고 CPython은 `takes no arguments`와 `takes no keyword arguments`로 알린다. parameter 없는 생성자는 PyO3의 `__new__`이고
  `takes 0 positional arguments`와 `unexpected keyword argument`로 알린다. 각 시험은 그 형태의 말을 기대한다. case의 인자는 snake_case 키이고, record
  parameter는 field의 객체, enum은 값 텍스트, latin1 값은 U+0000~U+00FF의 텍스트다. 기본값이 없는 parameter의 키가 없는 case는 id로
  거부한다. 타입 `float`의 수는 Python과 PHP에서 float literal이다. 두 언어는 그 자리에서 정수를 거부하기 때문이다(B-2). JSON이
  정수로 적은 수도 그렇다(`0`은 `0.0`, `1e20`은 `1e+20`). 음의 0은 부호를 지닌다(`-0.0`). JSON으로 적을 수 없는 값: bytes는 `{"hex": "<바이트마다 소문자 hex 두 자리>"}`, `source`는 텍스트 또는 텍스트가
  아닌 바이트일 때 같은 `{"hex": ...}`, 올바른 꼴이 아닌 텍스트는 `{"ill_formed": "<텍스트>"}`로 그 텍스트 뒤에 올바른
  텍스트가 담지 않는 code unit 하나가 온다(텍스트가 code point나 UTF-16인 Python·Node·WASM은 짝 없는 surrogate U+D800,
  텍스트가 바이트인 PHP·Go는 바이트 0xFF), 유한하지 않은 float는 `{"float": "nan" | "inf" | "-inf"}`, 값 타입(`json_value`,
  `php_value`, `template_value`)의 값은 값 표의 kind로 적은 `{"kind": <값 kind>, "value": ...}`다: `null`은 `value`가 없고,
  `bool`, `int`, `float`(수 또는 위 형태), `number`(리터럴 텍스트), `text`, `bytes`(`{"hex": ...}`)는 그 값을, `list`는 그런
  값의 배열을, 또는 JSON reader가 받는 것보다 깊이 중첩된 값이면 `{"kind": "list", "repeat": <n>, "value": <값>}`을
  담는다. 이것은 n개(1 이상)의 list이고, 각 list는 그것을 감싸는 list의 유일한 항목이며 가장 안쪽 list가 그 값을 담고,
  시험은 그것을 loop로 만든다. `map`과 `object`는 순서대로 `[key, value]` 쌍의 배열을(key는 텍스트, keyed map이면 `{"int": n}`이나
  `{"hex": ...}`), `reference`는 그 id의 첫 자리에서 `{"id": n, "value": ...}`를, 그 뒤의 모든 자리에서 같은 참조인 `{"id": n}`을
  담는다. kind 옆에 `"id": n`을 가진 `object`는 그 뒤의 모든 자리에서 같은 객체인 `{"kind": "object", "id": n}`로 부른다.
  자리의 순서는 값을 쓰는 순서(깊이 우선)이므로, 뒤의 자리가 첫 자리의 값 안에 있을 수 있고 그것이 순환을 만든다.
  객체의 id와 참조의 id는 따로 센다. JSON reader가 받는 것보다 깊이 중첩된 객체는
  `{"kind": "object", "repeat": <n>, "key": <key>, "value": <값>}`이다. 이것은 n개(1 이상)의 객체이고, 각 객체는 그것을
  감싸는 객체의 유일한 property `key`이며 가장 안쪽 객체가 그 값을 담는다. origin value class가 나타내는
  값 타입(U-1)의 값은 그 kind의 `out` 행이 언어에 대해 적은 static member나 constructor의 호출이다. `value`가 없는 kind는
  parameter 없는 member로, 그 밖의 kind는 parameter 하나인 member로 만들며, 그 member는 case의 `value`를 그 parameter 타입의
  case 값으로 받는다. 그래서 `list`는 그 class의 값들을 담는다. 그 parameter 하나가 계약의 다른 class면 kind `map`의 `[key, value]` 쌍이
  그것을 채운다: parameter 없는 생성자가 만들고, receiver `&mut self`와 parameter 둘을 가진 하나뿐인 member가 각 쌍을 순서대로
  받으며, 그 parameter가 origin value class면 text key는 kind `text`의 값이다(`OrderedMap.insert`가 채운 `OrderedMap`의
  `Value.object`). 그런 class의 case 값은 다른
  어느 자리에서도 같은 쌍의 list다. 다른 레포의 value class(GN-6x)의 case 값은 parameter, list 안, field 어느 자리에서도
  다섯 target이 같은 규칙으로 적는다. 그 언어의 out 행이 적은 owner 계약의 member를 쓰고, 시험이 import하는 owner의 패키지를
  거친다(Go는 owner의 Go 모듈이며, 만든 값마다 시험의 local이고 그 오류는 시험을 실패시킨다). kind의 내용은 그 member의 하나뿐인
  parameter의 값이며, `number`는 text, `text16`은 UTF-16 code unit의 list다. 쌍의 key는 text이거나 그 class의 case 값
  `{kind, value}`다. `{"kind": "list", "repeat": n, "value": <값>}`은 `list`의 member를 n번 부르며, 매번 바로 앞의 값 하나를
  담은 list를 준다. 그런 class의 자리에는 언어의 내장 값을 적지 않는다. binding이 그것을 `invalid_argument_type`으로 거부하고
  Go는 컴파일하지 않기 때문이다. 그런 class의 instance를 담은 결과는 비교할 case 값이 없으므로, 그 case는 그 이유로 실패하는
  시험을 갖는다(GN-13e). 그런 member로 만드는 행이 없는 kind(parameter 둘인 member,
  내장 형태, 또는 서로 다른 member를 적은 같은 kind의 행 둘)는 적지 않는다. 생성기가 receiver나 인자를 적지 못하는 case는
  그 이유와 case와 member를 대며 실패하는 시험을 갖고, target의 다른 시험은 적는다(G-4, GN-13e). 그 밖에 어떤 시험도 만들 수
  없는 값(receiver 없는 어떤 member도 만들지 않는 class의 placeholder 등)은 이름을 대고 그 target을 거부하며, 생성기는 항목을
  대지 않는 예외로 끝나지 않는다. class의 placeholder는 그 class를 돌려주는 첫 생성자나 static member가 만드는 인스턴스이고,
  그런 member가 없는 class에서는 그 class를 돌려주는 첫 함수, 그다음 다른 class의 첫 static member가 만드는 인스턴스다. 어느
  것이든 인자는 placeholder다. GN-13f의 `new`가 class를 돌려주는 어떤 member든 이름하기 때문이다(template의 `bind`가
  `bound_map`을 만든다). method는 쓰지 않는다. 먼저 자기 class의 인스턴스가 있어야 하기 때문이다. 타입 `cancel`의 값은 호출 전에 발동한
  취소인 `{"cancel": "fired"}`이거나 발동하지 않는 취소인 `{"cancel": "open"}`이다(CK-22). 생성된 테스트는 GN-6aq가 말하는 대로 그것을 준다. 끝에서 끝까지 확인은 case를 뺀
  실행을 실패로 끝낸다. 계약이 모든 key 종류를 적지 않은 `keyed_map` parameter는 빠진 종류의 key로 kind
  `invalid_argument_type`을 시험하고, case는 keyed map을 그 `[key, value]` 배열로 준다. case는 `map<T>`를 entry의 객체로 주거나 key가 text인 `[key, value]`의 배열로 준다. JSON의 객체는 정수인 key를 다른 key보다 먼저 주므로, 순서가 뜻을 갖는 case는 배열로 주고 시험은 그 순서로 entry를 만든다. 다른 꼴의 entry는 이름을 대고 거부하며(G-4), `binding check`는 두 꼴의 항목을 모두 판단한다(CK-64). class의 member도 같은 시험을 가진다. 메서드와 property는 그 클래스의 factory(클래스를 돌려주는 static member나
  생성자)가 case의 factory parameter 키로 만든 인스턴스에서 부르고, 메서드의 B-2, B-3, G-7 시험은 실패하지 않는 그 클래스의 첫
  case의 factory 인자를 쓴다. `core_type`이 없는 value class(GN-6af)도 Python, Node, WASM에서 그런 class다. 그 생성자와
  property는 이 시험을 가지며, property는 생성자가 case의 parameter 키로 만든 인스턴스에서 읽는다. Go는 GN-15c가 적은 대로
  생성자와 property의 case를 실행한다. callback을 받는 member에는 K-2 시험이 있다:
  member가 없는 객체는 kind `invalid_callback`, callback이 던진 예외는 같은 객체로 호출자에게 가고, 다른 타입의 결과는 바인딩
  kind다. 단, callback의 member가 값 alias를 돌려주면 이 시험을 생성하지 않는다. alias의 코어가 모든 값을 판정하므로(B-1)
  거부된 결과의 kind는 alias의 것이기 때문이다. 그 밖의 인자는 목록에 항목이 하나 있는 자리표시 값이다. K-2는 binding 자신의 요구이며 case에 기대지 않는다.
  case는 callback parameter를 fixture로 준다:
  `{"callback": {"<callback member id>": [<행>]}, "calls": [{"member": "<id>", "args": {...}}]}`. 행은
  `{"args": {<snake_case parameter>: <case 값>}}`에 `"result": <case 값>`(member가 none을 돌려주면 없다)과, 호출 하나에만
  답하는 행의 `"once": true`를 더한 것이다. `"raise": {"error": <오류 unit>, "kind": <kind>}`가 있는 행은 결과 대신 그 오류
  unit 클래스의 인스턴스를 kind와 메시지 `G-5: <kind>`로 언어 코드가 만들듯이(GN-7a) 만들어 던진다: Python·Node·PHP·WASM은
  메시지와 kind를 받는 그 클래스의 생성자로 만든다(GN-10). Go는 property 값 없이 그 unit의 struct를 만드는 `internal/binding` 패키지의
  `Raised<Unit>(kind, message)`로 만든다. 각 언어의 생성 시험은 binding이 시험 모듈에 쓰는 구현 하나로 fixture를 만들므로
  레포는 fixture 코드를 쓰지 않는다. 호출은 그 member의 남은 행 가운데 인자가 호출의 인자와 같은 첫 행을 쓰고, 어떤 행도
  답하지 않는 호출은 기록되고 `UnexpectedCall`을 던진다. 시험 대상 호출 뒤에 시험은 그 기록이 비었는지 확인하므로 코어가 그
  예외를 삼켜도 시험은 실패하며, case가 `calls`를 적으면 호출이 그 순서의 그것들인지 확인한다. 다른 타입 안(record의 field, list의
  항목, `optional`)의 callback도 같은 fixture로 주고, 함수는 GN-6ae의 함수 fixture로 준다. 형식은 `binding check`가 판정한다(CK-22). callback을 받는 member의 B-4 시험은 실패하는 case를 그 fixture로 실행한다.
  stringify와 to_json은 언어가 hook을 실행하는 방식으로 실행한다(GN-6g). stringify는 실패하지 않는 case마다 시험이 있고, 그
  시험에서 인스턴스의 문자열 형태(`str`, `String`, `(string)` 변환)는 case의 `result`이며 PHP에서는 인스턴스가
  `\Stringable`이다. primitive는 실패하지 않는 case마다 시험이 있고, 그 시험에서 인스턴스의 수 형태(Node와 WASM의
  `Number(instance)`)는 case의 `result`이며, case가 `result`를 주지 않으면 그 수 형태만 얻는다. to_json의 B-4 시험은 `JSON.stringify`, `json_encode`, Go에서는 내보내지 않은 `toJSON`을 부른다(Go의 stringify 시험이 `stringify`를 부르는 것과 같다). 셋 다 G-7 시험이 없다. B-5c(GN-6h): 쓰기 쪽 자리가 있는 class마다, 시험은 인스턴스를 만들고 그 인스턴스로 GN-5의
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
  `os.constants.errno.<기호>`, Go `syscall.<기호>`, PHP는 GN-8a의 `Internal\errnoOf("<기호>")`)으로 비교하고, case가 적지 않으면 errno가 없어야 한다. Go 시험은 기호를
  `Errno()`가 돌려주는 타입인 `int(syscall.<기호>)`로 비교한다. WASM의 target에는 errno가 없다
  (`binding_core::errno::value`가 값을 주지 않고, 기호를 적은 장전은 거부된다, GN-8a). 그래서 WASM 시험은 case와
  `then` 호출의 fault를 `errno` 없이 장전하고, case가 기호를 적은 자리에서는 errno가 없어야 한다고 요구한다. 수는
  그대로 비교한다. `in_raises`를 가진 값 alias에는
  feature `codec-test`에서 그 `in` 함수만 실행하는 진입점이 있다. alias의 case마다(CK-22) 그 case의 `value`로 그것을
  불러 kind의 정확한 클래스와 kind를 확인한다. 그 클래스는 kind의 행이 적은 error unit의 클래스이고, 없으면 category의 클래스다(E-2). parameter가 그 alias, 그 alias의 optional, 그 alias의 list인
  member마다 시험이 하나 더 있다. alias의 첫 case 값을 그 자리에(parameter로, 또는 list의 한 원소로) 넣고 다른 인자는
  placeholder로 주어, member를 지나 같은 클래스와 kind가 오는지 확인한다. case는 값 타입의 값을 `{"kind", "value"}`로
  주며, kind는 `null`, `bool`, `int`(수, 또는 안전 정수 밖이면 10진 텍스트: Node `bigint`, Python `int`), `float`,
  `text`, `bytes`, `list`, `map`이고 각각 그 kind의 내장 형태가 만드는 값이다. PHP는 가장 작은 int를 `\PHP_INT_MIN`으로 준다. PHP가
  `-9223372036854775808`을 float의 부정으로 읽기 때문이다. 값 타입의 값이 아닌 언어의 값은 종류의 닫힌
  표에 있는 `{"host": <종류>}`이며, 그래서 각 언어가 그것에 같은 값을 만든다. `callable`은 함수(Python `lambda: None`,
  Node와 WASM `() => null`, PHP `static fn (): null => null`, Go `func() {}`), `date`는 날짜(Python
  `datetime.date(1970, 1, 1)`, 시험이 import한다, Node와 WASM `new Date(0)`, PHP `new \DateTimeImmutable('@0')`, Go
  `time.Unix(0, 0).UTC()`), `object`는 시험의 class의 인스턴스(Python `object()`, Node와 WASM `new (class Other {})()`,
  PHP `new class {}`, Go `struct{}{}`)다. 다른 종류는 거부한다. PHP reference는 배열이나 property의
  자리이므로, 자리에 `{"kind": "reference", "value": {"id", "value"}}`나 id를 가진 객체를 가진 PHP case 값은 closure
  안에서 만든다. closure는 id마다 변수 하나(객체면 새 `stdClass`)를 정하고, 각 객체를 채우고 각 참조를 정한 뒤, 그 자리가
  참조 변수를 reference로 받고 객체 변수를 받는 값을 돌려준다. Python, Node, WASM은 id마다 참조나 객체의 class(GN-6af)의
  인스턴스 하나를 내용 없이 만든 뒤 그 값을 정하거나 그 map을 채우며, 이것을 각 인스턴스에 이름을 붙이는 식(Python은
  tuple의 대입식, Node와 WASM은 화살표 함수) 안에서 한다. 그래서 같은 id의 모든 자리가 같은 인스턴스를 가지고 순환도
  만들어진다. 되풀이되는 객체는 바깥 객체부터 만들고 각 객체를 만든 뒤에 채우므로, 어떤 생성자도 그 안의 객체를 다시
  판정하지 않는다. PHP는 `(object)` 변환으로 가장 안쪽부터 만든다. PHP case-test 진입점의 host는 id가 있는 object가 case에 있을 때만 그 object를 예약하고 채우는 method를 갖는다. lint가 죽은 코드를 금하기 때문이다(GN-4). case-test 진입점(GN-5)은 id의 뒤 자리를 첫 자리의
  동일성으로 기술하며, 코어는 그것을 다시 읽지 않는다. 인자가 어떤 target의 언어에서 꼴을 갖지 않아 그
  언어의 어떤 호출로도 줄 수 없는 case는, `panic-test`, `fault-test`와 나란한 그 target의 feature `case-test`(GN-5)의
  진입점으로 실행한다. 진입점은 인자를 바인딩 자신의 인코딩, 곧 바인딩이 기술하는 host 값(B-1)이나 Go C ABI의 값
  stream(B-8)으로 만들어, 호출이 쓰는 것과 같은 변환(value alias의 `in` 함수, 인자의 decode)에 넘긴다. 그 시험은 case의
  클래스와 kind를, 실패하지 않는 case면 실패가 없음을 요구한다. 진입점과 그 시험의 doc comment는 그 언어에 꼴이 없는
  이유를 적는다. case를 빼지도, 실패하는 시험으로 생성하지도 않는다. 빼면 그 target에서 코어 규칙이 검증되지 않고,
  실패로 두면 종단 검사가 영원히 통과하지 않기 때문이다. target에 그런 case가 있으면 crate는 `case-test = []`를 갖고,
  그 feature 없이 빌드한 결과에는 진입점이 없다(종단 검사가 `llvm-nm`으로 심볼을 읽는다). 지금까지: PHP에서는 배열이나
  property의 자리가 아닌 reference(값 자체, 또는 reference의 값)와, PHP에 꼴이 없는 64비트 밖의 정수를 Python과
  JavaScript가 그것에 기술하는 10진 token(`HostValue::Number`)으로, 각각 host 값으로 만들어 그 alias의 `in` 함수에
  준다. member case의 값에도 alias case의 값에도 그렇게 한다. Go는 `int64`와 `uint64` 밖의 정수를 `*big.Int`로
  준다(GN-15c). 생성 시험이 case의 10진 token으로 그것을 만들고 package binding이 그 token으로 기술하므로, 그 case는
  호출로 돌고 진입점이 필요 없다. Go(예:
  `int64` parameter에 text처럼, parameter의 Go 타입이 담지 않는 kind의 인자)는 Go 생성기가 생성하며, 그때까지 이름을 대고
  거부한다. Python, Node, WASM에는 아직 그런 case가 없다.
- **GN-13a** 아직 생성하지 않는 G-5 항목: B-5b, B-6, B-5c 가운데 기다리는 호출과 겹친 호출의 시험과 callback 안에서
  같은 객체로 다시 들어온 호출의 시험, 생성자나 static member가 만들지 않는 class의 시험, GN-13d가 빼는 member의 기본값의 동일성, value unit 행의 왕복, 그리고 callback
  fixture에서 `async` 행, 함수 값, 다른 타입 안의 callback. case가 이것을 주면 이름을 대고
  거부한다(G-4). 실패 주입과 alias kind에서 case가 주면 이름을 대고 거부하는 것: `faults`가 없는 계약에서 다른 라이브러리의 점(GN-5),
  GN-13의 kind가 아닌 값 타입의 값. 생성하지 않고 거부하지도 않는 것: 실패하지 않는 `faults` case의 시험(GN-13e의
  시험은 아직 실패를 장전하지 않는다), map·record field·callback 반환 안의 alias를 받는 member의 시험, 릴리스 빌드에 시험
  feature가 없다는 검사(`cargo tree`의 해석된 feature와 설치한 패키지의 export 목록). 이 검사 중 Go 부분은 e2e에
  있다(GN-13b).
- **GN-13d** Python, Node, PHP, WASM은 GN-6i, GN-6j, GN-7a의 형태에 대해 다음도 확인한다. U-2: `{literal}`·`{const}`·`{empty}`
  기본값이 있는 parameter와 field마다, 그것을 뺀 호출과 선언된 값을 준 호출이 같은 결과, 또는 같은 클래스와 kind의 실패를
  낸다. 다른 인자는 그 member의 실패하지 않는 첫 case의 것이거나 자리표시 값이다. 이 시험은 언어가 결과를 값으로 비교하는
  member(class가 아니고 결과가 `none`이 아닌 것)이면서 callback을 받지 않고 hook이 아닌 것에 쓴다. Python과 Node에서 그런
  parameter에 명시한 `None`·`null`은 거부되는 값으로 시험한다. 단, 기본값이 `{literal: null}`이면 그 null이 선언된 값이므로 제외하고,
  `optional`과 값 타입도 그것을 값으로 받으므로 제외한다(GN-6i). T-1: `source` parameter는 text와 그 UTF-8 바이트에 같은 것을
  내고(Python, Node), 짝 없는 surrogate가 든 text는 kind `invalid_text`, 둘 다 아닌 값은 kind `invalid_argument_type`이다.
  T-7: `bytes` parameter는 바이트가 아닌 값을 거부하며 Node에서는 string도 거부한다. B-4: kind가 `class`를 적은 case는 그
  정확한 클래스를 기대하고 category의 클래스로 잡힌다. case는 기본값이 있는 parameter의 키를 뺄 수 있고, 그러면 호출에서도
  뺀다.

- **GN-13e** 모든 target은 실패하지 않고 `faults`가 없으며 hook(N-4)이 아닌 member의 contract case를 하나씩 실행해 그
  결과를 case의 값과 비교한다. Node와 WASM은 `Map`을 순서대로 놓은 항목으로 바꾼 뒤 `assert.deepStrictEqual`로, Python은
  타입과 값으로(`dict`의 항목은 순서대로, NaN은 NaN과 같다), PHP는 객체를 클래스와 property로 바꾼 뒤 `assertSame`으로, Go는
  tuple 반환의 부분마다 `reflect.DeepEqual`로 비교한다. 결과를 담은 case의 키는 그 `cases` 행의 `result`이거나
  `result`다(CK-22). 값은 case가 주는 대로 쓴다. `int64` 결과는 Node `bigint`, tuple은 Python tuple과 Go 배열 또는 Go 함수의
  결과들, `bytes`는 `{"hex": ...}`다. 키가 없는 case는 호출만 실행하며, 실패하면 시험이 실패한다. optional의 결과 `null`은 optional이 무엇을
  담든(class라도) case 형식이 있다. 각 target은 결과를 자기 null과 비교한다(Python `None`, Node, WASM, PHP `null`, Go는 결과 타입의
  `nil`). 계약의 값 alias인
  결과(다른 타입 안이 아니고, 생성자가 받은 값을 주는 값 class의 property도 아닌 것)는 그 자리들을 전위 순서, 깊이 우선으로
  적은 텍스트로 비교한다. 양쪽 모두 반복문이 쓰므로, 재귀가 받지 못하는 깊이의 값도 비교한다. 생성기는 case 값의
  텍스트를 alias의 out 행으로 쓴다. 각 자리에서 그 kind의 행 가운데 값이 가진 predicate(`utf8`, `safe_integer`,
  `integral_float`, `sequence_keys`)의 행을 고르고(alias에 kind `list`나 `text`의 행이 없으면 case 값의 그 kind는
  `map`이나 `bytes`의 행을 쓴다), 그 행의 그 언어 형태를 쓴다. 시험은 결과의 텍스트를 각 자리의 타입으로 쓴다. 텍스트는
  형태를 적는다. `null`, `bool true`나 `bool false`, Python과 PHP의 `int <10진>`, Node와 WASM의 `number <bits>`(IEEE 754
  bit의 hex 또는 `nan`), `bigint <10진>`, Python과 PHP의 `float <bits>`, Python, Node, WASM에서 UTF-8이나 bytes의 hex인
  `text <hex>`와 `bytes <hex>`, PHP의 `string <hex>`, `list <n>`과 그 항목들, `map <n>`과 각 key와 그 값(key는 그 keyed
  map의 형태이며, 정수의 10진 텍스트인 PHP key는 그 정수다)이다. out 행이 `<unit>.constructor`로 적는 값 class의
  인스턴스, PHP `stdClass`, PHP reference는 첫 자리 순서로 함께 번호를 받는다. `<unit> #k` 다음에 그 field 하나,
  `php_object #k <n>` 다음에 그 쌍들, `php_reference #k` 다음에 그 값이 오고, 뒤 자리는 `<form> again k`다. 그래서 각
  자리의 동일성과 각 순환을 비교한다. `codec-test` 진입점을 가진(`in_raises`, GN-5) alias의 결과는 alias 행의 왕복(U-1)도
  거친다. 시험은 결과를 `_alias_round_<alias>`(Python), `__aliasRound<Alias>`(Node, WASM), `Internal\aliasRound<Alias>`(PHP)에
  준다. 이것은 결과를 alias의 `in` 함수로 받아 그 코어 값을 `out` 함수로 돌려주며, 시험은 같은 텍스트를 요구한다. 그래서
  `out` 행이 만드는 각 형태가 같은 값으로 다시 들어간다. 결과에 case 형식이 없는 case(class, 결과 `none`), 값 alias에 그 언어에서 그 kind의
  내장 형태나 텍스트의 형태를 만드는 out 행이 없는 case, parameter나 receiver factory의 인자를 주지 않는 case는 그 이유로
  시험이 실패하므로, case는 빠지지 않는다. 시험이 함수나 메서드인 언어(Python,
  PHP, Go)에서 case 시험의 이름은 case id를 낱말로 담는다. id는 ASCII 글자와 숫자가 아닌 문자가 이어진 곳마다 나뉘고
  (`document-order`는 `document`, `order`), 낱말은 Python에서 `_`로 잇고 PHP와 Go에서 첫 글자를 대문자로 해 잇는다
  (`DocumentOrder`). Node와 WASM은 시험을 문자열로 이름 지으므로 id를 그대로 담는다. 한 member의 case들이나 한 값 alias의
  case들의 두 id가 같은 이름을 내면 그 target을 이름을 대고 거부하며, PHP는 메서드처럼 대소문자 없이 이름을 비교한다. 그래서
  어떤 시험도 다른 시험을 가리지 않는다. Python 파서는 괄호가 200단 중첩된 식을 거부하는데("too many nested parentheses"),
  case는 값을 그보다 깊게 중첩할 수 있다(코어의 깊이 한계를 넘는 list). 그래서 괄호가 50단보다 깊게 중첩될 Python case 값은
  단계별로 만든다. 그 깊이에 이른 값마다 시험 module 함수의 지역 변수가 되고, 다음 단계가 그 변수를 받으며, 시험은 그 함수를
  부른다. 그래서 case 값은 온전히 남는다.
- **GN-13f** 메서드의 case는 receiver를 자기 키 가운데 그 class의 factory 인자로 주거나, 키 `receiver` 아래에 앞선
  호출들이 만드는 인스턴스 값으로 준다:
  `{"new": "<member id>", "receiver": <인스턴스 값>, "args": {...}, "then": [{"call": "<member id>", "args": {...}}]}`
  또는 `{"from": "<member id>", "receiver": ..., "args": {...}, "pick": [<단계>], "then": [...]}`. `new`는 그 class를
  돌려주는 member다: 생성자, static member, 함수, 어느 class의 메서드. `from`은 결과가 그 class를 담는 member이고,
  `pick`은 단계로 거기에 닿는다: snake_case field 이름, list의 `{"index": n}`, tuple의 `{"tuple": n}`. `receiver`는
  member가 메서드일 때 주며 그 자체가 인스턴스 값이다. case는 자기 키 가운데, 계약 순서로 첫 factory의 인자를 준다. 그
  factory는 모든 parameter의 키가 case에 있고 그 키가 case의 member의 parameter 키가 아닌 factory다. 그런 키는 그
  member의 인자를 담는다. factory `from_units` 곁의 메서드 `get_units`의 case에서 `units`가 그렇다. 그 키로 만든
  receiver는 case가 이름한 값과 다른 값이다. case의 키를 하나도 받지 않는 factory는 모든 case에 맞으므로, 키를 받는
  factory가 없을 때만 receiver를 만든다. raises가 있는 case의 시험은 실패해야 하는 호출 앞에서 receiver를 지역 변수로
  만든다. 만들 수 없는 receiver는 시험을 실패시키며, 그 실패는 case가 기대하는 실패로 받아들여지지 않는다. case의 키로
  receiver를 만드는 factory가 `errors.kinds`의 행이 case가 기대하는 kind를 주는 variant를 raise하고, case에 `faults`도
  `after`도 없으면, case의 실패는 receiver를 만드는 실패이거나 호출의 실패다. 시험은 둘 모두에서 그 실패를 기대하고, Go는
  factory의 오류를 case의 오류로 받아 만든 receiver에만 member를 부른다. 이유: parser의 잘못된 field와 그 property처럼
  factory와 그 class의 member가 함께 실행하는 case group은 둘 모두에 parse의 실패를 적으며, 레포의 runner는 receiver를
  만들고 member를 부르는 것을 한 단계로 한다. `args`는 member의 parameter를 snake_case 키로 담고, case의 어느
  자리(parameter, list의 항목, record의 field, `optional`)에 있는 class의 값도 인스턴스 값일 수 있고, case의 class가 구현하는 callback의 값도 그렇다(GN-6w). `then`의 호출은 그 class의 메서드이며 인스턴스에 차례로 부르고 결과는 비교하지
  않는다. `"raises": {"kind": <kind>}`를 가진 호출은 그 member raises의 그 kind로 실패해야 하며, 시험은 다음 단계 전에
  그것을 요구한다. 그래서 실패한 호출 뒤의 인스턴스만 닿는 kind도 case를 가진다. `then`의 호출은
  `"faults": [...]`를 가질 수 있다. 그것은 case의 faults 꼴(CK-22)로 적은 그 호출 자신의 fault 주입점이다. 시험은 그 호출
  바로 앞에서 그 호출의 member에 그것을 장전하고, 바로 뒤에서 장전한 모든 fault가 발동했음을 요구한다. 그래서 앞선
  호출의 실패가 뒤의 호출이 내도록 남기는 kind도 case를 가진다(feed가 저장에 실패한 body는 finish에서 그 실패를 다시
  낸다). `"on": "receiver"`를 가진 `then`의 호출은 인스턴스 값의 `receiver`의 class의 메서드이며, `then`의 호출 가운데
  자기 순서에서 pick 뒤에 그 receiver에 부른다. 그래서 인스턴스를 꺼낸 인스턴스의 호출 뒤에만 닿는 kind도 case를 가진다(body가
  지워진 저장된 파일). 아무 receiver나 필요한 시험(B-2, B-3, G-7)은 fault를 장전하는 receiver를 쓰지 않고, Go는 인스턴스
  값이 fault를 장전하는 시험을 fault를 장전하는 case와 함께 둔다(GN-13b). 시험은 그 값이 만드는 모든 인스턴스를, receiver와 pick이 읽는 결과까지 시험의 지역 변수로 만들어 시험이
  끝나기 전에 회수되지 않게 한다. 아무 receiver나 필요한 시험(B-2, B-3, G-7)은 시험 파일의 함수를 불러 그것을 만든다.
  `binding check`는 이를 어기는 값을 지적한다(CK-22).

- **GN-13b** Go: 패키지의 시험은 시험이 인스턴스의 handle을 읽도록 그 패키지 안의 `zz_generated_test.go`이며 `go test`로
  실행한다: `int` parameter마다 2^53과 −2^53, `uint` parameter마다 2^53이 kind `invalid_number`인 B-2(GN-12a), `int` key의 `keyed_map` parameter마다 key 2^53이 kind
  `invalid_number`인 것(GN-12a), text parameter·field마다 B-3(바이트 FF), enum parameter·field마다 GN-16의 enum 검사, U-2(기본값이 있는 인자를
  뺀 호출은 기본값을 준 호출과 같다), U-7(member를 거친 alias의 kind), K-2(nil callback, callback의 오류가 호출의 오류다),
  raise하는 contract case마다 B-4(E-2와 E-7의 정확한 타입, 그 category의 `errors.As`, kind, status, errno), raise하지 않는
  case마다 GN-13e, stringify마다 N-4. class의 case 값은 다른 target과 같이 쓴다: instance 값(GN-13f), origin value인
  class의 make member 호출, 또는 다른 class를 채우는 쌍(U-1, GN-13)이며 각각 시험의 지역 변수다. receiver, 인자, 결과를
  쓰지 못하는 case는 그 이유로 실패하는 시험을 가지고, 다른 시험은 쓰인다(GN-13e). 실패를 장전하는 case는 build tag `polyspec_fault_test`가 붙은
  `zz_generated_fault_test.go`이며, 장전이 스레드의 것이므로 goroutine을 스레드에 묶는다. B-5c의 poison 시험은 build tag
  `polyspec_panic_test`가 붙은 `zz_generated_held_test.go`다. 끝에서 끝까지 확인은 crate의 시험 feature마다 tag
  `polyspec_<feature>`를 주어 `go test`를 실행한다. B-7은 build tag `polyspec_panic_test`가 붙은 `internal/binding/zz_generated_panic_test.go`이고, 이 파일이 C ABI의
  panic 진입점도 선언하므로 정적 라이브러리는 그 tag에서만 feature `panic-test`가 필요하다.
  `internal/binding/zz_generated_map_test.go`는 `Map`의 순서와 인코딩이 그 순서를 양쪽으로 지키는지 확인한다.
  latin1 parameter·field마다 U+0100과 바이트 FF가 kind `invalid_text`인지 시험한다. feature `panic-test`, `codec-test`,
  `native-count-test`, `thrown-count-test`는 시험 전용이다: `binding scaffold`가 쓰는 manifest는 어느 것도 기본으로 켜지 않고 `binding check`가 다른 manifest를 거부하며(CK-19),
  끝에서 끝까지 확인은 feature 없이 정적 라이브러리를 빌드해 시험용 진입점(`__panic_test`, `__echo_`, `__arm_faults`,
  `__fault_left`, `__alias_in_`, `__number_in`, `__native_count`, `__thrown_count`)이 있으면 실패한다. build tag `polyspec_codec_test`와 C ABI
  crate의 feature `codec-test`에서는 시험용 진입점이 latin1 값(계약이 latin1을 받고 줄 때), `map<text>`, 모든 key 종류의
  `keyed_map<text>`(그런 map을 받고 줄 때)를 바인딩의 변환을 거쳐 그대로 돌려준다. `zz_generated_codec_test.go`는
  U+0000~U+00FF, map의 순서, keyed map의 key 순서와 종류가 그대로 돌아오고 U+0100이 거부되는지 확인한다. 이 레포 alias의
  case는 `AliasIn<Alias>`로 그 `in` 함수만 실행한다. 계약이 모든 key 종류를
  적지 않은 `keyed_map` parameter·field는 빠진 종류의 key로 kind `invalid_argument_type`을 시험한다. case의 latin1 값은 그 rune의 Go 문자열이다. case는 `map`을 순서대로의 항목을 가진 객체로,
  `keyed_map`을 GN-13처럼 준다.
- **GN-13g** Go: 수 타입의 parameter는 그 Go 타입의 값만 담으므로, GN-13의 B-2 값 가운데 다른 Go 타입의 값(`int`,
  `uint`, `int64`에서 true, "7", 1.5, NaN과 무한대, `uint`에서 -1, `float`에서 true, "7"과 정수)은 호출의 인자가 될 수 없다.
  계약의 parameter가 가진 수 타입마다, feature `codec-test`와 build tag `polyspec_codec_test`는 진입점
  `<prefix>__number_in` 위에 `internal/binding`의 함수 `<Type>In(value any, subject string) error`(`UintIn`, `IntIn`,
  `Int64In`, `FloatIn`)를 준다. 함수는 Go 값을 host 값으로 encode한다: bool, int64 범위의 Go 정수, 그 위의 Go 정수, Go
  float, Go 문자열, 또는 그 밖의 값이다. 진입점은 그 값을 바인딩의 그 수 타입 변환으로 판정한다: 그 수 타입의 Go
  타입 값은 GN-12a의 범위를 거치고, 다른 타입의 값은 subject와 함께 B-2의 kind `invalid_number`다. 그래서 오류는 다른
  target에서 그 인자로 부른 호출이 주는 오류와 같다. `zz_generated_codec_test.go`는 그런 타입마다 GN-13의 B-2 값을
  확인하고, 그 타입의 값(7, float이면 1.5와 NaN)은 통과한다. 수 parameter에 다른 타입의 host 값을 가진 다른 레포의
  시험(입력 타입이 있는 legacy case 등)은 Go 호출이 그 값을 받을 수 없으므로 이 함수로 그 값을 넘긴다.
- **GN-13c** WASM: `packages/ts/wasm/generated/tests/generated.test.mjs`는 Node의 GN-13 시험을, class member의 시험을
  포함하고 K-2 시험과 case의 callback fixture, alias의 U-7 시험(GN-18b)도 포함해, 설치한 패키지의 subpath `./wasm`에 대해
  `node --test`로 실행한다. B-7 시험은 마지막에 실행한다: panic 진입점을 `state.mjs`를 거쳐 불러 kind
  `internal`을 기대하고, 그 뒤의 호출은 인스턴스가 trap했으면 kind `internal`이고 모듈이 unwind하면 성공해야 한다(GW-7).

## 끝에서 끝까지 확인

- **GN-14** `make e2e REPO=<checkout> [WORK=<directory>] [BINDING=<commit>] [DEPS="<checkout>..."]`는
  checkout의 Node.js로 commit `BINDING`의 `scripts/e2e.mts`를 디렉터리 `WORK`에서 실행하며(GN-14b), `WORK`가 없으면
  실행이 시스템 임시 디렉터리 아래에 디렉터리를 만들고, 실행이 끝날 때, 실패할 때, SIGINT와 SIGTERM을 받을 때 실행의
  모든 프로세스가 끝난 뒤에 그것을 지운다. 그래서 `WORK` 없는 실행은 checkout에 기록 말고는 아무것도 쓰지 않는다
  (`tests/e2e/sample`과 `tests/e2e/shapes`는 아직 어느 polyspec 레포도 혼자 생성하지 않는 항목의 레포이며, 앞의 것은 그 가운데 `then` 호출의 두 꼴을 갖고(GN-13f: 자기 fault를 장전하고 그 실패를 settle에 남기는 counter의 tally, 그리고 그것에서 만든 slip이 그 뒤에 놓치는 shelf의 clear), 뒤의 것은 Python·Node·PHP의 GN-6i, GN-6j, GN-7a 항목과, `source`와 기본값을 받는 receiver `&mut self`의 member(GN-6h)를 갖는다. `tests/e2e/classes`는 모든 종류의 member를 가진 class unit의 레포이며 WASM이 거부하는 unit이 없다(GN-18a). `tests/e2e/consumer`는 sample의 값 alias를 쓰고 property가 있는 오류 unit을 가진 레포이며(GN-6k, GN-7a) `--dep tests/e2e/sample`과 함께 실행한다. `tests/e2e/plot`은 `tests/e2e/points`의 record `point`를 받고 주는 레포이며(GN-6c, GN-15f) `--dep tests/e2e/points`와 함께 실행한다. 레포의 Go 프로그램이 그 Go module을 import하므로 실행은 그 Go 정적 라이브러리를 시험 feature와 함께 레포의 것 옆에 빌드한다(GN-15f); `DEPS`는 contract가 타입을 가리키는 레포마다 그 checkout을 적는다; 그 패키지를 먼저 빌드해 설치하며, 모두 실행의 사본 안에서 하고 checkout에는 아무것도 쓰지 않는다: Python은 그 wheel, PHP는 그 확장, Go는 `go.mod`가 require하는 Go 모듈의 정적 라이브러리, Node와 WASM은 그 npm 패키지이며, addon은 플랫폼 패키지로, WASM 모듈은 glue와 함께 넣는다. npm 패키지는 실행이 npm 패키지를 pack하는 contract가 직접 또는 다른 그런 레포를 거쳐 가리키는 `DEPS`의 레포마다 만든다. 그 contract의 생성된 entry가 Node에서, 그리고 subpath `./wasm`으로 owner의 npm 패키지를 import하기 때문이다. contract가 가리키는 `DEPS`의 레포에 그 대상 `node`나 `wasm`이 없으면 대상 `node`와 `wasm`의 이름 있는 실패다) 레포의 커밋된 tree를 복사하고, 실행의 binding을 받는 변경을 하며 하나씩 출력하고(GN-14d), `binding check`를 실행하고, 코어를
  생성기 없이 시험하고, case 파일이 case 규약을 따르는지 확인하고(GN-14d), target마다 생성하고, 코어를 lint하고 각 바인딩 crate를 host에서 그 매니페스트의 시험 feature로, 그리고 feature 없이 lint하고(시험 feature의 진입점만 쓰는 import나 helper는 feature 없는 빌드에서만 쓰이지 않기 때문이다, GN-5), 각
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
  `wasm32-unknown-unknown`, php는 `.php-version`의 PHP(기계의 PHP를 그대로 감싸므로 minor를 비교한다), `config/phpunit`의
  PHPUnit, component `llvm-tools`의 `llvm-nm`(GN-8a), go는 `mise.toml`의 Go와 그 `llvm-nm`(BD-10 (d))이다. 확인 자체는 `mise.toml`의 Node.js로
  돌고, 실행의 모든 명령은 checkout의 `rust-toolchain.toml`의 Rust toolchain을 쓴다(`RUSTUP_TOOLCHAIN`). 그렇지 않으면
  rustup은 명령의 디렉터리에서 toolchain 파일을 읽으므로, 사본 안에서 도는 명령은 사본의 toolchain이나 기계의 기본값으로
  빌드한다. 도구가 없으면 확인은 아무것도 복사하기 전에 실패하고 target, 도구, 그것을 고정하는 파일, `make install`을 적는다.
  target을 빼거나 다른 도구로 돌리는 스위치, 옵션, 환경 변수는 없고, target의 생성 시험과 case 시험은 건너뛰지 않는다.
  runner의 설정이 필요한 시험(GN-18a의 collector 등)은 확인이 그 설정을 주며 설정이 없으면 실패한다. 이유: 돌지 않은 target은
  검증되지 않았는데 결과는 통과로 보이고, checkout이 고정하지 않은 도구의 결과는 되풀이할 수 없다. 실행은 target마다 한 일을
  lint와 시험으로 갈라 적고 끝난다. host에서의 crate lint, `php -l`, `gofmt -l`, `go vet`, `llvm-nm`, `tsc`는 코드를 읽을
  뿐 실행하지 않으므로 어느 target도 검증하지 않는다. PHPUnit 실행은 그 JUnit 기록이 시험을 하나 이상 적을 때만 시험으로 세고, `go test`는 `-json`으로 실행해 그 사건에서
  통과·실패·건너뜀 시험을 세며, 시험이 하나도 돌지 않은 target이 있으면 실행은 실패한다. 건너뛴 Go 시험은 이름을 적고 실행을
  실패시킨다. 아무것도 검증하지 않기 때문이다. 빌드되지 않는 패키지는 그 빌드의 사건을 `build-output`과 `build-fail`로
  끝낸다. 실행은 그 출력을 적고 그것을 패키지 실패의 원인으로 이름한다. link 오류는 거기에서만 보이기 때문이다. macOS에서 PHP
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
  `GOTOOLCHAIN=local`, `GOWORK`, WASM에는 `--expose-gc`(GN-18a), 그리고 case 파일을 적은 `CASES`. `GOWORK`는 작업 디렉터리의
  `go.work`를 가리키며, 그 파일은 사본의 Go module과, 그 `go.mod`가 `replace` 없이 `v0.0.0`으로 요구하는(GN-15f의 개발 형태)
  `DEPS` 각 레포 사본의 Go module을 사용하고, 실행은 사용하는 module을 출력한다. 그런 의존이 없으면 `GOWORK`는 `off`이므로
  사본 위 디렉터리의 `go.work`를 읽지 않는다. 이유: 개발 checkout은 그 형태를 추적되지 않는 `go.work`로 해소하는데 사본에는
  그 파일이 없고, 실행은 모든 target의 모든 의존을 `DEPS` 사본의 패키지로 해소한다. `tests/e2e/<library>`에 `bench.mjs`, `bench.py`, `bench.php`가 있으면
  실행은 Node, Python, PHP의 case 뒤에 그것으로 측정하고, checkout의 파일 `var/report/bench/<library>-<language>.json`(무시됨)인
  `BENCH_REPORT`를 준다. 측정은 각 측정을 고정된 횟수만큼 실행한 중앙값과 그때의 load average를 그 파일에 쓰고, 한계를 넘으면
  `WARNING`을 출력할 뿐 실패하지 않는다. 그 빌드는 시험의 debug 빌드이므로, 측정이 보고하는 것은 같은 빌드의 두 경로의 비율이다(B2.87).
  `tests/e2e`의 레포는 모든 레포처럼 바인딩
  crate를 workspace의 구성원으로 갖고, 바인딩 package는 추적하지 않으며 그것은 실행의 scaffold가 쓴다. 이유: 레포가 하지 않은
  사본의 변경은 어느 commit에도 없는 레포를 확인하고, 그러면 고쳐 준 결함은 실행에서 통과하고 레포에 남는다.

- **GN-14e** 실행은 레포의 모든 계약을 받는다(L-1): `packages/rust/interface.json`과 각
  `packages/<component>/rust/interface.json`을 경로 순서로 받고, 계약이 없는 레포는 실패한다. 각 계약은 자기 배치(`place`,
  L-2a)에서 scaffold, 검사, 생성, 빌드, 시험을 받고, 실행 기록은 계약의 경로를 적는다. host Node 패키지의 생성 시험은
  옆의 생성 진입점을 import하므로, 실행은 그 시험을 설치된 패키지 안의 사본과 같은 자리에 둔다.
- **GN-14f** Go 모듈의 release 형태(GN-15g): Go 시험 뒤에 실행은 레포의 각 계약과, 그 `go.mod`가 Go 모듈을 require하는
  각 의존 레포의 정적 라이브러리를 release profile로 feature 없이 빌드하고, `llvm-tools`의 `llvm-strip --strip-debug`로
  debug section을 떼고, `llvm-size -A`가 그 안에 debug section을 여전히 적으면 실패하며, 각각에 대해 remote를 대신하는 Git 레포를 work
  디렉터리에 만든다. commit 하나의 tree는 제자리의 Go 모듈과 `internal/ffi/lib/<platform>`에 둔 실행 플랫폼의
  라이브러리이고, tag는 `<Go 모듈 디렉터리>/<version>`이다. version은 `v`와 코어의 version이고, 의존 레포는 `go.mod`가
  require하는 version이다. Git은 `https://github.com/<owner>/`를 이 레포들의 디렉터리로 읽는다(실행의 설정 파일의
  `url.<base>.insteadOf`이며, 이 명령들의 Git이 읽는 설정은 그 파일 하나다). 그래서 `go`는 network 없이 각 모듈을 모듈
  경로와 tag로 받는다. 소비자 모듈의 `go.mod`는 각 계약의 Go 모듈의 `require` 줄만 담고, 소비자의 시험 하나가 그
  모듈들의 모든 패키지를 import한다. 실행은 `go mod tidy`로 `go.sum`을 쓴 다음, 소비자와 받은 모듈의 모든 패키지의
  `go test`를 실행의 모듈 cache에서 돌린다. Go는 그 cache의 디렉터리를 읽기 전용으로 두며, 환경은 `GOPROXY=direct`, 빈
  `GOFLAGS`이고 `CGO_LDFLAGS`는 없다. 소비자의 `go.mod`에 `replace`가 있으면 실행은 실패하고, 시험은 GN-14a대로 센다.
  단계가 끝나면 `go clean -modcache`로 모듈 cache를 지운다. 이유: 사본의 생성 시험은 빌드의 라이브러리를 `CGO_LDFLAGS`로
  링크하므로, tag로 받은 모듈이 자기가 실은 라이브러리를 링크한다는 것은 이 단계만 보인다.
- **GN-14h** 실행은 각 target에서 생성기가 쓰는 것과 `tests/e2e/<library>`의 계약 case를 시험하고, 레포의 시험은
  실행하지 않는다. unittest는 `packages/python/generated/tests`와 case runner를 찾고, `node --test`는 Node와 WASM의
  `generated.test.mjs`와 case runner를 실행하며, PHPUnit은 `packages/php-ext/generated/tests`와 `CasesTest.php`를
  실행하고, Go module의 `go vet`과 `go test`는 파일 `zz_generated*_test.go`(GN-13b)와 실행이 복사한
  `tests/cases_test.go`를 읽는다. Go module의 다른 시험 파일은 모두 레포의 시험이다. `go vet`과 `go test`의
  overlay(`-overlay`, 작업 디렉터리의 파일)가 각각을 없는 것으로 다루고 실행은 그 경로를 출력하므로, 사본의 파일은
  바뀌지 않는다. 배포 형태(GN-14f)의 원본도 같은 파일을 뺀다. 코어의 시험(GN-14)은 모든 target의 단계이며 남는다.
  이유: 레포의 시험은 레포의 runner가 주는 입력, 예를 들어 환경 변수로 주는 case 파일의 경로를 읽는데 실행은 그것을
  모르며, 한 target이 다른 target보다 더 많이 실행하면 같은 계약에 다른 결과를 낸다.
- **GN-14g** CI가 실행하는 `tests/e2e`의 계약: `.github/workflows/ci.yml`의 job `e2e`는 코어가 `tests/e2e`의 레포에만
  의존하는 `tests/e2e`의 모든 레포를, 그 레포들을 `DEPS`로 주어 실행하며, job의 어떤 항목도 checkout에 없는 디렉터리를
  적지 않는다. 코어가 `tests/e2e`에 없는 레포에 의존하는 계약은, 그 계약의 추적되는 파일이 그 레포의 release tag를 적을
  때에만 job이 실행한다. 그때까지 `tests/e2e/not-in-ci.json`이 그 계약을 이유와 끝나는 조건과 함께 적고, job에는 그
  항목이 없다. `packages/ts/tests/ci-workflow.test.ts`는 job에도 목록에도 없는 계약, 둘 다에 있는 계약, 그리고 코어가
  `tests/e2e`에 없는 레포를 경로로 더는 적지 않는데 목록에 남은 계약을 실패로 한다. 코어가 json 레포에 의존하는
  `tests/e2e/relay`는 json의 첫 release tag까지 목록에 있다. 목록의 계약도 commit을 push하거나 merge하기 전에 의존
  레포의 checkout을 `DEPS`로 준 `make e2e`로 확인한다. 이유: job은 존재하지 않는 release로 레포를 checkout할 수 없고,
  없는 디렉터리를 적은 항목은 commit의 결함이 아닌 이유로 실패하며, 말없이 job에서 빠진 계약은 확인된 것처럼 보인다.
