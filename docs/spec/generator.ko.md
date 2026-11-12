<!-- doc-id: generator -->
# 생성기

[English](generator.md)

`bindgen generate [--root <repository>] [--out <directory>]`는 `packages/rust/interface.json`을 검사하고
(docs/spec/contract-check.md) 그 target의 바인딩을 쓴다. 이 문서는 설계가 생성기에 맡긴 규칙을 적는다. 설계 id는 bindgen
설계의 것이다.

## 범위

- **GN-1** 생성기는 functions unit, record parameter, enum, 상수, 오류 클래스에 대해 PHP(ext-php-rs 0.16.4), Python(PyO3
  0.30.1, abi3-py314), Node(napi 3.16.2)를 쓴다. 그 밖의 항목(class, callback, value unit, `none`이 아닌 wait, 기본값,
  `only`, `native`, 이름 예외, 의존 kind)은 무엇을 쓰기 전에 이름으로 거부한다(G-4, P-4). Go와 WASM은 아직 생성하지 않는다.
- **GN-2** 결과는 계약, `cases`가 가리키는 case 파일, 코어 crate의 버전과 라이브러리 이름(manifest를 TOML로 읽는다),
  bindgen 자신에만 기댄다. 시각, 경로, 호스트를 담지 않고 목록은 계약 순서다(I-5). `--out`은 같은 파일을 다른 디렉터리에
  쓴다. `packages/ts`의 시험은 두 디렉터리에 두 번 생성해 바이트를 비교한다.

## 배치(L-1, L-2)

- **GN-3** bindgen은 세 디렉터리를 소유하고 각각을 staging 디렉터리를 거쳐 통째로 쓴다. 그래서 이전 생성의 파일이 남지
  않고 읽는 쪽은 일부만 보지 않는다: `packages/php-ext/generated`, `packages/python/generated`, `packages/ts/generated`.
  bindgen의 소스는 레포에 복사하지 않는다. 코어와 바인딩 crate는 `polyspec-bindgen-core`에 의존하며, 첫 릴리스 전에는
  bindgen 레포의 Git 의존이고 레포의 `Cargo.lock`이 커밋을 고정한다.
- **GN-3a** 바인딩마다 최종 자리에 추적하는 얇은 package가 있다: `packages/<python|ts|php-ext>/Cargo.toml`, crate의 속성을
  갖고 `generated/lib.rs`를 include하는 진입 `src/lib.rs`(include된 파일은 그 속성을 가질 수 없다), 언어의 manifest
  (`pyproject.toml`, `package.json`, `composer.json`, 언어의 패키저가 crate 옆에 필요로 한다). `bindgen scaffold`가 이것을
  쓰고 `bindgen check`가 쓸 내용과 비교한다(CK-19). 그래서 이것을 바꾸는 bindgen 변경은 레포의 diff에 드러난다. 이 파일들은
  라이브러리 이름, target, 코어 버전에만 기댄다. 코어는 생성기 없이 빌드와 시험이 되고, 바인딩 crate만 `make bindings`가
  필요하다.
- **GN-4** 바인딩 crate는 레포 workspace의 구성원이고(L-2) R-1의 lint를 스스로 갖는다. `unsafe_code`는 forbid가 아니라
  deny다. ext-php-rs와 napi-rs의 macro가 unsafe 코드로 펼쳐지고 코어의 workspace는 그것을 금할 수 있기 때문이며, 생성
  코드의 unsafe 블록마다 이유를 단 allow가 있다. lint가 죽은 코드를 금하므로 생성 코드는 쓰는 도우미 함수만 갖는다.
- **GN-5** 모든 crate는 `rust-version = "1.99.0"`과 B-7 시험의 진입점을 더하는 feature `panic-test`를 갖는다.

## 코어 경계(T-1, I-2 (1))

- **GN-6** 인자마다 T-1의 Rust 타입을 적은 `let`으로 바꾼다. 두 형태를 가진 타입(text, latin1, bytes, source, path)의
  parameter는 빌려서 넘기고(`&String`과 `&Vec<u8>`는 `&str`과 `&[u8]`로 바뀐다), 그런 타입의 `optional<T>`는
  `as_deref()`로, Copy 타입(bool, 수, enum)은 값으로, 그 밖의 타입(list, record)은 참조로 넘긴다. record는 소유 형태인
  펼친 field로 만든다.
- **GN-7** `raises`가 있는 member는 `Result`를 돌려주는 코어를 부른다. 그 오류는 wildcard 없는 match로 kind의 category
  라이브러리 클래스가 되고, kind, status, errno는 `bindgen_core::Kinds`에서 읽는다(I-2 (3)). 패턴 `Variant { .. }`는
  데이터가 있든 없든 변형에 맞는다. bindgen은 Rust 소스를 읽지 않기 때문이며, 그에 대한 lint는 이유 I-2로 허용한다.
- **GN-8** 모든 진입점은 본문을 `catch_unwind`로 실행한다. panic은 프레임워크의 panic 오류가 아니라 internal category
  클래스의 kind `internal`로 호출자에게 도달한다(B-7).

## 언어

- **GN-9** 이름은 N-2를 따른다. 상수는 PHP, Python, JavaScript에서 UPPER_SNAKE_CASE(PSR-1, PEP 8), Go에서 PascalCase이며,
  두 이름 변환(TypeScript와 `bindgen_core::naming`)이 시험 벡터를 함께 쓴다.
- **GN-10** PHP: member마다 그 module의 namespace(P-2)에 함수 하나를 두며, parameter는 확장이 판정하는 아무 값(`&Zval`)을
  받는다(T-8). 엔진이 arginfo로 인자를 세고 이름을 확인한다(G-7). arginfo가 타입을 적지 않으므로 stub은 `mixed`를 적고 계약
  타입은 `@param`에 적는다. record field는 parameter 뒤의 이름 있는 parameter다. category 클래스는 module 시작 때
  `ClassBuilder`로 등록하고, 엔진의 class table에서 찾은 E-2 클래스를 상속하며, 클래스 자신의 객체 handler를 유지하므로 오류는
  호출의 file, line, trace를 갖는다. `kind()`, `status()`, `errno()`는 private 속성을 읽는다. enum은 backed enum이다(T-6).
  ext-php-rs의 `php_module` 펼침이 `Option::map_or`를 쓰므로 그 module만 그 allow를 갖는다.
- **GN-11** Python: native module `<root>._native`는 원시 값을 받고(T-8) record field는 keyword-only다. 런타임이 인자를 세고
  이름을 확인한다(G-7). category 클래스는 `<root>._errors`, enum은 `<root>._types`에 있고 native module이 로드될 때 그것을
  import한다(B-4). 계약의 module은 `<root>.<module>`이고 `<root>`가 모든 공개 이름을 다시 내보낸다(P-3). enum은
  `enum.StrEnum`이다(T-6). 패키지는 Python 3.14가 필요하다(abi3-py314). list parameter는
  list나 tuple을 받는다. `polyspec`에는 `__init__.py`가 없다(P-1).
- **GN-12** Node: addon은 원시 값을 받는다(T-8). 생성된 CommonJS 진입점은 인자의 개수, 이름, options record member의 존재를
  확인하고(G-7, T-4), list parameter에서 문자열이 아닌 iterable을 배열로 바꾼다(T-7). 진입점은 로드될 때 라이브러리
  클래스를 addon에 넘기고 addon은 각각의 참조(napi `FunctionRef`)를 갖는다. 실패는 addon이 메시지, kind, status, errno로
  만든 그 클래스의 인스턴스이며 addon이 던진다(B-4). ESM 진입점은 CommonJS 진입점을 다시 내보내므로 둘은 클래스를 함께 쓴다.

## 생성 시험(G-5)

- **GN-13** 함수마다 각 언어의 시험 module은 다음을 확인한다. B-2: 수 parameter와 field마다 G-5의 값(NaN, 무한대, 1.5,
  true, "7", uint에 -1, Node에 2^53)이 value 클래스의 kind `invalid_number`다. B-3: 짝 없는 surrogate가 든 text(PHP는 UTF-8이
  아닌 바이트)와 U+0100이 든 latin1 text가 kind `invalid_text`다. B-4: 실패하는 모든 contract case가 정확한 클래스, E-2의 기반
  클래스, kind, status, errno를 낸다. B-7: panic 진입점이 kind `internal`이다. G-7: 빠진 인자, 하나 많은 인자, 없는 이름(PHP
  이름 있는 인자, Python keyword, Node options record의 member와 빠진 member). case의 인자는 snake_case 키이고, record
  parameter는 field의 객체, enum은 값 텍스트, latin1 값은 U+0000~U+00FF의 텍스트다.

## 끝에서 끝까지 확인

- **GN-14** `node scripts/e2e.mts --repo <http-cookies> --work <directory> --phpunit <phpunit> [--python <python3.14>]`는
  http-cookies의 커밋된 tree를 복사하고, 레포가 아직 하지 않은 변경(루트 workspace, bindgen_core 의존과 `Kinds`,
  `bindgen scaffold`의 추적 package)을 하며 하나씩 출력하고, `bindgen check`를 실행하고, 코어를 생성기 없이 시험하고, 생성하고,
  workspace를 lint하고, 각 패키지를 빌드해 설치한 뒤, 생성 시험과 contract case(`tests/e2e/http-cookies`)를 unittest,
  `node --test`, PHPUnit으로 실행한다. bindgen의 Git 의존은 실행의 명령에 한해 checkout의 커밋으로 풀린다
  (`url.<base>.insteadOf`).
