<!-- doc-id: contract-check -->
# 계약 검사

[English](contract-check.md)

`binding check <interface.json>`과 `packages/ts`의 `checkContract(contract, { dependencies })`는 Rust 컴파일러가 판정하지 못하는 인터페이스 계약의 모든 규칙(설계
I-2)과 설계가 계약 검사에 맡긴 모든 규칙을 판정한다. finding이 하나라도 있으면 계약을 거부한다. finding은 아래 검사 id 하나,
항목의 JSON pointer, 규칙을 적는다. `dependencies`는 계약이 가리키는 라이브러리의 계약이다(T-3, E-1b). 명령은 계약 옆
crate에 대해 Cargo가 해석한 패키지(`cargo metadata`)에서 읽는다. 라이브러리의 crate는 `polyspec-<library>`(P-1)이고 그
`interface.json`을 담는다(I-1). 다른 checkout은 읽지 않는다(S15). 필요한 계약이 없으면 그 검사가 그 사실을 보고한다.

스키마와 todo 검사가 먼저 실행되고, 나머지 검사는 둘을 통과한 계약에서만 실행된다. 계약의 형태를 읽기 때문이다.

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
  `template_value`, `php_value`)은 `types`에 소유자가 있다(T-3).
- **CK-4** 이름 예외(N-3): 예외는 target과, 있는 unit, 그 unit의 member, 그 member의 parameter, 그 record의 field를 가리킨다.
  기호와 언어마다 예외는 하나다. 예외는 변환한 이름(N-2)과 달라야 한다. 아무것도 바꾸지 않는 예외에는 근거가 없기 때문이다.
- **CK-5** optional 반환과 field(T-5, T-4): `optional<T>`를 돌려주는 member는 `optional_reason`을 갖고, 그런 member만
  갖는다. 타입이 `optional<T>`인 record field는 `reason`을 갖고, 그런 field만 갖는다.
- **CK-6** 순환(P-4): `implements`와 오류 `parent`는 순환하지 않는다.
- **CK-8** value unit(U-1, U-7):
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
- **CK-14** module(L-1): module의 첫 마디는 `host`나 `tests`가 아니다. 빈 module은 패키지의 루트다(P-2).
- **CK-15** WASM(Q-4): `wasm`이 target이면, parameter·반환·yields에 `path`가 있거나(record·variant 안 포함) wait가
  `blocking_io`·`process_wait`인 member는 자신이나 unit에 `wasm`이 없는 `only`와 그 규칙 id를 갖는다.
- **CK-16** Python awaitable(N-5, U-3): wait가 `none`이 아닌 member나 `async_allowed: true`인 callback member의 `a<name>`은
  같은 unit의 다른 member의 Python 이름이 아니다.
- **CK-17** callback(U-3, T-3): `async_allowed`와 `errors`는 callback member만 갖고, 모든 callback member는 `async_allowed`를
  적는다. `recognize`는 오류 unit을 가리킨다. 이 계약의 callback을 구현하는 이 계약의 generated class에 wait가 `none`이 아닌
  member가 있으면 같은 이름의 callback member는 `async_allowed: true`다.

- **CK-18** 패키지 이름(P-1): 코어 crate는 `polyspec-<library>`, Composer `polyspec/<library>`, PHP namespace
  `Polyspec\<Repository>`, PyPI `polyspec-<library>`, Python 루트 `polyspec.<repository의 - 를 _로>`, npm
  `@polyspec/<library>`이고, `<Repository>`는 PHP 클래스 형태의 레포 이름이다. 코어가 `packages/<component>/rust`이면(L-1)
  library는 `<repository>-<component>`이고 namespace와 module은 레포의 것 아래다: `Polyspec\CrudUi\Validator`,
  `polyspec.crud_ui.validator`.

- **CK-19** 추적하는 바인딩 package(L-2): `binding check`는 바인딩 package의 추적 파일(docs/spec/generator.md
  GN-3a)을 `binding scaffold`가 쓸 내용과 비교한다. 없거나 다른 파일은 finding이다.
- **CK-20** 한 릴리스(L-2): 레포의 `Cargo.lock`은 `polyspec-binding-core` 하나를 실행 중인 binding의 버전으로 고정한다. 한
  릴리스가 CLI(npm 패키지 `@polyspec/binding`, bin `binding`)와 crate를 함께 내고 생성 코드는 그 crate에 맞춰 쓰기 때문이다.
  `Cargo.lock`이 없거나, 고정이 없거나, 다른 버전이면 finding이다.

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
  | `keyed_map` | `array` | `dict` | `Map` | 없음 |
  | `php_object` | `stdClass` | 없음 | 없음 | 없음 |
  | `php_reference` | `reference` | 없음 | 없음 | 없음 |
  | `native` | `object` | `object` | `object` | `any` |

  `keyed_map`은 섞을 수 있는 key 종류(`int`, `bytes`, `text`)와 함께 `{keyed_map: {key: [...]}}`로 적는다(U-7 (c)).

  `in` 행이 가리킬 수 있는 내장 타입은 이 표의 타입이다. 계약 타입 `keyed_map<T>`는 `{keyed_map: T, key: [...]}`로
  적는다(T-2).
- `types`는 계약이 쓰는 값 타입의 소유자를 적는다: `json_value`, `template_value`, `php_value`마다 `{library, unit}`.
  `host_value`는 binding의 것이다(T-2).
