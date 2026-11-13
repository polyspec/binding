<!-- doc-id: contract-check -->
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

## 검사

스키마는 npm 패키지 `@polyspec/binding`에 들어 있고 `./schema/interface.schema.json`으로 내보낸다(S15).

- **CK-1** 스키마: 계약이 `packages/ts/schema/interface.schema.json`(JSON Schema 2020-12, Ajv)을 통과한다. 모든 reason은 규칙 id이므로
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
  - value alias는 `HostValue`로 설명한 언어 값을 판정하는 코어 함수(`fn(&mut dyn HostValues, HostValue) -> Result<T, Failure<E>>`)와
    코어 값을 `OutValue`로 주는 코어 함수(`&T`를 받아 `(OutValue, V)`를 돌려주며 `V: OutValues`가 그 값을 빌릴 수 있는 함수)를 `core: {in, out}`에 적는다. value class는 `in`
    행이 그 member를 읽으므로 그런 `core`를 갖지 않는다.
  - 값 타입을 대표하는 unit이 `out`과 `in`을 갖는다. alias가 모으지 않는 `value` class이거나 `alias`(origin `value`)다.
    alias가 모으는 class(alias의 `in` 행이 그것을 가리킨다)는 둘 다 갖지 않는다. alias의 구성원은 그 `in` 행의 언어
    타입이다(U-7 (a)).
  - `in` 행은 target과, 아래 표의 내장 타입이거나 대표 class 자신이거나 대표 alias가 모으는 class인 언어 타입을 가리킨다.
    언어와 타입마다 행은 하나다.
  - `by`가 있으면 `by`는 계약의 `enum` unit을 돌려주는 공개 member이고, 모든 case가 `is`를 갖고 `when`이 없으며, enum의
    모든 값이 정확히 한 case의 `is`다. `by`가 없으면 class의 행은 case 하나이고 `is`가 없으며, 내장 타입의 행은 한 kind의
    행처럼(아래) `when`으로 case를 나눌 수 있고 술어는 코어가 판정한다(U-7 (f)).
  - class의 case는 공개 member인 `read`를 적고, 내장 타입의 case는 `read: builtin`이다(U-7 (e)). kind `null`이나 `native`인 case는 내용이 없거나 코어가 열어 보지 않으므로 `read`가 없다(U-1, VAL-18). kind `native`는 형태 `native`로 만들고 그 형태는 다른 kind를 만들지 않는다. native 값은 `OutValue::Native`의 handle로 들어온 언어 객체 그대로이기 때문이다(VAL-18).
  - `out` 행은 모든 target에서 값을 만든다. `make`는 그 언어에 있는 내장 형태(`keyed_map`은 `{keyed_map: {key: [...]}}`),
    대표 class나 alias가 모으는 class의 공개 `constructor`·`static` member, 또는 kind `nested:X`의 `{value: X}`다.
  - `when`은 행의 kind에 해당하는 술어이거나 `else`다. 한 kind의 행과 한 내장 `in` 행의 case는 `when` 없는 것 하나, 같은
    술어의 `is: true`와 `is: false`, 또는 서로 다른 술어 값들과 나머지를 받는 `else` 하나다(U-7 (b)).
  - 왕복(P-3): `make`가 만드는 언어 타입은 그 언어의 `in` 행을 갖고, 그 행은 값을 행의 kind로 분류한다. 내장 형태는
    binding의 닫힌 표가 만든 값의 술어를 정한다(행의 `when`, `else` 행은 형제 행들이 한 값으로 고른 술어의 다른 값,
    `text`는 UTF-8, `int`는 정수인 안전 정수, `list`는 키 0~n-1). `when`이 맞는 첫 case가 그 case이며, 표가 정하지 않는
    술어를 묻는 case는 finding이다. `by`가 있는 class는 `is`를 실행 때만 알 수 있으므로 행의 kind가 case 하나를 정확히
    가리켜야 한다. case 중 하나라도 맞으면 통과로 보는 검사는 잘못된 분류를 통과시키므로 쓰지 않는다. G-5의 생성 왕복
    시험은 남는다.
  - `writable`은 `value` unit의 property만 갖는다(U-2).
  - `in_raises`는 `core: {in, out}`를 가진 값 alias에만 두고 이 계약 `errors.kinds`의 variant를 가리킨다. 그 `in` 함수가 낼
    수 있는 kind이며, 그 alias를 받는 모든 member에 붙고 `raises`에는 적지 않는다(U-7, E-5).
- **CK-9** 다른 레포의 unit(T-3): 타입에 쓴 다른 라이브러리의 unit은 그 계약의 `value`, `callback`, `enum`, `record`,
  `variant` unit이다. 다른 라이브러리의 callback·record·variant는 자기 라이브러리의 unit만 쓰며 재귀적으로 확인한다.
  `types`의 값 타입은 소유자의 `value` unit을 가리킨다.
- **CK-10** 오류(E-1, E-1a, E-2, U-1): 오류 unit은 category를 갖고, category와 parent는 오류 unit만 갖는다. parent는 같은
  category의 오류 unit이고 `final`이 아니다. `errors.classes`는 Go를 뺀 모든 target에서 모든 category의 클래스를 갖는다(Go의
  category 타입은 E-7이 정한다). category 클래스 이름은 `<Library><Category>Error`이며 `<Library>`는 각 언어의 클래스
  형태로 쓴 레포 이름이다(N-2: 약어 낱말은 PHP·Node에서 첫 글자만 대문자, Python·Go에서 모두 대문자이므로 `HttpCookieValueError`와
  `HTTPCookieValueError`. 레포 이름의 약어 낱말은 아래 binding의 표다). PHP 클래스는 `packages.php`의 namespace 안에 있다. `errors.fixed`에는 Go 행이 없다(Go에서 G-7은 컴파일 오류다). `kinds`·`binding`의 `class`
  덮어쓰기는 그 kind의 category인 오류 unit이다(의존 kind는 의존 계약의 category를 쓴다, E-1b). 변형과 binding kind는 한 번만
  선언한다.
- **CK-11** 감싼 의존 오류(E-1b, P-4): 계약이 그대로 전달하거나(`library`, E-1b (a)) 자기 kind의 source로 담는(`source`,
  E-1b (b)) 라이브러리의 모든 오류 unit의 모든 property는 `wrapped` 행 하나를 갖는다.
  `forward`는 같은 이름과 타입의 property를 가진 오류 unit을 가리킨다. 어느 property와도 맞지 않는 행은 거부한다.
- **CK-12** record parameter(T-4): member는 record를 많아야 하나, 마지막 parameter로 받는다. PHP와 Python에서 record field
  이름(변환과 예외 뒤)은 member의 다른 parameter 이름과 다르다.
- **CK-13** Go 이름(E-7, P-2): 오류 unit의 Go 이름은 category 오류 타입(`ValueError`, `TypeError`, `IoError`, `StoreError`,
  `BusyError`, `InternalError`)이 아니다. 한 Go 패키지(module) 안에서 타입 이름, `functions` unit의 함수, `New<Unit>` 생성자는
  서로 다르다. host unit은 세지 않는다. 그 Go 코드는 별도 패키지이기 때문이다(L-1).
- **CK-14** module(L-1): module의 첫 마디는 손으로 쓰는 Go 코드의 폴더인 `host`나 `tests`가 아니고, Go 바인딩의 C ABI 층 폴더인 `internal`도 아니다(GN-15). 빈 module은 패키지의 루트다(P-2).
- **CK-15** WASM(Q-4): `wasm`이 target이면, parameter·반환·yields에 `path`가 있거나(record·variant 안 포함) wait가
  `blocking_io`·`process_wait`인 member는 자신이나 unit에 `wasm`이 없는 `only`와 그 규칙 id를 갖는다.
- **CK-16** Python awaitable(N-5, U-3): wait가 `none`이 아닌 member나 `async_allowed: true`인 callback member의 `a<name>`은
  같은 unit의 다른 member의 Python 이름이 아니다.
- **CK-17** callback(U-3, T-3): `async_allowed`와 `errors`는 callback member만 갖고, 모든 callback member는 `async_allowed`를
  적고, trait 메서드와 receiver를 `core: {path, receiver}`에 receiver `&self`나 `&mut self`로 적는다. 생성된 struct가 그
  trait를 구현하는데 binding은 Rust 소스를 읽지 않기 때문이다. `recognize`는 오류 unit을 가리킨다. 이 계약의 callback을 구현하는 이 계약의 generated class에 wait가 `none`이 아닌
  member가 있으면 같은 이름의 callback member는 `async_allowed: true`다.

- **CK-18** 패키지 이름(P-1): 코어 crate는 `polyspec-<library>`, Composer `polyspec/<library>`, PHP namespace
  `Polyspec\<Repository>`, PyPI `polyspec-<library>`, Python 루트 `polyspec.<repository의 - 를 _로>`, npm
  `@polyspec/<library>`이고, `<Repository>`는 PHP 클래스 형태의 레포 이름이다. 코어가 `packages/<component>/rust`이면(L-1)
  library는 `<repository>-<component>`이고 namespace와 module은 레포의 것 아래다: `Polyspec\CrudUi\Validator`,
  `polyspec.crud_ui.validator`.

- **CK-19** 추적하는 바인딩 package(L-2): `binding check`는 바인딩 package의 추적 파일(docs/spec/generator.md
  GN-3a)을 `binding scaffold`가 쓸 내용과 비교한다. 없거나 다른 파일은 finding이다. host 패키지(L-2a, GN-3b)는 host
  manifest에서 네이티브 모듈에 필요한 항목만 읽는다.
- **CK-21** 코어의 빌드, exclusive member, 코어 경로의 결과(I-1, U-6, E-1c): `core.features`는 target만 가리킨다.
  `exclusive`는 generated class의 receiver `&self` member에만 둔다. `core.result`가 `false`인 member는 `raises`가 없고
  callback이나 함수를 담은 parameter가 없다. `Result`를 돌려주지 않는 코어에는 돌려줄 variant도, callback의 실패를 둘
  자리도 없기 때문이다. `core.result`가 없으면, `raises`가 이 계약 자신의 코어 오류 variant를 가리키거나 parameter가
  callback이나 함수일 때 코어 경로가 `Result`를 돌려준다. `core.result`가 코어와 맞는지는 생성 crate를 컴파일러가
  판정하며(I-2) 이 검사는 판정하지 않는다. 함수 타입(T-2)은 callback member처럼 `async_allowed`를 적고 `recognize`는 오류 unit을
  가리킨다(CK-17).
- **CK-63** WASM 코어(GN-4b): `core.features.wasm`은 플랫폼 I/O의 feature `fs`, `blocking-io`, `process`, `net`을
  적지 않는다.
- **CK-64** 타입 `int`나 `uint` 자리(인자, 그 타입을 담은 list·tuple·map·optional의 항목, 결과)에 있는 case의 정수는 안전
  정수다. 이것이 모든 target이 주는 T-1의 범위다(Node `number`). 그보다 큰 정수는 한 target에서는 `int64`이고 다른
  target에서는 `int`가 아니므로, case가 두 결과를 기대하게 된다. i64 범위를 받거나 주는 member는 `int64`를 적는다(GN-12a).
- **CK-22** 모든 member는 case를 가리킨다(K-1): 오류 unit, callback interface(U-3), host unit(L-2a)이 아닌 public unit의
  constant가 아닌 public member는 `cases` 항목 하나 이상의 `member`다. 그 항목의 file이나 group이 member를 빠뜨리면 G-5가
  e2e를 실패시킨다. `binding check`는 case 파일도 읽는다. `cases`가 가리키는 group은 그 파일에 있고, member는 `raises`의
  행이 내는 kind마다 그 kind를 내는 case를 가진다. member의 `cases` 행은 `result`로 그 case들에서 member의 결과를 담은
  snake_case 키를 적을 수 있다(GN-13e). 적지 않은 행은 키 `result`를 읽고, alias의 행은 그것을 갖지 않는다(CK-1). case의 `receiver`와 class 타입 인자는 GN-13f의 인스턴스 값일 수 있다: 그 member가 있고 `pick`을 거쳐 그 class를
  주며, 메서드는 `receiver`를 갖고, `args`는 member의 parameter이며, `then`의 호출은 그 class의 메서드다. case는 실패 주입점(G-5)을
  `"faults": [{"point": "<library>.<id>", "kind": "io" | "short" | "broken", "errno": "<기호>", "bytes": <n>,
  "nth": <n>}]`로 장전할 수 있다. `<library>`는 snake_case로 쓴 라이브러리 이름이며 이 계약이나 검사가 받은 라이브러리의
  것이고, `<id>`는 그 계약 `faults`의 점이다. `kind`는 그 점의 `inject` 중 하나다. `bytes`는 `short`에만, 그리고 `short`에는
  반드시 둔다. errno의 기호(`ENOSPC`)인 `errno`는 `io`에만 둔다. `nth`는 1부터 센다. fault에 다른 키는 없다. `faults`를
  가진 case는 그 점들의 `fills`에 있는 kind만 채우며, 다른 kind를 기대하는 그런 case는 거부한다. 입력 규칙의 case가
  입력으로 남게 하기 위해서다. case `raises`의 `errno`가 텍스트이면 그런 기호다. category `internal`의 kind는 member마다
  case를 요구하지 않는다(X-1). 코어 오류를 옮기는 match가 모든 member에 하나이기 때문이다. 그런 kind를 가진 오류
  enum마다, 곧 이 계약 자신의 것과 kind를 그대로 전달하는(E-1b (a)) 라이브러리마다, 어느 member의 case 하나가
  `<library>.internal`을 `broken`으로 장전하고 category `internal`의 kind를 낸다. 값 alias `in_raises`의 kind는 그 alias를
  가리키는 `cases` 행의 group에 case를 둔다(U-7). 그 group은 member의 행이 가리키지 않는다. 그 case는
  `{"id", "value", "raises"}`(그리고 `note`, `rule`)이고 `raises.kind`는 `in_raises`의 kind이며, `in_raises`의 kind마다
  하나가 있다.
  callback interface를 parameter로 받는 member의 case는 그것을 callback fixture로 준다(G-5, GN-13):
  `{"callback": {<member id>: [<행>]}}`의 member id는 그 interface의 member이고, 행과 `calls`는 `args`에 그 member의
  parameter를 정확히 주며, 행의 키는 `args`, `result`, `raise`, `once`, `async`뿐이다. `result`와 `raise`를 함께 가진 행,
  member가 recognize하지 않는 오류 unit의 `raise`(U-3), `async_allowed`가 없는 member의 `async` 행, 행이 줄 수 없는 언어
  객체(class, callback, 함수, host value)를 받는 member의 행은 지적된다. 함수 타입이나 다른 타입 안의 callback
  interface를 받으면서 raises가 있는 member는 case가 아직 그것을 줄 수 없으므로 그 case 형식(GN-13a)을 기다린다고
  지적되며, 빠지지 않는다.
- **CK-23** 예약어(N-2): 대상 언어가 public unit, member, parameter, field에 주는 이름은 바인딩이 그 이름을 쓰는 자리에서
  그 언어가 예약한 단어가 아니다. PHP는 키워드와 내장 타입 이름을 대소문자 없이 class와 함수에서 예약한다(method, property,
  변수는 쓸 수 있다). Python은 키워드를 모든 자리에서, JavaScript(Node, WASM)는 예약어와 `eval`, `arguments`를 class, 함수,
  parameter에서 예약한다(property는 쓸 수 있다). Go는 모든 이름을 대문자로 시작하므로 키워드와 겹치지 않고, 생성된 Rust는
  키워드를 escape한다. naming exception(N-3)이 그 언어에 다른 이름을 준다.
- **CK-20** 한 릴리스(L-2): 레포의 `Cargo.lock`은 `polyspec-binding-core` 하나를 실행 중인 binding의 버전으로 고정한다. 한
  릴리스가 CLI(npm 패키지 `@polyspec/binding`, bin `binding`)와 crate를 함께 내고 생성 코드는 그 crate에 맞춰 쓰기 때문이다.
  `Cargo.lock`이 없거나, 고정이 없거나, 다른 버전이면 finding이다. git 의존이면 실행 중인 binding의 커밋으로도 고정한다.
  그 커밋은 `git archive`가 쓴 tree에서는 그것이 `packages/ts/archive-commit`에 쓴 커밋(`.gitattributes`의 속성
  `export-subst`; checkout은 자리표시 `$Format:%H$`를 그대로 둔다)이고, 아니면 binding checkout의 HEAD이거나, binding을 git에서
  설치한 프로젝트의 npm lock이 정한 커밋이다. 다른 커밋이거나
  커밋을 알 수 없으면 finding이다.

## binding의 표

이 닫힌 집합은 binding의 것이다. Rust 이름은 `binding_core`의 것이다(`docs/core-api.md`).

- 레포 이름의 약어 낱말(P-1, E-2, N-2): `api`, `crud`, `csrf`, `css`, `fsm`, `html`, `http`, `id`, `io`, `json`, `orm`,
  `php`, `sql`, `ui`, `uri`, `url`, `xml`. 레포 이름의 새 약어는 이 표(`packages/ts/src/names.ts`의 `LIBRARY_ACRONYMS`, 그것을 갖는
  유일한 곳)에 더한다.
- 값 kind: `null`, `bool`, `int`, `int64`, `float`, `number`, `text`, `bytes`, `list`, `map`, `object`, `reference`,
  `safe_text`, `native`, `nested:json_value`, `nested:template_value`, `nested:php_value`(`ValueKind`). `int`와 `int64`는 같은 이름의
  계약 타입의 형태를 갖는다(Node `number`와 `bigint`, T-1).
- 술어와 그 kind: `utf8`(bytes), `sequence_keys`(map), `safe_integer`(int), `integral_float`(float)(`Predicate`). 행은
  `when: {predicate, is}`로 적는다.
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
