<!-- doc-id: generator -->
# 생성기

[English](generator.md)

`bindgen generate [--root <repository>] [--out <directory>]`는 `packages/rust/interface.json`을 검사하고
(docs/spec/contract-check.md) 그 target의 바인딩을 쓴다. 이 문서는 설계가 생성기에 맡긴 규칙을 적는다. 설계 id는 bindgen
설계의 것이다.

## 범위

- **GN-1** 생성기는 functions unit, record(parameter와 결과 형태), enum, 상수, 오류 클래스에 대해 PHP(ext-php-rs 0.16.4),
  Python(PyO3 0.30.1, abi3-py314), Node(napi 3.16.2), Go(C ABI 정적 라이브러리 위의 cgo, GN-15)를 쓴다. 그 밖의 항목(class, callback, value unit, `none`이 아닌 wait,
  기본값, `only`, `native`, 이름 예외, 의존 kind, 타입 `source`, 다른 레포의 record)은 무엇을 쓰기 전에 이름으로 거부한다(G-4, P-4). WASM은 아직 생성하지 않는다. Go는 다른 타입 안의 서로 다른 타입의 tuple(Go 배열은 원소 타입이 하나다)과 tuple parameter도 거부한다.
- **GN-2** 결과는 계약, `cases`가 가리키는 case 파일, 코어 crate의 버전과 라이브러리 이름(manifest를 TOML로 읽는다),
  bindgen 자신에만 기댄다. 시각, 경로, 호스트를 담지 않고 목록은 계약 순서다(I-5). `--out`은 같은 파일을 다른 디렉터리에
  쓴다. `packages/ts`의 시험은 두 디렉터리에 두 번 생성해 바이트를 비교한다.

## 배치(L-1, L-2)

- **GN-3** bindgen은 세 디렉터리를 소유하고 각각을 staging 디렉터리를 거쳐 통째로 쓴다. 그래서 이전 생성의 파일이 남지
  않고 읽는 쪽은 일부만 보지 않는다: `packages/php-ext/generated`, `packages/python/generated`, `packages/ts/generated`,
  `packages/go/internal/ffi/generated`. 생성 패키지 옆에 손으로 쓰는 폴더가 있는 Go 모듈(L-1)에서는 디렉터리가 아니라
  `zz_generated_*.go` 파일을 소유한다: 생성은 `packages/go` 아래의 그 파일을 모두 지우고 자기 것을 쓰며, 그 파일은 추적한다(G-6).
  bindgen의 소스는 레포에 복사하지 않는다. 코어와 바인딩 crate는 `polyspec-bindgen-core`에 의존하며, 첫 릴리스 전에는
  bindgen 레포의 Git 의존이고 레포의 `Cargo.lock`이 커밋을 고정한다.
- **GN-3a** 바인딩마다 최종 자리에 추적하는 얇은 package가 있다: `packages/<python|ts|php-ext>/Cargo.toml`, crate의 속성을
  갖고 `generated/lib.rs`를 include하는 진입 `src/lib.rs`(include된 파일은 그 속성을 가질 수 없다), 언어의 manifest
  (`pyproject.toml`, `package.json`, `composer.json`, 언어의 패키저가 crate 옆에 필요로 한다), 계약과 무관한 crate 파일(manifest가
  가리키는 Node `build.rs`; 그래서 생성 전에도 `cargo fmt --all`과 workspace metadata가 된다). 코어가
  `packages/<component>/rust`이면(L-1) 바인딩 package와 생성 디렉터리는 `packages/<component>/<python|ts|php-ext>`이고,
  `scaffold`와 `generate`는 그 계약을 `--contract`로 받는다. `bindgen scaffold`가 이것을
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
  펼친 field로 만든다. 반환은 그 Rust 함수에 보통인 형태이므로(접근자는 빌린 형태, 계산한 값은 소유) 생성 코드는 타입을
  적지 않고 묶어 두 형태를 같은 식(`AsRef`, `Borrow`, `IntoIterator`, tuple field의 참조)으로 읽는다. 정수 반환(uint, int,
  int64)은 더 좁은 Rust 정수여도 되며 생성 코드가 `From`으로 넓힌다(정수와 그 참조에 대한 trait `WideUint`, `WideInt`).
  parameter는 표의 타입 그대로다. Rust 키워드인 계약 이름은 raw identifier(`r#type`)다.
- **GN-6a** 함수가 돌려주거나 parameter의 원소인 record는 언어마다 결과 형태(T-4)를 갖는다: Python은 `<root>._types`의 frozen
  keyword-only `dataclass`, Node는 member의 plain object, PHP는 생성자가 모든 field를 이름으로 받는 public readonly 속성의
  final 클래스. 바인딩은 양방향으로 바꾸며(`in_<record>`, `out_<record>`), 그 자리의 다른 타입 값은 kind
  `invalid_argument_type`이다.
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
  ext-php-rs의 `php_function`과 `php_module` 펼침이 `Option::map_or`와 `Result::unwrap_or`를 부르므로 함수와 module 진입은
  그 allow 하나를 가진 한 module에 있다.
- **GN-11** Python: native module `<root>._native`는 원시 값을 받고(T-8) record field는 keyword-only다. 런타임이 인자를 세고
  이름을 확인한다(G-7). category 클래스는 `<root>._errors`, enum은 `<root>._types`에 있고 native module이 로드될 때 그것을
  import한다(B-4). 계약의 module은 `<root>.<module>`이고 `<root>`가 모든 공개 이름을 다시 내보낸다(P-3). enum은
  `enum.StrEnum`이다(T-6). 패키지는 Python 3.14가 필요하다(abi3-py314). list parameter는
  list나 tuple을 받는다. `polyspec`에는 `__init__.py`가 없다(P-1).
- **GN-12** Node: addon은 원시 값을 받는다(T-8). 생성된 CommonJS 진입점은 인자의 개수, 이름, options record member의 존재를
  확인하고(G-7, T-4), list parameter에서 문자열이 아닌 iterable을 배열로 바꾼다(T-7). 진입점은 로드될 때 라이브러리
  클래스를 addon에 넘기고 addon은 각각의 참조(napi `FunctionRef`)를 갖는다. 실패는 addon이 메시지, kind, status, errno로
  만든 그 클래스의 인스턴스이며 addon이 던진다(B-4). ESM 진입점은 CommonJS 진입점을 다시 내보내므로 둘은 클래스를 함께 쓴다.

- **GN-15** Go(E-7, B-8, L-1): `packages/go`가 Go 모듈이다(`packages.go`의 module과 `go 1.27.3`을 적은 `go.mod`). 계약
  module은 패키지 `packages/go/<module>`이고 이름은 마지막 마디를 소문자로 구분자 없이 쓴 것이다. 빈 module은 모듈 루트이며
  이름은 라이브러리 이름을 같은 식으로 쓴 것이다(`httpcookies`). import 경로의 마지막 마디 `go`가 예약어이기 때문이다. 그
  `zz_generated_<package>.go`는 module의 함수, record(공개 field의 struct), enum(typed string과 값마다 상수
  `<Enum><Variant>`), 상수(typed `const`)를 담는다. 패키지 `errors`는 E-7의 category 타입 여섯(`ValueError`~`InternalError`)을
  이름 짓고, 각각 `Error()`, `Kind() string`, `Status() (int, bool)`, `Errno() (int, bool)`, `Unwrap() error`를 가진다. 이 타입은
  cgo 호출과 인코딩을 가진 `internal/binding` 타입의 별칭이므로 생성자가 공개 API가 아니다(L-3). C ABI crate
  `polyspec-<repository>-go`는 추적하는 얇은 package `packages/go/internal/ffi`(crate-type `staticlib`, lib
  `polyspec_<repository>_go`)이고 Go는 `-lpolyspec_<repository>_go`로 링크한다. 라이브러리 디렉터리는 `CGO_LDFLAGS=-L<dir>`로
  준다. Go 모듈은 소스로 받아지며 소비자가 플랫폼의 정적 라이브러리를 받는 방법은 아직 정하지 않았기 때문이다(계획 T-2).
  parameter는 lower camel case이고 Go 예약어나 생성 본문의 이름과 같으면 끝에 `_`를 붙인다.
- **GN-16** Go 타입(T-1, T-2, B-8): bool `bool`, int·int64 `int64`, uint `uint64`, float `float64`, text·latin1 `string`,
  bytes `[]byte`, `list<T>` `[]T`, `optional<T>` `*T`, 다른 타입 안의 tuple `[N]T`(원소 타입 하나), tuple 반환은 여러 결과.
  Go 문자열은 바이트다: text는 바이트로 넘기고 C ABI가 UTF-8이 아닌 바이트를 kind `invalid_text`로 거부한다(B-3). latin1은
  바이트 하나가 문자 하나인 문자열이므로 거부할 값이 없다. 코어의 문자열은 UTF-8 바이트로 나간다. 상수가 아닌 enum 값은 kind
  `invalid_argument_type`이다. 코어를 부르는 함수는 마지막에 `error`를 돌려준다(E-7). B-2와 G-7은 Go 타입과 컴파일러가 지킨다.
- **GN-17** C ABI(B-8): 함수마다 `polyspec_<repository>_<module>_<member>(args, len, result) -> int32`다. Go는 인자를
  parameter 순서로 버퍼 하나에 인코딩한다: bool과 존재 표지는 0 또는 1의 한 바이트, 수는 little endian 여덟 바이트(int64는
  2의 보수, float64는 IEEE 754 비트), 문자열과 byte slice는 길이(여덟 바이트)와 바이트, list는 길이와 원소, record는 계약
  순서의 field, enum은 값 텍스트. C ABI는 디코딩하며 판정하고(T-8), 인자는 마지막 parameter에서 끝나야 한다. 코어의 결과나
  실패(E-1의 category 번호, 메시지, kind, status, errno)는 같은 방식으로 Rust가 할당한 버퍼에 인코딩해 `result`에 쓰고, Go는
  그것을 `polyspec_<repository>_free`로 해제한다. 반환은 결과면 0, 실패면 1이다. 인코딩을 따르지 않는 버퍼는 kind `internal`이다.
  모든 함수는 `catch_unwind` 아래에서 실행하므로 panic이 C ABI를 넘지 않는다(B-7). wait `none` member의 호출은 코어가 돌아올
  때 돌아온다.

## 생성 시험(G-5)

- **GN-13** 함수마다 각 언어의 시험 module은 다음을 확인한다. B-2: 수 parameter와 field마다 G-5의 값(NaN, 무한대, 1.5,
  true, "7", uint에 -1, Node에 2^53)이 value 클래스의 kind `invalid_number`다. B-3: 짝 없는 surrogate가 든 text(PHP는 UTF-8이
  아닌 바이트)와 U+0100이 든 latin1 text가 kind `invalid_text`다. B-4: 실패하는 모든 contract case가 정확한 클래스, E-2의 기반
  클래스, kind, status, errno를 낸다. B-7: panic 진입점이 kind `internal`이다. G-7: 빠진 인자, 하나 많은 인자, 없는 이름(PHP
  이름 있는 인자, Python keyword, Node options record의 member와 빠진 member). case의 인자는 snake_case 키이고, record
  parameter는 field의 객체, enum은 값 텍스트, latin1 값은 U+0000~U+00FF의 텍스트다. parameter의 키가 없는 case는 id로
  거부한다.
- **GN-13a** Go: 패키지의 시험은 외부 시험 패키지 `zz_generated_test.go`이며 `go test`로 실행한다: text parameter·field마다
  B-3(바이트 FF), enum parameter·field마다 GN-16의 enum 검사, raise하는 contract case마다 B-4(E-7의 정확한 타입, kind, status,
  errno). B-7은 build tag `polyspec_panic_test`가 붙은 `internal/binding/zz_generated_panic_test.go`이고, 같은 tag가 C ABI의
  panic 진입점도 선언하므로 정적 라이브러리는 그 tag에서만 feature `panic-test`가 필요하다. case의 latin1 값은 문자마다 한
  바이트인 Go 문자열이다.

## 끝에서 끝까지 확인

- **GN-14** `node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit> [--python <python3.14>]`는
  레포의 커밋된 tree를 복사하고, 레포가 아직 하지 않은 변경(루트 workspace와 구성원, bindgen_core 의존과 `Kinds`,
  `bindgen scaffold`의 추적 package)을 하며 하나씩 출력하고, `bindgen check`를 실행하고, 코어를 생성기 없이 시험하고, GN-13을
  따르지 않는 case 파일(camelCase 키, field 값의 배열인 record)을 고쳐 쓰며 출력하고, 생성하고, workspace를 lint하고, 각
  패키지를 빌드해 설치한 뒤, 생성 시험과 `tests/e2e/<library>`에 있으면 contract case를 unittest, `node --test`, PHPUnit으로
  실행한다. bindgen의 Git 의존은 실행의 명령에 한해 checkout의 커밋으로 풀린다
  (`url.<base>.insteadOf`).
