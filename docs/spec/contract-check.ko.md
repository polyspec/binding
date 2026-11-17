<!-- doc-id: contract-check -->
<!-- source-sha256: 51b578e9012d5d93d79d8df81d76dc8102ac5f42424e81df2fbb9bc75f29be2d -->
# 계약 검사

[English](contract-check.md)

`binding check <interface.json>`과 `packages/ts`의 `checkContract(contract, { dependencies })`는 Rust 컴파일러가 판정하지 못하는 인터페이스 계약의 모든 규칙(설계
I-2)과 설계가 계약 검사에 맡긴 모든 규칙을 판정한다. finding이 하나라도 있으면 계약을 거부한다. finding은 아래 검사 id 하나,
항목의 JSON pointer, 규칙을 적는다. `dependencies`는 계약이 가리키는 라이브러리의 계약이다(T-3, E-1b). 명령은 계약 옆
crate에 대해 Cargo가 해석한 패키지(`cargo metadata`)에서 읽는다. 라이브러리의 crate는 `polyspec-<library>`(P-1)이고 그
`interface.json`을 담는다(I-1). 다른 checkout은 읽지 않는다(S15). 필요한 계약이 없으면 그 검사가 그 사실을 보고한다.

스키마와 todo 검사가 먼저 실행되고, 나머지 검사는 둘을 통과한 계약에서만 실행된다. 계약의 형태를 읽기 때문이다.

그 뒤 `binding check`는 계약 검사가 무엇을 찾았든 저장소 파일의 검사 CK-19와 CK-20을 실행하고, 실패하기 전에 모든 finding을
보고한다. 검사는 실패한 검사가 줄 것을 읽는 자리에서만 멈춘다. CK-20은 `core.path`와 저장소의 `Cargo.lock`을 읽으므로 스키마
(CK-1)를 통과한 계약에서 실행된다. CK-19는 `binding scaffold`가 쓰는 것과 비교하며 그것은 package와 이름 항목만 읽으므로
스키마와 package 이름(CK-1, CK-18)을 통과한 계약에서 실행된다. 실행되지 않은 검사는 그것을 멈춘 검사와 함께 이름을 적는다.
이유: 처음 실패한 검사에서 멈추는 실행은 다른 검사의 finding을 가린다. 예를 들어 계약의 finding 뒤에 다른 binding의 pin이
숨는다.

`binding check <interface.json> --release`는 release의 검사 CK-70과 CK-102도 실행한다. recipe `release-binding-check`(생성기 GN-19g)가 이
옵션을 주고, asset의 빌드 recipe는 CI에서도 release에서도 그 recipe를 첫 단계로 실행한다(생성기 GN-19i). 이 검사가 보는 규칙:
레포의 commit된 tree는 어느 branch에서든 release 꼴만 담는다. 추적하는 파일은 다른 polyspec 레포를 tag나 release의 버전으로
이름하고, branch나 commit이나 레포 옆의 checkout으로 이름하지 않으며, checkout을 다른 레포의 checkout에 맞대어 개발하는 일은
추적하지 않는 링크로 한다. 그래서 개발 tree라는 선언은 없고, CK-70이 개발 꼴을 통과시키는 mode도 없다. 옵션이 없는 검사는
CK-70을 실행하지 않는다. 옵션은 release를 내지 않는 tree, 곧 binding의 end-to-end 검사의 레포 같은 것과 아직 줄을 옮기지 않은
레포를 위해 남는다. 이유: 검사가 release에서만 도는 동안에는 branch가 commit한 개발 꼴이 tag 뒤에야 처음
발견되었다(생성기 GN-19i, B2.457).

## 검사

스키마는 npm 패키지 `@polyspec/binding`에 들어 있고 `./schema/interface.schema.json`으로 내보낸다(S15).

- **CK-1** 스키마: 계약이 `packages/ts/schema/interface.schema.json`(JSON Schema 2020-12, Ajv)을 통과한다. 스키마는 strict
  옵션을 하나도 끄지 않은 Ajv strict 모드에서 컴파일되므로 소비자가 그것으로 계약을 검증할 수 있다. 속성을 요구하는
  하위 스키마는 그 속성을 `properties`에도 이름하고(바깥 스키마가 형태를 정하면 `true`), 둘 이상의 타입인 값은 단일 타입의
  `anyOf`다. 모든 reason은 규칙 id이므로
  (`^[A-Z][A-Za-z]*-?[0-9]+[a-z]?(\.[0-9]+)*$`) "지금 이름" 같은 산문 reason은 거부된다(N-3, P-10). `reason` 없는 `native`는
  거부된다(I-3). callback member의 `errors`는 `{recognize, reason}`뿐이다(U-3).
- **CK-2** todo: `binding import`가 남긴 `"todo"` 문자열이나 `todo` 키를 가진 객체가 있으면 실패한다(M-2). todo 자리와 그
  둘레의 스키마 오류는 따로 보고하지 않는다.
- **CK-3** 참조: unit·member id는 유일하다. `parent`, `implements`(`interface` unit), `cleanup`(같은 unit의 member), unit
  타입, `{const}` 기본값(constant), `cases[].member`, `changes[].to`가 해석된다. `only`, `native`, `changes[].from`은 target을
  가리킨다. 모든 target에 `packages` 항목이 있다(P-1, `wasm`은 `node`를 쓴다). 타입에 쓴 값 타입(`json_value`,
  `template_value`, `php_value`)은 `types`에 소유자가 있다(T-3). `faults`의 id는 유일하고, 그 `fills`의 kind는 모두
  `errors.kinds`의 kind다(G-5, E-1). `errors.kinds`의 행은 `kinds`에 적은 kind들을 내고, `kinds`가 없으면 variant 이름을
  snake_case로 쓴 kind 하나를 낸다. `cases`의 행은 `member`나 `alias`를 가리키며, `alias`는 이 계약의 `core: {in, out}`를
  가진 값 alias다(U-7).
- **CK-4** 이름 예외(N-3): 예외는 target과, 있는 unit, 그 unit의 member, 그 member의 parameter, 그 record의 field를 가리킨다.
  기호와 언어마다 예외는 하나다. 예외는 변환한 이름(N-2)과 달라야 한다. 아무것도 바꾸지 않는 예외에는 근거가 없기 때문이다.
- **CK-5** optional 반환과 field(T-5, T-4): `optional<T>`를 돌려주는 member는 `optional_reason`을 갖고, 그런 member만
  갖는다. 타입이 `optional<T>`인 record field는 `reason`을 갖고, 그런 field만 갖는다.
- **CK-6** 순환(P-4): `implements`와 오류 `parent`는 순환하지 않는다.
- **CK-8** value unit(U-1, U-7):
  - value alias는 `HostValue`로 설명한 언어 값을 판정하는 코어 함수
    (`fn(&mut dyn HostValues, HostValue) -> Result<T, Failure<E>>`)와 코어 값을 `OutValue`로 주는 코어 함수(`&T`를 받아
    `(OutValue, V)`를 돌려주며 `V: OutValues`가 그 값을 빌릴 수 있는 함수)를 `core: {in, out}`에 적는다. 값 타입을 대표하는
    value class는 그런 `core`와 `core_type`을 적을 수 있고, 다른 레포는 그 함수로 그 값을 주고받는다(GN-6x). 자기 바인딩은
    그 함수를 부르지 않는다. `in` 행이 그 member를 읽고, 자기 레포는 native 객체를 꺼내기 때문이다(T-3). 그 밖의 unit은
    `core: {in, out}`을 갖지 않는다.
  - 값 타입을 대표하는 unit이 `out`과 `in`을 갖는다. alias가 모으지 않는 `value` class이거나 `alias`(origin `value`)다.
    alias가 모으는 class(alias의 `in` 행이 그것을 가리킨다)는 둘 다 갖지 않는다. alias의 구성원은 그 `in` 행의 언어
    타입이다(U-7 (a)).
  - `in` 행은 target과, 아래 표의 내장 타입이거나 대표 class 자신이거나 대표 alias가 모으는 class인 언어 타입을 가리킨다.
    언어와 타입마다 행은 하나다.
  - `by`가 있으면 `by`는 계약의 `enum` unit을 돌려주는 공개 member이고, 모든 case가 `is`를 갖고 `when`이 없으며, enum의
    모든 값이 정확히 한 case의 `is`다. `by`가 없으면 class의 행은 case 하나이고 `is`가 없으며, 내장 타입의 행은 한 kind의
    행처럼(아래) `when`으로 case를 나눌 수 있고 술어는 코어가 판정한다(U-7 (f)).
  - class의 case는 공개 member인 `read`를 적고, 내장 타입의 case는 `read: builtin`이다(U-7 (e)). kind `null`이나
    `native`인 case는 내용이 없거나 코어가 열어 보지 않으므로 `read`가 없다(U-1, VAL-18). kind `native`는 형태
    `native`로 만들고 그 형태는 다른 kind를 만들지 않는다. native 값은 `OutValue::Native`의 handle로 들어온 언어 객체
    그대로이기 때문이다(VAL-18).
  - `by`가 있는 class의 kind `text` case는 `uint`의 list를 주는 공개 member인 `units`를 적을 수 있다. 그러면 `read`는
    optional `text`를 주고, 없음은 그 text가 Unicode text가 아니어서 `units`가 주는 UTF-16 code unit으로 읽는다는
    뜻이다(GN-6x). 그래서 `read` 한 번의 호출이 언어의 모든 text를 한 번 판정하고, code unit은 짝 없는 surrogate를
    가진 text에서만 경계를 건넌다(B2.89).
  - `out` 행은 모든 target에서 값을 만든다. `make`는 그 언어에 있는 내장 형태(`keyed_map`은 `{keyed_map: {key: [...]}}`),
    대표 class나 alias가 모으는 class의 공개 `constructor`·`static` member, 또는 kind `nested:X`의 `{value: X}`다.
  - `when`은 행의 kind에 해당하는 술어이거나 `else`다. 한 kind의 행과 한 내장 `in` 행의 case는 `when` 없는 것 하나, 같은
    술어의 `is: true`와 `is: false`, 또는 서로 다른 술어 값들과 나머지를 받는 `else` 하나다(U-7 (b)).
  - 왕복(P-3): `make`가 만드는 언어 타입은 그 언어의 `in` 행을 갖고, 그 행은 값을 행의 kind로 분류한다. 내장 형태는
    binding의 닫힌 표가 만든 값의 술어를 정한다(행의 `when`, `else` 행은 형제 행들이 한 값으로 고른 술어의 다른 값,
    `text`는 UTF-8, `int`는 정수인 안전 정수, `list`는 키 0~n-1). `when`이 맞는 첫 case가 그 case이며, 표가 정하지 않는
    술어는 finding이다. `by`가 있는 class는 `is`를 실행 때만 알 수 있으므로 행의 kind가 case 하나를 정확히
    가리켜야 하며, `units`를 가진 kind `text`의 case는 kind `text16`의 case이기도 하다. 짝 없는 surrogate를 가진 text를
    그 UTF-16 code unit으로 읽기 때문이다(GN-6x). case 중 하나라도 맞으면 통과로 보는 검사는 잘못된 분류를 통과시키므로 쓰지 않는다. G-5의 생성 왕복
    시험은 남는다.
  - `writable`은 `value` unit의 property만 갖는다(U-2).
  - `in_raises`는 `core: {in, out}`를 가진 값 alias에만 두고 이 계약 `errors.kinds`의 variant를 가리킨다. 그 `in` 함수가 낼
    수 있는 kind이며, 그 alias를 받는 모든 member에 붙고 `raises`에는 적지 않는다(U-7, E-5).
- **CK-9** 다른 레포의 unit(T-3): 타입에 쓴 다른 라이브러리의 unit은 그 계약의 `value`, `callback`, `enum`, `record`,
  `variant` unit이다. 다른 라이브러리의 callback·record·variant가 쓰는 unit은 자기 라이브러리의 것이든 제3 라이브러리의
  것이든, 타입으로 적었든 그 계약의 이름 있는 타입(`types`)으로 적었든, 그것을 가진 라이브러리의 계약에 대해 같은 규칙으로
  재귀적으로 확인한다. `types`의 값 타입은 소유자의 `value` unit을 가리킨다. `binding`은 계약을 닫힘까지 읽는다. 곧 계약이
  이름하는 라이브러리의 계약과 그 계약들이 이름하는 라이브러리의 계약을, Cargo가 코어에 대해 해석한 package에서 읽는다. 그
  라이브러리에 없는 unit과 계약을 찾지 못한 라이브러리는 finding이다. 계약이 서로를 순환으로 이름하는 라이브러리는 그
  이름과 함께 거부한다. Cargo가 crate의 순환을 해석하지 않기 때문이다.
- **CK-10** 오류(E-1, E-1a, E-2, U-1): 오류 unit은 category를 갖고, category와 parent는 오류 unit만 갖는다. parent는 같은
  category의 오류 unit이고 `final`이 아니다. `errors.classes`는 Go를 뺀 모든 target에서 모든 category의 클래스를 갖는다(Go의
  category 타입은 E-7이 정한다). category 클래스 이름은 `<Library><Category>Error`이며 `<Library>`는 각 언어의 클래스
  형태로 쓴 레포 이름이다(N-2: 약어 낱말은 PHP·Node에서 첫 글자만 대문자, Python·Go에서 모두 대문자이므로
  `HttpCookieValueError`와 `HTTPCookieValueError`. 레포 이름의 약어 낱말은 아래 binding의 표다). PHP 클래스는
  `packages.php`의 namespace 안에 있다. `errors.fixed`에는 Go 행이 없다(Go에서 G-7은 컴파일 오류다). `kinds`·`binding`의
  `class` 덮어쓰기는 그 kind의 category인 오류 unit이다(의존 kind는 의존 계약의 category를 쓴다, E-1b). variant와 binding
  kind는 한 번만 선언한다. `library`가 있는 행은 variant `<바깥>/<안쪽>`을 적고 그
  `<안쪽>`은 라이브러리 계약이 선언한 것이며, `library`가 없는 행은 `/`를 적지 않는다(GN-7c). `library`가 있는 행은
  `"through": {"unit": "<unit>", "library": "<library>"}`를 가질 수 있다. 그 kind는 그 라이브러리의 package가 만든 그 unit의
  object를 통해서만 member에 닿고, 이 계약 코어의 호출로는 닿지 않는다는 뜻이다(검사가 그때 무엇을 묻는지는 CK-22가
  정한다). 두 길로 다 닿는 kind의 행에는 `through`가 없다. schema는 이 키를 `library`가 있는 행에만 허용한다. 그 `library`는 행의 라이브러리이고 `unit`은 그 라이브러리
  계약의 callback unit이며, 그 행을 `raises`에 적은 member는 그 unit을 인자로 받는다(record 안이어도 된다). 다른 형태는 행을,
  또는 member와 variant를 대고 거부한다. `kinds`·`raises`·`in_raises`의
  variant는 Rust 경로이거나 GN-7c의 중첩 경로 `<바깥>/<안쪽>`이고, `errors.code`는 코어 오류 타입과 kinds의 code enum으로 가는
  투영을 적는다(`{error, path}`, generator GN-7b). 그것이 코어의 variant, 타입, 함수를 가리키는지는 생성된 crate를 컴파일러가
  판정한다(I-2).
- **CK-11** 감싼 의존 오류(E-1b, P-4): 계약이 그대로 전달하거나(`library`, E-1b (a)) 자기 kind의 source로 담는(`source`,
  E-1b (b)) 라이브러리의 모든 오류 unit의 모든 property는 `wrapped` 행 하나를 갖는다.
  `forward`는 같은 이름과 타입의 property를 가진 오류 unit을 가리킨다. 어느 property와도 맞지 않는 행은 거부한다.
- **CK-12** record parameter(T-4): member는 record를 많아야 하나, 마지막 parameter로 받는다. PHP와 Python에서 record field
  이름(변환과 예외 뒤)은 member의 다른 parameter 이름과 다르다.
- **CK-13** Go 이름(E-7, P-2): 오류 unit의 Go 이름은 category 오류 타입(`ValueError`, `TypeError`, `IoError`, `StoreError`,
  `BusyError`, `InternalError`)이 아니다. 한 Go 패키지(module) 안에서 타입 이름, `functions` unit의 함수, `New<Unit>` 생성자,
  static member의 함수 `<Class><Member>`, 다른 module이 unit에 닿는 함수 `<Class>Handle`, `<Class>FromHandle`,
  `Dispatch<Callback>`, `Encode<Variant>`, `Decode<Variant>`(GN-15a)은 서로 다르다. host unit은 세지 않는다. 그 Go 코드는 별도 패키지이기 때문이다(L-1).
- **CK-14** module(L-1): module의 첫 마디는 손으로 쓰는 Go 코드의 폴더인 `host`나 `tests`가 아니고, Go 바인딩의 C ABI
  층 폴더인 `internal`도 아니다(GN-15). 빈 module은 패키지의 루트다(P-2).
- **CK-15** WASM(Q-4): `wasm`이 target이면, parameter·반환·yields에 `path`가 있거나(record·variant 안 포함) wait가
  `blocking_io`·`process_wait`인 member는 자신이나 unit에 `wasm`이 없는 `only`와 그 규칙 id를 갖는다.
- **CK-16** Python awaitable(N-5, U-3): wait가 `none`이 아닌 member나 `async_allowed: true`인 callback member의 `a<name>`은
  같은 unit의 다른 member의 Python 이름이 아니고 Python의 예약어도 아니다. 그래야 GN-6m의 awaitable을 생성할 수 있다.
- **CK-17** callback(U-3, T-3): `async_allowed`와 `errors`는 callback member만 갖고, 모든 callback member는 `async_allowed`를
  적고, trait 메서드와 receiver를 `core: {path, receiver}`에 receiver `&self`나 `&mut self`로 적는다. 생성된 struct가 그
  trait를 구현하는데 binding은 Rust 소스를 읽지 않기 때문이다. `recognize`는 오류 unit을 가리키며, callback member가 자기 오류
  unit을 recognize하는 계약은 recognize한 kind의 코어 오류를 만드는 코어 함수를 `errors.recognized`에 적는다(generator GN-6d). 이 계약의 callback을
  구현하는 이 계약의 generated class에 wait가 `none`이 아닌 member가 있으면 같은 이름의 callback member는
  `async_allowed: true`다.

- **CK-18** 패키지 이름(P-1): 코어 crate는 `polyspec-<library>`, Composer `polyspec/<library>`, PHP namespace
  `Polyspec\<Repository>`, PyPI `polyspec-<library>`, Python 루트 `polyspec.<repository의 - 를 _로>`, npm
  `@polyspec/<library>`이고, `<Repository>`는 PHP 클래스 형태의 레포 이름이다. 코어가 `packages/<component>/rust`이면(L-1)
  library는 `<repository>-<component>`이고 namespace와 module은 레포의 것 아래다: `Polyspec\CrudUi\Validator`,
  `polyspec.crud_ui.validator`.

- **CK-19** 추적하는 바인딩 package(L-2): `binding check`는 바인딩 package의 추적 파일(docs/spec/generator.md
  GN-3a)을 `binding scaffold`가 쓸 내용과 비교한다. 없거나 다른 파일은 finding이다. 그래서 생성된 코드가 그 경로를
  이름하는 라이브러리(GN-3e), 예를 들어 `errors.kinds`의 행이 그 오류를 그대로 전달하는 라이브러리의 의존 줄이 없는 바인딩
  crate의 Cargo manifest는 finding이다. host 패키지(L-2a, GN-3b)는 host
  manifest에서 네이티브 모듈과 그 release에 필요한 항목만 읽고, 없거나 다른 항목마다 그 이름과 가져야 할 값을 적는다.
  그 항목에는 생성된 Node와 WASM 코드가 import하거나 require하는 각 npm package가 있으며(GN-3e), host `package.json`의
  `dependencies`가 version과 상관없이 그것을 적는다. Go 모듈에서는
  `go.mod`, `internal/ffi/Cargo.toml`, `internal/ffi/src/lib.rs`를 비교한다. 이것이 source tree가 추적하는 파일이다.
  생성 파일 `zz_generated_*.go`, `internal/ffi/generated/`, `internal/ffi/lib/`의 정적 라이브러리는 추적 파일이 아니므로
  검사가 읽지 않는다. release가 Go tag의 commit에 그것들을 더한다(GN-15g).
- **CK-21** 코어의 빌드, exclusive member, 코어 경로의 결과(I-1, U-6, E-1c): `core.features`는 target만 가리킨다.
  `exclusive`는 generated class의 receiver `&self` member에만 둔다. `core.result`가 `false`인 member는 `raises`가 없고
  callback이나 함수를 담은 `keeps` 없는 parameter가 없다. `Result`를 돌려주지 않는 코어에는 돌려줄 variant도, callback의
  실패를 둘 자리도 없기 때문이다. `core.result`가 없으면, `raises`가 이 계약 자신의 코어 오류 variant를 가리키거나
  `keeps`가 없는 parameter가 callback이나 함수일 때 코어 경로가 `Result`를 돌려준다(생성기 GN-7). `core.result`가 코어와
  맞는지는 생성 crate를 컴파일러가 판정하며(I-2) 이 검사는 판정하지 않는다. `core.failure: true`는 receiver unit이 언어
  코드를 가진(GN-6h) member나, `keeps`가 있어도 callback이나 함수를 담은 parameter가 있는 member에만 둔다. 다른 member는
  실패할 수 있는 언어 코드에 닿지 않기 때문이다. callback이나 함수를 담은 `keeps` 없는 parameter가 있는 member에는
  `core.failure: false`를 두지 않고, `core.result: false`인 member에는 `core.failure: true`를 두지 않는다. 언어 코드의
  실패는 `Result` 안의 `Failure<E>`로 돌아오기 때문이다. 함수 타입(T-2)은 callback member처럼 `async_allowed`를 적고 `recognize`는 오류 unit을
  가리킨다(CK-17). 함수 타입은 반환이 `passthrough`일 때만 `async_allowed: true`를 적는다: 바인딩은 함수가 돌려준 것을
  member의 machine을 거쳐서만 기다리고(generator GN-6ae), 그 밖의 함수 타입은 코어가 값으로 부르거나 보관하는(`keeps`,
  CK-90) generator GN-6z의 함수이며 어느 target도 그것을 기다리지 않는다. 그런 타입의 `async_allowed: true`는 `keeps`가
  있든 없든 그 타입의 반환과 함께 CK-17로 보고되고, 모든 target의 생성기는 같은 타입을 같은 문장으로 거부한다. 둘이 함수
  하나를 읽기 때문이다. 이유: 검사는 코어가 보관하는 함수의 `async_allowed: true`를 받아들였는데 모든 생성기는 그 함수를
  결코 기다리지 않는 함수로 썼다. 그래서 계약이 어느 바인딩도 하지 않는 기다림을 적었다(orm, B2.480). 보관된 함수를
  기다리는 일은 아직 설계되지 않았다(B2.483).
- **CK-63** WASM 코어(GN-4b): `core.features.wasm`은 플랫폼 I/O의 feature `fs`, `blocking-io`, `process`, `net`을
  적지 않는다.
- **CK-64** 타입 `int`나 `uint` 자리(인자, 그 타입을 담은 list·tuple·map·optional의 항목, record나 variant의 case의 field, 결과)에 있는 case의 정수는 안전
  정수다. 이것이 모든 target이 주는 T-1의 범위다(Node `number`). 그보다 큰 정수는 한 target에서는 `int64`이고 다른
  target에서는 `int`가 아니므로, case가 두 결과를 기대하게 된다. i64 범위를 받거나 주는 member는 `int64`를 적는다(GN-12a). kind `invalid_number`를 내는 case의 인자는 안전 정수 밖이면서 i64 범위 안의 정수여도 된다: 모든
  target이 그것을 그 kind로 거부하므로(GN-12a) case는 binding의 거부를 결과 하나로 말한다(B2.359, hyper
  `rules.reply_status`). 그보다 큰 정수는 모든 target의 정수가 아니므로 계속 보고한다.
- **CK-65** 실패 주입점(`faults`, G-5)을 가진 코어는 manifest의 `[dev-dependencies]`에 자기 자신을 `fault-test`와 함께
  `<core crate> = { path = ".", features = ["fault-test"] }`로 둔다. 그래서 flag 없는 코어의 `cargo test`가 지점을 장전한다.
  그렇지 않으면 `binding check`가 코어 manifest를 보고한다(GN-5).
- **CK-70** release의 의존(generator GN-3e), `binding check --release`만 실행한다: 계약이 타입을 이름하거나 case가 실패 주입점을
  장전하는 `polyspec-<library>`마다 코어의 의존 줄은 버전 `=X.Y.Z`나 tag `vX.Y.Z`를 적고 branch나 commit을 적지 않는다. 코어의
  `polyspec-binding-core` 의존 줄(있을 때)과 추적하는 바인딩 crate 각각의 그 줄도 그렇다. `path`가 레포의
  root 안에 머물고 그 옆에 그 라이브러리의 한 버전(`version = "=X.Y.Z"` 또는 `"0.0.Z"`)이 있는 줄도 release 꼴이다. 같은 레포의
  라이브러리를 이름하기 때문이다(generator GN-3e, B2.460). 그런 경로에 그 버전이 없으면 finding이며, 그 문장은 버전이 빠졌다고
  말한다: ``names the path <path>, which stays inside the repository, with no version beside it, and a release names beside
  such a path the one version of that library``. 개발
  꼴(레포를 벗어나는 path, branch, commit, 버전 범위)은 그 줄의 manifest, crate, 그 꼴을 이름하는 finding이다. `scaffold`가 그 줄에서 쓰는
  manifest가 release의 버전을 적지 않기 때문이다(`go.mod` `v0.0.0`, 버전 없는 `pyproject.toml`의 의존). 이 줄들이 `scaffold`가 manifest를 쓰는 근거가 되는 줄이다.
  검사는 계약의 Cargo manifest, 곧 코어의 manifest, 추적하는 바인딩 crate 각각의 manifest, root manifest에서 polyspec crate를
  이름하는 그 밖의 모든 줄도 읽는다(B2.457). 줄의 crate, 곧 `package`가 있으면 그것이고 없으면 key가 `polyspec-<name>`이면
  polyspec crate를 이름하는 줄이다. `[dev-dependencies]`의 crate는 어떤 계약도 이름하지 않으므로 이름이 정한다. 읽는 table은
  manifest가 crate를 출처와 함께 이름하는 table이다: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`,
  `[target.<target>]`마다 같은 셋, 그리고 모든 member에 대해 crate의 출처를 바꾸는 `[patch.<source>]`. 거기서 branch, commit,
  버전 범위, 레포를 벗어나는 path를 이름하는 줄은 table을 이름하는 finding이다(``the dependency line of polyspec-json in
  [dev-dependencies] names the branch main, a development form``). crate가 자기 자신을 이름하는 줄(CK-65)과 레포 안에 머무는
  path는 버전이 있든 없든 finding이 아니다. 다른 레포를 이름하지 않고, 바인딩 package의 어떤 manifest도 그 줄에서 버전을 적지
  않기 때문이다. `workspace = true`인 줄은 어느 table에서든 그것이 물려받는 root manifest의 `[workspace.dependencies]`의 줄로
  판정하고(generator GN-3e), finding이 그렇게 말한다(``names the branch main, by the line of [workspace.dependencies] of the
  root manifest``). 읽는 manifest 중 어느 것도 물려받지 않는 `[workspace.dependencies]`의 줄은 읽지 않는다. 레포의 다른 crate의
  manifest와 `scaffold`가 쓰지 않는 다른 생태계의 manifest는 읽지 않는다. 이유: 한 소비자가 `[dev-dependencies]`에 branch 줄을
  갖고 있었고, 계약이 이름하는 줄만 보는 검사는 그것을 통과시켰다. CK-70은 줄의 tag가 있는지는 묻지 않는다. 가져오는 쪽이 자기
  말로, 그리고 레포의 tag보다 먼저 말하기 때문이다: Cargo는 어떤 빌드에서든 workspace의 모든 줄을 해석하므로 레포 install의
  `cargo fetch --locked`와 job의 첫 `$(CARGO)` 빌드는 crate의 이름과 그 레포의 URL 아래에 ``failed to find tag `vX.Y.Z` ``로
  끝나고, `binding check` 자신도 그 crate의 계약을 `cargo metadata`로 읽을 때 같은 Cargo의 오류와 generator GN-15f의 안내로
  끝난다. Go module은 `go mod download`가 알 수 없는 revision을 이름하며, 그것이 `go.sum`에 대한 CK-19의 finding이다(generator
  GN-15l). CI가 release의 빌드 recipe를 실행하므로(generator GN-19i) 이것들은 CI에서 실패한다. 이것은 CK-19의 일부가 아닌 별도의 검사다. 개발 checkout의
  추적 파일은 `scaffold`가 쓰는 그대로여서 CK-19는 통과시키고, CK-70의 질문은 release가 무엇을 담아도 되는가이기 때문이다.
- **CK-102** release recipe의 설정(generator GN-19h), `binding check --release`만 실행한다: release의 검사는 계약의 release
  recipe가 읽는 레포의 설정을 그 recipe의 reader 그대로 읽고, 빠진 것마다 그 파일, key, 그것을 읽는 recipe, 규칙의 id와 함께
  보고한다. 계약의 target에 필요한 설정만 읽는다. target `php`: `config/toolchain.json`의 `phpExtension.minors`, 곧 비어 있지 않은
  `<major>.<minor>`의 목록. `release-platform-assets`가 PHP minor마다 확장을 요구하려고 읽으며(generator GN-19a), 그 recipe의
  Node.js script로 읽는다(``release-platform-assets: config/toolchain.json names no PHP minor of the extension in
  phpExtension.minors``). 그리고 같은 파일의 `llvm.version`. `release-php-ext`가 읽으며(generator GN-19d), recipe의 `sed`
  script로 읽는다. 그 script는 `"llvm": {` 줄 아래 `"version": "<major>"` 줄의 값을 가져오므로 한 줄로 쓴 파일은 아무것도
  고정하지 않는다. target `go`: `packages.go`의 module path, 곧
  `github.com/<owner>/<repository>/<Go module의 디렉터리>`(generator GN-15, GN-19f). `binding release-go-module`이 다른 path를
  거부할 때 쓰는 함수로 읽는다. 그리고 Go module의 `go.mod`의 require. 각각을 release 형태가 싣는 Go 파일이
  import하며(generator GN-15g, B2.473), `binding release-go-module`의 함수가 checkout의 손으로 쓴 Go 파일과 `binding
  generate`가 쓰는 그대로의 생성 파일로 판정한다. 검사가 생성 파일을 메모리에서 생성하므로 work tree에는 하나도 필요
  없다. 검사는 그 형태가 빼는 파일만 import하는 require를 그 파일들과 함께, 어떤 Go 파일도 import하지 않는 require를
  `go.mod`의 경로와 `release-go-module`과 함께 보고한다. `// indirect` 줄은 출력에 쓰되 그것으로 실패하지 않고, Go
  바인딩이 생성되지 않으면 생성기의 거부와 함께 실패한다. recipe `release-binding-check` 자신은 계약의 release recipe가 읽는 Makefile의 변수를
  모두(`BINDING_RUN`, `CARGO`, target에 따라 `NPM`, `NODE`) 먼저 요구한다. 명령인 검사는 그것을 읽을 수 없기 때문이다.
  이유: session-store의 release는 `binding check --release`를 통과한 뒤 tag 뒤의 `release-platform-assets`에서
  `phpExtension.minors`가 없는 `config/toolchain.json` 때문에 멈췄을 것이고, 예행연습이 그것을 찾았다. 검사가 CI의 빌드 recipe의
  첫 단계이므로(generator GN-19i) 그런 설정은 tag 전에 실패한다. recipe와 검사의 reader가 하나인 것은, 두 번째 reader는 recipe가
  거부하는 파일을 통과시킬 것이기 때문이다. 검사가 읽지 않는 것: recipe가 시작하는 도구와 그 도구가 스스로 읽는
  파일(devDependency `@napi-rs/cli`의 napi CLI, `mise.toml`의 wasm-bindgen, `rust-toolchain.toml`의 target과 component,
  `LLVM_ROOT`의 LLVM). CI의 빌드 recipe가 그것을 시작하므로 tag 전에 실패한다. 그리고 한 실행의 입력(`TAG`,
  `EXPECTED_PHP_MINOR`, asset, `gh`, Git remote). 어떤 tree도 그것을 담지 않는다.
- **CK-71** 코어의 licence(generator GN-3f): 코어 manifest는 `package.license`를 스스로, 또는 root manifest의
  `workspace.package.license`에서 받아 적는다. 그것이 없는 코어는 코어 manifest를 이름하는 finding이다. 그 바인딩 package의
  모든 manifest가 그 licence를 담기 때문이다.
- **CK-67** class parameter의 빌림(GN-6h): callback interface의 member가 아닌 member에서 타입이 이 계약의 origin `generated`인 class unit이거나
  그 `optional`인 모든 parameter는 `core`(`&`, `&mut`, `value`)를 갖고, 다른 parameter는 갖지 않는다. 코어가 빌림을 받는
  자리는 class의 인스턴스뿐이고, binding은 그것을 찾으려고 Rust 소스를 읽지 않기 때문이다.
- **CK-68** 언어 코드에 닿는 member의 state machine(generator GN-6ab, c6 6.2): parameter의 타입이나 receiver의 class가
  언어 코드를 지녀(generator GN-6q) 언어 코드에 닿는 `wait: async_driver` member는 `core` 객체에 `"machine": true`를
  적고, 다른 member는 `machine`을 적지 않는다. 생성 코드는 그런 코어 경로를 state machine으로, 다른 것은 future로 돌리며,
  binding은 둘을 가리려고 Rust 소스를 읽지 않기 때문이다.
- **CK-69** state machine이 있는 method의 receiver(generator GN-6ae): `core`에 `"machine": true`를 적은 method는
  receiver `&self`를 적는다. 생성 코드는 코어에 인스턴스 값의 clone을 주는데, 그것은 `&mut self`처럼 인스턴스에 다시
  쓰지도, `self`처럼 인스턴스를 소비하지도 않기 때문이다.
- **CK-72** variant의 tag(T-9, generator GN-6v): variant case의 어떤 field도 그 variant의 `tag`와 이름이 같지 않다. 이름은
  단어로 비교한다. Node, WASM, case 파일에서 case의 값은 tag member가 case 값을 담는 객체이므로, 그 이름의 field는 tag의
  자리를 차지하기 때문이다. finding은 그 field와 해결 방법을 적는다: field나 tag의 이름을 바꾼다.
- **CK-73** 기다리지 않는 member(generator GN-6m, GN-6n, N-4): `constructor`, `property`,
  `iterate`, hook(`stringify`, `to_json`, `primitive`)은 `none`이 아닌 `wait`를 갖지 않는다. 어느 언어에도 constructor,
  property, 순회를 await하는 형태가 없고, 언어는 hook을 자기 프로토콜로 호출하며 그 호출은 아무것도 await하지 않기
  때문이다. finding은 그 member와 wait, 그리고 그 자리에서 기다릴 수 있는 member를 적는다: constructor에는 인스턴스를
  만드는 `static` member, 나머지에는 값이나 항목을 주는 `method`다. host unit도 다른 unit처럼 판정한다. 그 코드는 손으로
  쓰지만(L-2a) 거기에도 언어에는 이 member들을 await하는 형태가 없으므로, 코드를 쓰기 전에 검사가 그것을 보고한다.
- **CK-74** 생성할 수 있는 class(U-1): `core_type`을 적고 `abstract`가 아닌 origin `generated`나 `value`의 class는
  생성할 수 있을 때에만 `constructor` member를 가지며, `constructible: false`를 적지 않으면 생성할 수 있다. 그래서
  constructor가 없고 `static` member가 인스턴스를 만드는 class는 `constructible: false`를 적고, `constructible: false`인
  class는 constructor를 갖지 않는다. 모든 언어가 class를 constructor와 함께 쓰거나 생성을 막아서 쓰기 때문이다.
- **CK-75** variant의 코어 enum(T-9): origin `generated`인 `variant` unit은 `core_type`에 자기 Rust enum을 적는다. 각
  case는 그 enum의 struct variant로 생성되고, binding은 그것을 찾으려고 Rust 소스를 읽지 않기 때문이다.
- **CK-76** 객체를 남기는 cleanup(생성기 GN-6p): class unit의 `cleanup`이 코어 receiver가 `&mut self`인 method이면, 그
  member의 case 하나는 receiver의 `then`에서 같은 member를 `raises` 없이 부르고 case 자신도 `raises`를 적지 않는다. 그래서
  그 case는 cleanup을 두 번째로 부르고 그것이 아무것도 하지 않기를 요구한다. 이유: 그런 cleanup 뒤에는 객체가 남으므로
  호출자나, 호출자가 닫은 것을 다시 닫는 wrapper가 그것을 다시 부른다. 거기서 실패하거나 두 번 해제하는 코어는 자기
  case로 드러난다. `cleanup`이 있는 class의 코어 타입은 자기 `Drop`에서 자원을 놓는다(생성기 GN-6p). 어느 소멸자도
  cleanup member를 부르지 않기 때문이다. `binding check`는 Rust 소스를 읽지 않으므로 그 `Drop`을 검증하지 않는다. 그것은
  코어의 의무이며, 이 검사의 finding이 그렇게 적는다.
- **CK-77** generated interface(generator GN-6ap): origin이 `generated`인 interface unit은 `core_type`을 이름하고
  `core`를 선언하지 않으며, 이 계약의 class 하나 이상이 그것을 `implements`한다. 그런 class는 origin이 `generated`이고
  `core_type`을 갖는다. 그 interface나 그것의 `optional`로 type된 parameter는 `core` 빌림을 이름하지 않고, 어떤 반환,
  field, `yields`, callback interface의 member도 그 interface를 이름하지 않는다. binding은 구현 class의 instance를 호출에
  들어올 때에만 `core_type`으로 변환하기 때문이다. case에서 그런 parameter의 argument는 그 interface를 구현하는
  class의 instance 값(GN-13f)이거나, `optional`에서는 `null`이다. step이나 `after` 호출의 argument는 그런 class의
  `{"bound": <name>}`일 수도 있으며, 그 이름은 바깥의 function fixture나 case의 `with`가 준다(GN-13n, GN-13pa, B2.383).
  이유: bound 값은 호출이 만든 instance이므로 이미 그 class이고, orm은 `db.transaction`의 `tx`를 그렇게 `query.connect`에 넘긴다.
- **CK-78** 생성하지 않는 target의 `core_type` 없는 class(생성기 GN-6af): `core_type`을 적지 않은 origin `generated`나
  `value`의 class는 그런 class를 생성하지 않는 target이 하나도 없는 `only`(Q-4)를 적는다. Python, Node, WASM, Go가 그것을
  생성한다. PHP는 자기 `stdClass`와 참조를 쓰고(생성기 GN-6e) 그런 class를 생성하지 않는다. 이것은 그 target의 규칙이며
  생성기의 현재 상태가 아니므로, 두 origin 어느 쪽의 class도 PHP를 적지 않는다. finding은 그 unit과 그런
  target 각각을 적는다. 이유: 생성기는 그런 target에서 그 unit을 거부하며, 계약의 오류는 생성기가 돌기 전에 검사가
  보고한다.
- **CK-79** 폐기(B2.125). 이 검사는 symbol이 `polyspec_<library>` 뒤에 밑줄 하나를 가졌기 때문에 계약의 target `go`
  C symbol을 계약이 이름하는 라이브러리의 C symbol과 비교했고, 서로를 이름하지 않는 두 라이브러리는 보지 못했다. 생성기
  GN-17의 symbol은 라이브러리 이름 뒤에 밑줄 둘을 가지며 라이브러리 이름은 밑줄 둘을 잇달아 갖지 않으므로, 두
  라이브러리의 symbol은 다르고 어떤 검사도 그것을 비교하지 않는다. 이 id는 다른 검사를 이름하지 않는다.
- **CK-80** C ABI의 C 타입 이름을 가진 함수(생성기 GN-17): target `go`에서 root module의 어떤 함수도 이름이 `buffer`가
  아니다. 그 symbol `<prefix>_buffer`가 C ABI의 모든 호출 결과의 C 타입이기 때문이다. finding은 그 함수와 symbol을
  적는다.
- **CK-81** package `binding`의 선언 이름을 가진 함수(생성기 GN-17): target `go`에서 root module 함수의 package `binding`
  함수, 곧 CamelCase로 쓴 그 이름은 package `binding`이 스스로 선언하는 이름이 아니다. 그 이름은 package 자신의 타입과
  함수(`Reader`, `Writer`, `NewReader`, `NewWriter`, `Call`, `NewCall`, `Map`, `KeyedMap`, `Key`, `IntKey`, `BytesKey`,
  `TextKey`와 생성기의 나머지)이거나 계약의 class의 `Release<Class>`다. finding은 그 함수와 선언을 적는다.
- **CK-90** 코어가 callback이나 함수를 갖는 parameter(생성기 GN-6aa): parameter는 타입이 이 계약이나 다른 레포의 callback
  unit을 담을 때에만 `keeps: true`를 적는다. 그 unit 자체이거나 그것을 담은 record, list, `optional`, map이며 서로 안에
  있어도 되고, 같은 자리의 함수 타입이어도 된다. 다른 parameter의 `keeps`는 member와 parameter를 적어 보고한다. 함수에서
  `keeps`는 member가 그 함수를 나중 member가 부르도록 보관만 한다는 것을 적으므로, 그 코어 오류는 `Failure`가 아니고 그것을
  부르는 member가 `core.failure: true`를 적는다(생성기 GN-7, CK-21). 이유: 그 속성은 생성기가 callback에 적는 lifetime과
  callback이나 함수의 실패가 가는 자리를 바꾸며, 둘 다 없는 parameter에서는 아무것도 적지 않게 되고, 읽는 사람은 그것을
  member의 규칙으로 받아들인다.
- **CK-92** case의 인스턴스 값이 부르는 member는 case의 member가 생성되는 곳에서 생성된다(생성기 GN-13f). case의 인스턴스
  값의 `new`, `from`, `then`의 호출이 이름하는 각 member는, 다른 인스턴스 값의 receiver나 인자 안에 있어도, class나
  interface 자리의 list, `optional`, map, record의 field 안에 있어도, case의 member와 그 unit의 `only`, 그리고 그 case가
  있는 `cases` 행의 `only`(생성기 GN-13h)가 남기는 계약의 모든 target에서 생성된다. `only`가 그런 target에서 빼는
  member는 case, member, target과 함께 보고된다. 계약은 case의 member, 그 unit, 또는 그 case가 있는 `cases` 행에 그
  target이 없는 `only`를 주어 해소한다. `only`가 그 member나 그 alias가 생성되는 target을 하나도 이름하지 않는 행도 보고된다. 이유:
  case의 시험은 그 member와 그 행의 target마다 생성되는데, 한 target에서 인스턴스를 만들 수 없는 시험은 그 target을
  거부하거나 case를 조용히 빼게 되고, 그러면 그곳에서 무엇이 검증되지 않았는지가 보이지 않는다.
- **CK-93** case는 `only`가 case의 target에서 빼는 parameter나 field를 주지 않는다(생성기 GN-6g, GN-13h): 각 case에서,
  case가 값을 주는 member의 `only`가 있는 parameter와, case의 값이 주는 record의 `only`가 있는 field는(list, `optional`,
  map, keyed map, tuple 안에 있어도) case가 생성되는 모든 target, 곧 그 `cases` 행의 `only`가 남기는 member의 target을
  나열한다. 그렇지 않은 parameter나 field는 case와 그 `only`가 빼는 target과 함께 보고된다. 계약은 그 case가 있는
  `cases` 행에 `only`를 주어 해소한다. 이유: 다른 target에는 그 parameter나 field가 없어 그 값을 넘길 수 없으므로
  생성기는 그 case를 그 시험에서 뺀다. 행은 CK-92가 인스턴스 값이 부르는 member에 대해 요구하듯 그 뺌을 계약을 읽는
  사람이 보는 곳에 적는다.
- **CK-91** Go 정적 라이브러리의 release profile(생성기 GN-15i): target `go`가 있는 계약에 대해 `binding check`는
  레포의 root manifest나 `.cargo/config.toml`의 `[profile.release]`가 `lto`를 `false`나 `"off"`가 아닌 값으로 정하면 그
  파일과 값을 보고한다. 그러면 Go program이 그 정적 라이브러리를 다른 레포의 정적 라이브러리와 링크할 수 없기 때문이다.
- **CK-94** 레포의 release recipe(생성기 GN-19h): 레포의 root에 `Makefile`이 있으면 `binding check`는 계약의 recipe
  파일(`packages/release.mk`, 또는 `packages/<component>/release.mk`, 그것으로 끝나는 경로도 포함)을 `include`나
  `-include`하는 줄이 없는 Makefile과, 그 파일이 정의하는 target에 자기 recipe를 가진 Makefile의 rule을 그 target과
  함께 보고한다. 그런 target에 prerequisite만 더하는 rule은 finding이 아니다. recipe 파일이 있고 이 binding의
  `binding release-recipes`가 쓰는 것과 다르면 그 파일도 보고하고, 그 파일에서 GN-1d가 말하는 것과 다른 방식으로 Cargo를
  실행하는 줄마다 그 줄과 함께 보고한다: `$(CARGO)`가 아닌 `PATH`의 `cargo`, subcommand 바로 뒤에 `$(CARGOFLAGS)`가 없는
  build(`$(CARGO) rustc`나 `$(CARGO) build`), `--cargo "$(CARGO)"` 없이 Cargo를 실행하는 binding 명령. 파일이 없는 것은 finding이 아니다. 그 파일은 생성되고
  추적되지 않으며, release는 recipe를 실행하기 전에 그것을 쓰기 때문이다. 이유: 손으로 복사한 recipe는 GN-19h가 고친
  복사본의 결함을 그대로 갖고, 다른 binding의 recipe 파일은 그 binding이 빌드하는 것을 빌드한다.
- **CK-95** 시험 실행의 service(생성기 GN-13j): `services`는 `{"id", "address", "state", "reason"}`를 나열한다.
  `address`와 `state`는 환경 변수의 이름(`^[A-Z][A-Z0-9_]*$`)이고 `state`는 선택이며, id는 겹치지 않는다. `binding
  check`는 `service`가 `services`의 id를 가진 `{"id", "setup", "peer", "check"}`(`setup`, `peer`, `check`는 선택)가
  아닌 case, `state`가 없는 service의 `setup`, `peer`, `check`, `then` 호출의 `service`, `service`가 없는 case의 case 값
  `{"service": ...}`나 `service` 또는 `peer`가 있는 `then` 호출, service에 `peer`가 없는 case의 `peer`가 있는 `then`
  호출(GN-13q), 그리고 group이 `service`가 있는 case를 담고 WASM에 해당하는 `cases` 행을 보고한다. WASM에 해당한다는
  것은 그 member가 WASM에 생성되고 행에 `wasm`이 없는 `only`가 없다는 뜻이다(GN-13h). 이유: 실행이 제공하지 않는 service나
  어떤 program도 쓰지 않는 상태를 가리키는 case는 시험이 실행될 때에야 실패하고, WASM의 코어에는 socket이 없으므로 그런
  case의 WASM 시험은 실패할 수밖에 없다.
- **CK-22** 모든 member는 case를 가리킨다(K-1): 오류 unit, callback interface(U-3), host unit(L-2a)이 아닌 public unit의
  constant가 아닌 public member는 `cases` 항목 하나 이상의 `member`이거나, case의 function fixture의 step이나 `after`의
  호출이 부르는 member이고(생성기 GN-13o, GN-13pa), 그 호출이 그 member의 case다. callback만 주는 class, 예를 들어
  ORM의 transaction의 member는 자기 case가 만드는 receiver가 없으므로, 그 case는 그것에 닿는 호출이다(B2.365). 그 항목의 file이나 group이 member를 빠뜨리면 G-5가
  e2e를 실패시킨다. `binding check`는 case 파일도 읽는다. `cases`가 가리키는 group은 그 파일에 있고, member의 `raises`
  행이 내는 kind마다 그 member의 경로에서 그 kind를 내는 case가 있다: 그 `raises`가 같은 library(그 library 자신, 또는 그
  owner, GN-7c)의 그 kind를 같은 호출 형태(`wait` `none`, 또는 다른 `wait`)로 내는 어느 member의 case든 된다(B2.376). 이유:
  생성 코드는 library마다 하나인 core 오류의 변환으로 kind에 class, message, status, errno를 주고, 같은 호출 형태의 모든
  member가 그 변환을 공유한다(B-4). 그래서 그 경로의 case 하나가 그들 모두의 변환을 보이고, 각 member의 core가 그 kind를
  내는지는 core의 시험이 보인다. `wait`를 가진 호출은 throw와 다른 경로로 reject하고, 다른 library의 kind는 그 owner의
  변환으로 나가므로, 그 각각이 자기 경로다. 다른 library의 kind들은
  호출 형태마다 한 경로다: 그 library의 어느 kind의 case든 그 모두를 보인다(B2.382). 이유: owner가 자기 kind를 하나씩
  바꾸고, 그것은 owner 계약의 CK-22가 kind마다 보인다. 이 저장소의 case가 보이는 것은 그 호출이 owner의 변환을 탄다는
  것이고, 그것은 그 모든 kind에 같으므로, kind마다의 case는 owner의 case를 되풀이했다(hyper `rules.template_reads`,
  template의 kind 19개). 다른 library의 kind 행은
  그 category와 kind를 그 library의 행에서 가져온다(GN-7c). CK-22는 자기 category가 없는 그런 행을 건너뛰어서, 다른
  library의 어느 kind에도 case를 요구하지 않았다. member의 `cases` 행은 `result`로 그 case들에서 member의 결과를 담은
  snake_case 키를 적을 수 있다(GN-13e). 적지 않은 행은 키 `result`를 읽고, alias의 행은 그것을 갖지 않는다(CK-1). case의 `receiver`와 class 타입 인자는 GN-13f의 인스턴스 값일 수 있다: 그 member가 있고 `pick`을 거쳐 그 class를
  주며, 메서드는 `receiver`를 갖고, `args`는 member의 호출의 인자이며(CK-101), `then`의 호출은 `args`가 다시 호출의 인자이고(CK-101) 그 class의 메서드이거나, `"on": "receiver"`이면 receiver를 가진 값의 `receiver`의 class의 메서드이며, 그 `raises`는 주어지면 그 메서드 `raises`의 kind인 `{"kind": <kind>}`다. 그 `faults`는 주어지면 그 메서드의 case의 faults이고, `faults`와 `raises`를 함께 가진 호출은 그 점들이 채우는 kind를 기대한다. 인스턴스 값이 fault를 장전하는 case는 `faults`를 가진 case처럼 case와 그 호출들의 점이 `fills`에 가진 kind만 채운다. 타입 `cancel`의 인자는 호출 전에 발동한 취소인 `{"cancel": "fired"}`이거나 발동하지
  않는 취소인 `{"cancel": "open"}`이고, `optional<cancel>`은 `null`일 수 있다. case는 실패 주입점(G-5)을
  `"faults": [{"point": "<library>.<id>", "kind": "io" | "short" | "broken", "errno": "<기호>", "bytes": <n>,
  "nth": <n>}]`로 장전할 수 있다. `<library>`는 snake_case로 쓴 라이브러리 이름이며 이 계약이나 검사가 받은 라이브러리의
  것이고, `<id>`는 그 계약 `faults`의 점이다. `kind`는 그 점의 `inject` 중 하나다. `bytes`는 `short`에만, 그리고 `short`에는
  반드시 둔다. errno의 기호(`ENOSPC`)인 `errno`는 `io`에만 둔다. `nth`는 1부터 센다. fault에 다른 키는 없다. `faults`를
  가진 case는 그 점들의 `fills`에 있는 kind만 채우며, 다른 kind를 기대하는 그런 case는 거부한다. 입력 규칙의 case가
  입력으로 남게 하기 위해서다. case `raises`의 `errno`가 텍스트이면 그런 기호다. `category`를 생략한 case의 `raises`는
  `errors.kinds`(자기 row와 `library`가 있는 row)나 E-1a의 kind를 주고, 생성 시험은 그 category를 가져온다(generator
  GN-13bd). 다른 kind는 이름으로 거부한다. 그 시험이 어떤 class도 이름하지 못하기 때문이다(B2.433). case의 `raises`가 쓰는
  `category`는 E-1의 여섯 category 가운데 하나이고, `errors.kinds`나 E-1a가 그 kind에 category를 주면 그 category다. 다른
  것은 case, kind, category를 이름해 거부한다(generator GN-13bh, B2.448). case `raises`의 kind는 그 case의 호출이 낼 수 있는
  kind다: 그 member의 `raises`의 kind(`library`가 있는 row는 그 라이브러리 row의 kind를 준다, GN-7c), 바인딩이 코어 앞이나
  둘레에서 스스로 내고 어느 member도 선언하지 않는 E-1a의 kind, parameter의 타입이 담는 value alias의 `in_raises`의
  kind(인자의 in 함수가 낸다, U-7), receiver가 있는 member의 case가 `receiver`, `faults`, `after`를 주지 않을 때 그 class의
  factory(생성자 또는 receiver 없는 member)의 `raises`의 kind나 그 parameter의 alias의 `in_raises`의 kind(그런 case의
  실패는 receiver를 만드는 실패이거나 호출의 실패다, generator GN-13f), 그리고 fault injection point를 거는 case에서는
  category `internal`의 kind(X-1)다. 다른 kind를 내는 case는 case, kind, member를 이름해 거부한다. 이유: 검사는 step,
  `after`의 호출, `then`의 호출의 kind를 그 호출의 member의 `raises`와 비교했지만, case 자신의 kind는 kind의 case로 세는
  데에만 읽었다. 그래서 member가 선언하지 않은 kind를 기대하는 case가 통과했고, 그 시험은 모든 target에서 실패할 수밖에
  없었다(B2.449). category `internal`의 kind는 member마다
  case를 요구하지 않는다(X-1). 코어 오류를 옮기는 match가 모든 member에 하나이기 때문이다. 그런 kind를 가진 오류
  enum마다, 곧 이 계약 자신의 것과 자기 코어의 호출로 kind를 그대로 전달하는(E-1b (a)) 라이브러리, 곧 `through`가 없는
  행(CK-10)의 라이브러리마다, 어느 member의 case 하나가 `<library>.internal`을 `broken`으로 장전하고 category `internal`의
  kind를 낸다. `through`가 있는 행은 그 kind가 그 라이브러리의 package가 만든 object, 곧 행이 적은 callback unit의 object를
  통해서만 member에 닿는다고 적은 것이다. 그런 행에는 X-1의 case도, 경로의 case(위의 kind의 case. 한 라이브러리의 어느
  kind의 case 하나가 그 라이브러리의 `through` 없는 행들에 대해 보인다)도 묻지 않고, 그런 행의 kind를 내는 case는 다른
  행의 경로를 보이지 않는다. 그 증명은 그 라이브러리 자신의 계약의 case와 이 라이브러리 코어의 테스트다. 다른 라이브러리의
  지점을 장전하는 case나 `then`의 호출은, 그 지점이 채우는 kind를 전달하는 이 계약의 행이 모두 `through`를 가지면
  거부한다: `the case <id> of <member> arms the point <library>.<point>, which fills only kinds that the contract states reach
  it through the unit <unit> of <library> (through): the point fires in the package of <library>, whose arming a
  generated test of this contract does not make, so the case is a test of the core (GN-5, X-1)`. 이유: hyper는
  `open_page`에서 session-store의 callback unit `store`를 받고, 전달하는 session-store의 kind 17개 중 16개는 그 object가 낸
  것으로만 닿는다. `Random`은 두 길로 닿는다. store의 `renew`가 낸 것으로, 그리고 hyper 코어가 부르는
  `polyspec_session_store::random_hex`에서 온다. 그래서 그 행에는 `through`가 없고, 그 호출에 대해
  `session_store.random`을 장전하는 그 case를 요구한다. 그 라이브러리 package의 object를 통해서도, 이 계약 코어의
  호출로도 member에 닿는 kind는 `through`를 갖지 않는다. 코어의 호출이 지점에 닿으므로, 키가 없는 다른 행처럼 X-1
  case와 경로 case를 요구하고, 생성된 테스트는 object를 통한 길이 아니라 코어의 호출만 증명한다. session-store의 package는 자기
  `binding_core`를 링크하므로(generator GN-5), `session_store.internal`을 장전한 hyper의 테스트는 store가 읽는 것을 아무것도
  장전하지 못했다. 그 case가 있으면 생성된 Node 테스트가 "Missing expected rejection"으로 실패했고, 없으면 검사가 빠진
  case를, 그리고 그 행마다 경로의 빠진 case를 보고했다. 증명되지 않고 남는 것: 검사는 kind가 코어의 호출로 오는지를 Cargo
  의존에서 추측하지 않는다. 그래서 코어가 실제로 호출로 닿는 kind의 행에 적은 `through`는 잡히지 않고, 그 X-1 case와 경로
  case는 여기서 누구에게도 묻지 않게 된다. 그런 행을 여전히 지키는 것은 그 라이브러리 계약의 X-1 case, GN-7c의 컴파일 검사,
  소비 저장소의 코어 테스트다. 그리고 클래스를 덮어쓰는 `through` 행의 `class`(hyper의 `Record`와 `RecordWrite`의
  `record_error`)는 어떤 생성 테스트도 증명하지 않는다. 값 alias `in_raises`의 kind는 그 alias를
  가리키는 `cases` 행의 group에 case를 둔다(U-7). 그 group은 member의 행이 가리키지 않는다. 그 case는
  `{"id", "value", "raises"}`(그리고 `note`, `rule`)이고 `raises.kind`는 `in_raises`의 kind이며, `in_raises`의 kind마다
  하나가 있다.
  callback interface를 parameter로 받는 member의 case는 그것을 callback fixture로 준다(G-5, GN-13):
  `{"callback": {<member id>: [<행>]}}`의 member id는 그 interface의 member이고, 행과 `calls`는 `args`에 코어가 그 member에
  넘기는 인자를 주며(CK-101), 행의 키는 `args`, `result`, `raise`, `once`, `async`뿐이다. `raise`는 `{"error": <오류 unit>,
  "kind": <kind>}`이거나 `"exception"`이다. `result`와 `raise`를 함께 가진 행, member가 recognize하지 않는 오류 unit의
  `raise`(U-3), kind가 그 오류 unit의 kind가 아닌, 곧 `class`가 그 unit인 `errors.kinds` 행의 kind가 아니어서 unit의
  생성자가 거부하는 함수 fixture나 행의 `raise`(generator GN-7a), `async_allowed`가 없는 member의 `async` 행, 행이 줄 수 없는 언어
  객체(class, callback, 함수, host value)를 받는 member의 행은 지적된다. callback interface의 다른 자리, 곧 record의
  field, list의 항목, `optional`에서도 같다. 그 자리에는 그 interface를 `implements`하는 계약의 class의 인스턴스 값(GN-13f)이
  fixture 대신 올 수 있다. 함수 타입의 값은 `{"function": [<행>]}`이고(generator GN-6z), 그 행의 키는 `args`, `result`, `once`뿐이며
  `args`에 parameter의 위치 `"0"`, `"1"` 등을 준다. 언어 객체를 받는 함수는 행을 갖지 않는다. 반환이 `passthrough`인 함수 타입,
  곧 state machine을 가진 member의 함수의 값은 함수 fixture(generator GN-6ae) `{"function": {"calls": [<step>], "result":
  <값>}}`이거나 `"result"` 자리에 `"raise"`를 둔 것이다. fixture의 키는 `function`뿐이고, 그 객체는 list `calls`와
  `result`, `raise` 중 하나를 가지며 `awaits` 말고 다른 키는 없다. `"awaits": true`는 함수가 그 언어의 awaitable을
  돌려주고 그 awaitable의 결과가 fixture의 `result`나 `raise`임을 적는다(generator GN-6ae). `async_allowed: true`인 함수
  타입의 fixture만 그것을 적고, 그 값은 `true`이며, step의 인자의 fixture는 그 step의 fixture가 그것을 적을 때만 적는다.
  기다리지 않는 함수는 자기 step의 호출을 기다릴 수 없기 때문이다. step은 `{"on": "<위치>", "call": "<member id>", "args": {...}}`이고
  `result` 말고 다른 키는 없다. `on`은 함수의 parameter의 위치 `"0"`, `"1"` 등이다. 함수 타입의 parameter에는 이름이 없기 때문이다. 그
  parameter의 타입은 이 계약의 class unit이다. `call`은 그 class의 method이고, `args`는 그 method의 호출의 인자이며(CK-101),
  step의 함수 타입 인자는 다시 함수 fixture다. step은 그 호출이 돌려주는 값인 `"result": <값>`도 적을 수 있다. 생성된
  함수는 다음 step 전에 그 값을 요구하므로, case는 함수가 도는 동안 class 인자가 쥔 것을 검증한다. `raise`는 언어의 예외인 텍스트 `"exception"`이거나 함수가 인식하는(U-3) error
  unit의 `{"error": <unit>, "kind": <kind>}`다. case의 `raises`는 텍스트 `"callback"`일 수 있다. 그 case는 인자의 함수
  fixture가 `"raise": "exception"`으로 던지는 예외를 기대하며, step의 어느 깊이에도 그런 fixture가 없는 case는 거부된다.
  method의 case는 `after`를 적을 수 있다. `after`는 `{"call": "<member id>", "args": {...}, "result": <값>}`의 list이고
  다른 키는 없다. 각 `call`은 receiver의 class의 method나 property이고(각 언어는 property를 읽듯 그것을 읽는다,
  B2.361) `args`는 그 호출의 인자이며(CK-101), 결과가 없는 member의 `result`는 `null`이고 각 언어는 그것을 값 없음으로
  시험하며(Node와 WASM에서는 `undefined`, B2.374), 생성된 시험은 case의 호출
  뒤에, 예외로 끝난 호출 뒤에도, receiver에서 그것을 호출하고 `result`를 요구한다.
  결과가 없는 member의 결과는 case가 그것을 적는 어느 자리에서나 그 한 규칙을 따른다(생성기 GN-13e, B2.466). 곧 case의
  결과 키(그런 case는 생략할 수 있다), `result`나 `raises`를 적는 `after`의 호출, function fixture의 step, callback
  fixture의 row에서 그것은 `null`이고, 거기의 다른 값은 보고된다. 이유: 생성기는 이 자리마다 그것을 값 없음으로
  시험하므로, 거기에 값을 적은 case는 실패하는 시험을 받는데, check가 그것을 먼저 말한다.
  계약의 값 alias의 case 값 `{"kind": <kind>, "value": ...}`(생성기 GN-13)은 member의 case가 그것을 주는 모든 자리에서
  읽는다(B2.465). 곧 case의 인자와 case가 적는 모든 호출(instance value, `then`의 호출, function fixture의 step,
  `after`의 호출)의 인자, 결과, 그리고 어느 깊이든 list, map, tuple, optional의 항목과 record나 variant의 field, 또 그 값
  안의 각 값에서 읽는다. 보고되는 것: 생성기가 꼴을 주지 않는 kind, 곧 `null`, `bool`, `int`, `int64`, `float`, `text`,
  `bytes`, `list`, `map`, `object`, `reference`가 아닌 kind. `value`가 배열이 아니고 repeat 꼴도 아닌 `list`. `value`가
  `[key, value]` 쌍의 배열이 아니고 repeat 꼴도 아닌 `map`이나 `object`(`id`로 다시 가리키는 `object`는 `value`가
  없다). `{"kind": ...}` object가 아닌 값, 이를테면 `{"host": <sort>}`나 binding이 거부하라고 case가 주는 다른 JSON kind의
  값은 여기서 판정하지 않는다. 이유: 생성기는 그런 값에 "is not generated yet"으로 실패하는 시험으로 답하는데 check는
  아무 말도 하지 않아서, orm의 12 case의 19곳이 map을 JSON object로 주고(JSON은 그 순서를 지키지 않는다) check를
  통과했다.
  method의 case는 `with`, 곧 `{"<name>": <instance value>}`를 적을 수 있다(생성기 GN-13pa). 각 값은 이 계약의 class를
  만드는 member의 `{"new": <member id>, ...}`이고 그 class의 instance value로 판정된다. 각 이름은 snake_case이고
  `receiver`가 아니며, case의 어떤 function fixture도 그 이름을 다시 주지 않는다. 그러면 function fixture의 step과
  `after`의 호출은 그것을 `on`으로 이름할 수 있고, step의 인자는 `{"bound": <name>}`일 수 있다. receiver가 없는 member의
  case의 `with`는 보고된다.
- **CK-101** 호출의 `args`(G-5)는 모든 형태에서 한 규칙을 따른다. 시험이 하는 호출, 곧 인스턴스 값의 `new`와 `from`과
  그 `then`의 각 호출(generator GN-13f), 함수 fixture의 step, `after`의 호출(CK-22)은 `args`에 그 member의 parameter
  이름만 snake_case로 적고, `default`가 없는 parameter는 모두 적는다. `default`가 있는 parameter는 빠질 수 있고 생성된
  호출도 그것을 뺀다(U-2). `args` 자체도 빠질 수 있으며 그것은 `{}`다. 그래서 property나 parameter가 모두 `default`를 가진
  member의 호출은 `args`가 필요 없다. 코어가 넘기는 인자, 곧 callback fixture의 행과 그 `calls`의 호출(CK-22)은 코어가
  callback에 주는 것, 곧 모든 parameter이므로, 그 `args`는 정확히 member의 parameter이고 member가 parameter를 받지
  않을 때만 빠질 수 있다. 어느 형태에서든 parameter가 아닌 키, 빠진 parameter, 객체가 아닌 `args`는 같은 메시지로
  지적된다. 이유: 형태마다 규칙이 둘이었고, step과 `after`의 호출은 소비자 계약의 case가 `new`와 `from`에 약 2000곳에서
  쓰는, `args` 없는 형태를 거부했다. 한 규칙이 그 형태를 유효하게 두며, callback의 행만 다른 까닭은 fixture가 그것을
  받은 인자와 비교하기 때문이다(B2.408).
- **CK-96** member case의 모든 key는 뜻을 가진다(G-5): member의 parameter의 snake_case 이름, receiver를 가진 member의
  case가 `receiver`를 주지 않으면 receiver를 만드는 그 class의 constructor나 static member의 parameter, 결과의
  key(CK-22), 또는 case의 key인 `id`, `rule`, `note`, `receiver`, `with`(생성기 GN-13pa), `raises`, `after`, `then`, `faults`, `service`,
  `@files`, `@listener`, `repeat`, `awaits`, `targets`(CK-97), 또는 `cases`의 행이 `reads`에 이름한 key. `reads`는 그 group의 case에서 저장소 자신의
  시험이 읽고 어떤 생성기도 읽지 않는 snake_case key의 list다. 예를 들어 core 시험과 손으로 쓴 host 시험이 비교하는
  입력 bytes와 기대 tree다: `{"member": "serialize", "file": "contracts/php-serialize.json", "group": "cases",
  "result": "serialized", "reads": ["bytes", "data", "tree"]}`. `binding check`는 다른 key를 그 key, case, member와
  함께 보고한다. 이유: 생성기는 아는 key만 읽으므로, `@files` 대신 쓴 `files`나 `cases`의 행이 이름하지 않은 key
  아래의 결과 같은 다른 이름의 key는 아무 말 없이 모든 시험에서 빠지고, case는 말하는 것보다 적게 검사한다. case
  파일은 저장소의 시험도 읽으므로, 행이 그 시험이 읽는 key를 선언한다. `reads`는 계약이 아니라 행의 field다. 행이
  이미 group과 그 `result`를 이름하고, 한 member의 두 group이 다른 key를 가지기 때문이다(한 group에는 `bytes`, 다른
  group에는 `written`).
- **CK-97** case의 `targets`(generator GN-13bc)는 그 member가 생성되는(그리고 그 행의 `only`가 나열하는) target의
  비어 있지 않은 목록이고, 같은 인자를 가진 그 group의 case들은 각각 `targets`를 가지며 함께 그런 target을 모두 나열한다.
  `binding check`는 targets가 다른 target을 이름하거나 입력이 어떤 target에 case를 남기지 않는 case를 보고한다. 이유:
  `targets`를 가진 case는 언어의 숫자 모델에 따라 갈리는 결과를 말하고, 그 입력의 어느 case도 나열하지 않는 target은 run이
  통과하는 동안 그 입력을 시험하지 않은 채로 둔다.
- **CK-98** member의 `default`(generator GN-6d, B2.379)는 callback interface(U-3)의 member에 붙는
  `{"literal": <value>}`이고, 그 literal은 member가 돌려주는 type의 값이다: bool, 정수(`uint`이면 음이 아닌), 숫자,
  text, 이 계약의 enum의 variant의 값, 또는 `optional`이면 `null`이나 그런 값. `binding check`는 다른 unit의 member에
  붙은 default와, 돌려주는 type의 값이 아닌 literal을 보고하며, `none`을 돌려주는 member의 default도 그중 하나다.
  이유: default는 host 객체가 member를 뺄 때 trait method가 코어에 돌려주는 것이므로, 코어가 host 객체를 통해
  호출하지 않는 member의 default는 아무것도 말하지 않고, 다른 type의 literal은 trait method에서 컴파일되지 않거나
  코어에 그 type이 갖지 않는 값을 준다. callback interface의 member의 parameter는 `default`를 갖지 않으며(B2.409),
  `binding check`는 그런 default를 unit, member, parameter를 대어 보고한다. 이유: 코어는 callback에 모든 인자를 넘기므로
  그 parameter의 default는 쓰이지 않고, callback fixture의 행은 정확히 그 parameter를 주므로(CK-101), 그 default는 어떤
  행도 어떤 target도 갖지 않는 호출 형태를 말하게 된다.
- **CK-99** 코어 signature(I-1, I-2, generator GN-4a, GN-6g, GN-7; B2.398, 아직 실행하지 않음): `binding check`는 계약을
  컴파일러가 기술하는 코어의 public API와 target마다 비교한다. 출처: target마다 `core.path`의 코어 crate의 rustdoc
  JSON이며, `cargo rustdoc --lib --locked --offline`에 그 target의 빌드의 feature(GN-4a: 행이 있는 target은
  `--no-default-features --features <core.features.<target>>`, 그 밖에는 default feature)를, `wasm`은
  `--target wasm32-unknown-unknown`을, 다른 네 target은 host를, rustdoc 옵션
  `--cap-lints warn -Zunstable-options --output-format json`을 주어 빌드한다; feature와 Rust target이 같은 target들은
  빌드 하나를 함께 쓴다. 검사는 자신이 명시한 `format_version`의 JSON만 읽고, 다른 version은 finding이다. 비교하는
  사실:
  - target이 생성하는(`only`가 빼지 않은) member의 각 core path와, 그런 member나 `default_core`가 명시하는 각 상수는
    그 target의 JSON에서 crate root부터 module과 re-export(`use`, glob `use`)를 거쳐 item으로 해석되고, method는 그
    type의 inherent impl과 trait impl을 거쳐 해석된다; 해석되지 않는 path는 member, path, target을 담은 finding이므로,
    target의 빌드에 없는 feature 아래에서 코어가 정의하는 상수는 그 target에서만 보고된다;
  - `std::string::ToString::to_string` 같은 다른 crate의 path는 코어 JSON에서 receiver type의 trait impl을 거쳐
    해석되며, trait impl은 trait을 그 path로 나열한다; 그 signature는 그 JSON에 없으므로 존재만 비교한다;
  - 해석된 각 함수의 반환 type은 type alias를 거쳐, member의 `core.result`가 성립할 때(명시되었거나 GN-7로 도출될 때)에
    한해 `core::result::Result`이고, 그 error type은 `core.failure`가 성립할 때(명시되었거나, callback이나 함수를 담은
    `keeps` 없는 parameter로부터 GN-7로 도출될 때)에 한해 `binding_core::Failure<_>`이다; 어긋남마다 member, target,
    계약의 사실, 코어의 type을 담은 finding이다.

  읽을 수 없는 코어는 finding이며 결코 통과가 아니다: 고정된 toolchain이나 그 `wasm32-unknown-unknown` target이
  없거나, dependency가 로컬 Cargo cache에 없거나(`--offline`), 빌드가 실패하거나, JSON의 `format_version`이 다른
  경우다. finding은 target, 명령, 그 오류를 담은 `CK-99 core unreadable`이며 `make install`을 명시한다. 이유: 검사는
  계약만 읽었으므로, `core.failure: true` 없이 코어가 `Failure`를 돌려주는 `keeps` member(template, E0053과 E0308)와
  WASM 빌드가 끄는 feature의 상수(orm, E0425)가 검사를 통과했고, 생성된 crate가 컴파일될 때에야 실패했다; 컴파일러의
  코어 기술은 그 compile과 같은 signature와 같은 feature를 말하는 유일한 출처이며, binding은 여전히 Rust 소스를
  parse하지 않는다(R5). rustdoc의 JSON 출력은 Rust 1.99에서 unstable이므로(`-Zunstable-options`, 그리고 `cargo
  --output-format json`은 stable에서 거부된다), 검사는 저장소가 component와 `wasm32-unknown-unknown` target과 함께
  고정하는 nightly toolchain으로 실행하며, stable toolchain에 `RUSTC_BOOTSTRAP`을 주어 실행하지 않는다: 그것은 channel
  몰래 unstable 기능을 켜는 것이다(P7); 새 nightly는 고정의 변경이며, 같은 commit에서 검사가 그 `format_version`을
  읽도록 바뀐다. `--cap-lints warn`은 코어 문서의 lint를 검사 밖에 둔다: workspace가 warning을 deny하는 코어는 모호한
  doc link에서 rustdoc이 실패하며(json 코어, `stringify`는 함수이자 macro다), 이는 signature에 대해 아무것도 말하지
  않는다. B2.398이 끝날 때까지 검사는 CK-99를 실행하지 않으며, 모든 consumer의 빌드(`make consumers-check`, B2.391)가
  compile할 때 이 어긋남을 잡는다.
- **CK-100** case의 값은 그 자리의 type의 값이다(T-1). case가 값을 주는 모든 자리에서 그렇다: 인자, 결과, list의 항목
  (반복 형태 `{"kind": "list", "value": ...}`의 값도), tuple의 부분, map이나 keyed map의 항목, optional의 값, record의
  field와 tag가 가리키는 variant의 case의 field. `uint` 자리에서는 음이 아닌 정수, `int`에서는 정수, `int64`에서는 i64
  범위의 정수, `float`에서는 숫자, `bool`에서는 bool, `text`나 `latin1`에서는 text다. `binding check`는 다른 값을 case,
  자리, 값, type과 함께 보고한다. 객체 형태의 값(`{"float": ...}`, `{"ill_formed": ...}`, service 값, 조합된 text)은 그
  형태의 규칙으로 판단한다(GN-13bc, GN-13j, GN-13l). kind `invalid_number`나 `invalid_argument_type`를 내는 case에서는
  인자 안 어디의 값이든(인자 자체, 그 optional의 값, 그 안의 항목·entry·field) type 밖이어도 된다: binding은 입력의 모든
  자리에서 코어가 돌기 전에 그런 값을 그 kind로 거부하고, 동적 target은 그것을 JSON kind 그대로 주며, Go는 그 case의
  test를 쓰지 않으므로(GN-13w) 그 case가 그 거부의 유일한 test다. 결과와 다른 kind를 내는 case의 인자는 target이 그
  type의 literal로 쓰므로 계속 보고한다. 이유:
  crud-ui generator의 case `list-options-ignored`가 `ListOptions`의 field `total`(`uint`의 `optional`)에 -1을 주었고,
  `binding check`는 그것을 통과시켰으며, Go test는 `ptr(uint64(-1))`을 담아 `go vet`이 `uint64`를 넘치는 상수로
  거부했다. target이 쓰는 자리에서 type 밖의 값은 case의 결함이므로, 검사는 target의 build가 실패하기 전에 그것을
  지목한다. 이 허용이 인자 자체에서처럼 인자 안에서도 성립하는 것은 session-store가 `redis_sessions.new`의 record 인자
  `options`의 uint field `lifetime`과 `lock_expire`에 든 `-1`, `1.5`, `"60"`, `true`를 `invalid_number`로 거부하기
  때문이다. 최상위만 받는 검사는 binding의 그 거부의 유일한 test를 거부하게 된다.
- **CK-104** 들어오거나 나가는 행 중 `when.predicate`가 `sequence_keys`인 행을 가진 value alias는 그 술어가 뜻하는 키
  형태를 `"sequence_keys": {"keys": "text"}`나 `{"keys": "int"}`로 밝힌다: `text`는 키가 차례로 text `"0"`부터
  `"n-1"`이고, `int`는 차례로 int `0`부터 `n-1`이다. 빈 map은 두 형태에서 모두 sequence 키를 가진다. 그런 행이 있고
  밝힘이 없는 alias는 alias와 그 행과 함께 거부된다. 기본값은 없다. 생성기는 case map의 `sequence_keys`를 밝힌 형태로
  판단한다(GN-13e). 이유: 코어는 자기 키로 술어를 계산하고, 생성기는 case 키의 모양으로 int라고 짐작했다. orm의 코어는
  text를 뜻하므로(`orm_value.rs`는 키를 그 위치의 text와 비교한다) 키가 `"0"`, `"1"`인 map이 sequence 키가 없다고
  판단되었다: `codec.decode` / `sequence_map_kind`의 PHP test는 코어가 행의 `map_value`를 주는 곳에서 bare map을
  기대했고, `map_value.constructor` / `kinds`와 `map_value.entries` / `kinds`는 그 값을 bare array로 주었는데, PHP는
  키 `"0"`을 int `0`으로 바꾸므로 그것을 list로 읽는다(B2.490). 기본값은 바로 그 짐작이고, orm과 template에서 틀리며
  조용히 통과한다.
- **CK-103** `{computed}` 기본값에는 그것을 코어에 맡기는 case가 있다(U-2, generator GN-13d): public unit의 public member가
  `{computed}` 기본값이 있는 parameter를 받거나, 그런 field가 있는 이 계약의 record를(`optional`로도) 받으면, 계약에는 그
  member의 case 가운데 `raises`를 적지 않고, fault를 걸지 않으며(`faults`가 없고, instance 값의 `then` 호출에도 fault가
  없다), 그 parameter나 field를 코어에 맡기는 것이 있다. 맡긴다는 것은 그 키가 없거나 null이라는 뜻이고, field라면 record가
  없거나 null이거나, record에 그 키가 없거나 그 값이 null이라는 뜻이다. `binding check`는 그런 case가 없는 parameter와
  field를 member, 자리, 기본값의 규칙 id와 함께 보고한다. callback unit, host unit, error unit의 member와 상수에는
  CK-22에서처럼 묻지 않는다. case가 함수 fixture의 step이나 `after`의 호출뿐인 member는 보고한다. 그 case는 member 자신의
  case여야 한다. 이유: `{computed}` 기본값은 코어가 호출 때 만드는 값이다. crud-ui의 새 row의 임의 키(`Form.addRow`)가
  그렇다. 그래서 U-2 시험은 그 값을 비교하지 않고 두 호출의 outcome만 비교한다(GN-13d). 코어가 만드는 값의 증명은 그
  기본값이 적은 규칙의 case가 맡는다. 이 검사가 없으면 `{computed}` 선언은 기본값의 시험을 끄기만 하고 그 자리에 아무것도
  두지 않는다.
- **CK-23** 예약어(N-2): 대상 언어가 public unit이나 internal unit(GN-6r), member, parameter, field에 주는 이름은 바인딩이 그 이름을 쓰는 자리에서
  그 언어가 예약한 단어가 아니다. PHP는 키워드와 내장 타입 이름을 대소문자 없이 class와 함수에서 예약한다(method, property,
  변수는 쓸 수 있다). Python은 키워드를 모든 자리에서, JavaScript(Node, WASM)는 예약어와 `eval`, `arguments`를 class, 함수,
  parameter에서 예약한다(property는 쓸 수 있다). Go는 모든 이름을 대문자로 시작하므로 키워드와 겹치지 않고, 생성된 Rust는
  키워드를 escape한다. naming exception(N-3)이 그 언어에 다른 이름을 주며 검사는 그것이 준 이름을 받아들인다. 생성기는
  아직 naming exception을 생성하지 않으므로 finding은 생성기에서 통하는 해결 방법을 적는다: 계약에서 그 unit, member,
  parameter, field의 이름을 바꾼다.
- **CK-20** 한 릴리스(L-2): 레포의 `Cargo.lock`은 `polyspec-binding-core` 하나를 실행 중인 binding의 버전으로 고정한다. 한
  릴리스가 CLI(npm 패키지 `@polyspec/binding`, bin `binding`)와 crate를 함께 내고 생성 코드는 그 crate에 맞춰 쓰기 때문이다.
  `Cargo.lock`이 없거나, 고정이 없거나, 다른 버전이면 finding이다. git 의존이면 실행 중인 binding의 커밋으로도 고정한다.
  그 커밋은 `git archive`가 쓴 tree에서는 그것이 `packages/ts/archive-commit`에 쓴 커밋(`.gitattributes`의 속성
  `export-subst`; checkout은 자리표시 `$Format:%H$`를 그대로 둔다)이고, 아니면 binding checkout의 HEAD이거나, binding을 git에서
  설치한 프로젝트의 npm lock이 정한 커밋이다. 다른 커밋이면 finding이다.
  이 커밋을 하나도 알 수 없는 binding은 커밋을 담지 않는 릴리스의 npm archive(GitHub Release의 `polyspec-binding-X.Y.Z.tgz`)이고,
  버전 X.Y.Z의 릴리스는 어떤 단계도 옮기지 않는 annotated tag `vX.Y.Z`다. 그래서 실행 중인 binding의 tag `v<version>`을
  이름하는 Git source(`?tag=vX.Y.Z`)는 그 커밋이고, 다른 source는 finding이다.

## binding의 표

이 닫힌 집합은 binding의 것이다. Rust 이름은 `binding_core`의 것이다(`docs/core-api.md`).

- 레포 이름의 약어 낱말(P-1, E-2, N-2): `api`, `crud`, `csrf`, `css`, `fsm`, `html`, `http`, `id`, `io`, `json`, `orm`,
  `php`, `sql`, `ui`, `uri`, `url`, `xml`. 레포 이름의 새 약어는 이 표(`packages/ts/src/names.ts`의 `LIBRARY_ACRONYMS`, 그것을 갖는
  유일한 곳)에 더한다.
- 값 kind: `null`, `bool`, `int`, `int64`, `float`, `number`, `text`, `text16`, `bytes`, `list`, `map`, `object`, `reference`,
  `safe_text`, `native`, `nested:json_value`, `nested:template_value`, `nested:php_value`(`ValueKind`). `int`와 `int64`는 같은 이름의
  계약 타입의 형태를 갖는다(Node `number`와 `bigint`, T-1). `text16`은 짝 없는 surrogate까지 담는 UTF-16 code
  unit의 text이고, 값 class가 `uint`의 list를 읽거나 받는 member로 주고 만든다(GN-6x). PHP와 Go의 문자열은 짝 없는
  surrogate를 담지 못하므로 어떤 내장 형태도 그것을 만들지 않는다.
- 술어와 그 kind: `utf8`(bytes), `sequence_keys`(map), `safe_integer`(int와 float), `integral_float`(float)(`Predicate`). 행은
  `when: {predicate, is}`로 적는다.
  float의 `safe_integer`는 음의 영을 포함해 ±(2^53−1)의
  닫힌 범위에 있는 유한한 정수 값에서만 참이다. 순서가 있는 incoming case 목록은 outgoing 행과 일치하는
  모든 분기가 그 outgoing kind로 분류할 때만 유효하다. 적용 가능한 미정 술어는 양쪽 분기를 모두 가질 수 있고,
  미분류 분기가 있거나 결과 kind가 다르면 CK-8이 실패한다. kind의 적용 범위 밖인 술어는 계속 거부한다.
  특히 소수와 1e16이 모두 조건을 만족하므로
  `safe_integer=false`에서 `integral_float`는 미정으로 남는다.
- 내장 형태와 각각이 만드는 언어 타입:

  | 형태 | php | python | node, wasm | go |
  |---|---|---|---|---|
  | `null` | `null` | `None` | `null` | `nil` |
  | `bool` | `bool` | `bool` | `boolean` | `bool` |
  | `int` | `int` | `int` | `number` | `int64` |
  | `bigint` | 없음 | `int` | `bigint` | 없음 |
  | `float` | `float` | `float` | `number` | `float64` |
  | `text` | `string` | `str` | `string` | `string` |
  | `bytes` | `string` | `bytes` | `Uint8Array` | `[]byte` |
  | `list` | `array` | `list` | `Array` | `[]any` |
  | `map` | `array` | `dict` | `Map` | `map[string]any` |
  | `keyed_map` | `array` | `dict` | `Map` | `*KeyedMap[any]`(GN-15) |
  | `php_object` | `stdClass` | 없음 | 없음 | 없음 |
  | `php_reference` | `reference` | 없음 | 없음 | 없음 |
  | `native` | `object` | `object` | `object` | `any` |

  `keyed_map`은 섞을 수 있는 key 종류(`int`, `bytes`, `text`)와 함께 `{keyed_map: {key: [...]}}`로 적는다(U-7 (c)).

  `in` 행이 가리킬 수 있는 내장 타입은 이 표의 타입이다. 계약 타입 `keyed_map<T>`는 `{keyed_map: T, key: [...]}`로
  적는다(T-2).
- `types`는 계약이 쓰는 값 타입의 소유자를 적는다: `json_value`, `template_value`, `php_value`마다 `{library, unit}`.
  `host_value`는 binding의 것이다(T-2).
