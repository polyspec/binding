<!-- doc-id: changelog -->
# 변경 기록

[English](CHANGELOG.md)

## Unreleased

- make member가 다른 class를 받는 origin value class(`OrderedMap`을 받는 json의 `Value.object`)의 kind map case 값은
  "takes more than one value"나 "no case value of the type"으로 시험이 실패했다. case의 `[key, value]` 쌍이 그 class의 값이 아니기
  때문이다. 이제 쌍이 그 class를 채운다: parameter 없는 생성자가 만들고, receiver `&mut self`와 parameter 둘을 가진 하나뿐인
  member가 각 쌍을 받으며, parameter가 origin value class면 text key는 kind text의 값이 된다(GN-13). `packages/ts`의 `npm test`로
  검증했다.
- 키워드나 타입 이름의 case를 가진 PHP enum(json의 enum `kind`의 `object`, `array`, `string`, `null`)은 컴파일되지 않았다.
  ext-php-rs의 매크로 `php_enum`이 그 이름을 `#[php(name)]`의 이름으로도 거부하고, 그래서 module이 등록하는 enum 타입이
  없었다(E0425). 이제 그런 case는 확장과 stub에서 뒤에 `_`를 붙이고(`Kind::Object_`), backed 값은 계약의 값이다(GN-10).
  `packages/ts`의 `npm test`와 json PHP binding의 clippy로 검증했다.
- 코어가 값으로 받는 class의 parameter(`OrderedMap::insert(&mut self, key: Value, value: Value)`의 `key`와 `value`)는
  컴파일되지 않았다. 호출이 guard의 참조를 주었기 때문이다(E0308). 이제 인자는 값의 참조에 대한 `CoreForm::core_form`이고, 코어
  parameter의 타입이 그것을 참조나 사본으로 바꾼다(GN-6h). `packages/ts`의 `npm test`와 json의 Node, Python, WASM binding의 clippy로
  검증했다.
- 코어 경로가 trait 함수인 잠긴 class의 member(경로가 `std::string::ToString::to_string`인 `value.to_string`)는 컴파일되지
  않았다. 호출이 guard의 참조를 주었는데 generic 경로는 그것을 deref하지 않기 때문이다(E0277). 이제 생성 코드는 모든 잠금을 얻은 뒤
  각 자리의 이름으로 `&*guard`나 `&mut *guard`를 묶고, 코어 호출은 그 이름을 받는다(GN-6h). `packages/ts`의 `npm test`로 검증했다.
- 코어가 참조로 주는 클래스 결과(`Value::members`의 `&OrderedMap`, `Value::items`와 `Value::get`의 `&Value` 항목)는 컴파일되지
  않았다. `out_<class>`가 값을 소유한 형태로 받았기 때문이다(E0308, E0631). 이제 변환은 `impl CoreForm<T>`를 받아 소유한 값은
  그대로 두고 빌린 값은 복제하며, optional이나 list가 더하는 참조 뒤의 값도 같다(GN-6b). `packages/ts`의 `npm test`로 검증했다.
- origin value class를 받는 member의 case는 값을 `{"kind": "text", "value": ...}`로 주었고, 생성기는 어떤 항목도 대지 않는 예외
  "no case value of the type {"unit":"value"}"로 끝나서 json은 어떤 target도 생성되지 않았다. 이제 그 값은 그 kind의 `out` 행이
  적은 member의 호출이고(`Value.string`, list이면 그 값들의 `Value.array`), 생성기가 적지 못하는 값의 case(parameter 둘인
  member로 만드는 kind 등)는 그 이유로 실패하는 시험을 가지며 target의 다른 시험은 적는다. 그 밖에 생성기가 적지 못하는 값은
  예외 대신 이름을 대고 target을 거부한다(GN-13). `packages/ts`의 `npm test`로 확인했다.
- binding에는 CI도 release도 없었다. `.github/workflows/ci.yml`은 `main`의 push와 수동 실행에서 `ubuntu-26.04-arm`으로
  `make check`의 모든 대상과 `make release-coverage`를 job `ts`와 `rust`에서 실행하고, 마지막 job `ci-passed`는 두 job이
  통과했을 때만 통과한다. `.github/workflows/release.yml`은 그런 실행의 commit에 `CHANGELOG.md`의 맨 위 절의 version으로
  tag를 붙이고 `packages/ts`의 npm archive와 함께 GitHub Release를 만든다. 그 tag는 `binding_core`도 Git tag로
  release한다(`config/release.json`). Makefile은 `ci-targets`, `ci-summary`, `ci-passed`, `release-tag`,
  `release-checkout`, `release-prepare`, `release-tools`, `release-tools-path`, `release-assets`, `release-publish`,
  `release-undraft`, `release-coverage`를 더한다.
- 실패 주입점을 가진 코어는 저장소가 flag나 자기 dev-dependency를 주지 않으면 지점이 꺼진 채로 `cargo test`를 돌렸고, 저장소들은
  이를 두 꼴로 했다. 이제 코어는 자기 자신을 `fault-test`와 함께 dev-dependency로 두어, flag 없는 `cargo test`가 지점을
  장전한다. `binding check`는 그것이 없는 코어 manifest를 보고한다(CK-65, GN-5). tests/e2e의 sample 코어가 그 dev-dependency를 갖는다.
- class의 list 항목이나 시험 대상 호출의 class 타입 인자로 인스턴스 값을 준 case는 생성기를 "no case value of the
  type"으로 멈추게 했다. 이제 case의 어느 자리에 있는 class의 값도 인스턴스 값이며, 각 target이 그 자리에서 그것을
  만든다(GN-13f). `tests/e2e/classes`는 `classes.join`과 `tag.same`의 그런 case를 가진다. `packages/ts`의 `npm test`로
  확인했다.
- 생성기는 class unit, callback unit, 값 alias(다른 레포의 것 포함), `in_raises`가 있는 값 alias, `source` parameter,
  기본값이 있는 parameter·field, 오류 unit, 실패 주입 지점을 가진 계약의 Go 바인딩을 거부해서, `tests/e2e/classes`,
  `tests/e2e/shapes`, `tests/e2e/sample`, `tests/e2e/consumer`가 Go에서 아무것도 빌드하기 전에 실패했다. 이제 Go는
  그것들을 모두 생성한다: class는 lock이 있는 표의 handle을 담은 struct이며 `New<Class>`,
  static 함수 `<Class><Member>`, method, iterator, `String()`을 갖는다(GN-15a). callback은 오류가 같은 값으로 돌아오는
  interface다(GN-15b). 값 alias는 코어가 Go에 물어 읽는 `any`다(GN-15c). 오류 unit은 parent를 품은 struct다(GN-15d).
  `source`는 `[]byte`, 기본값은 nil 포인터다(GN-15e). `fault-test`, alias의 `codec-test`, poison 시험의 진입점도 생성한다.
  생성된 Go 시험은 패키지 안에 있으며 U-2, U-7, K-2, 정확한 오류 unit을 보는 B-4, GN-13e, N-4, B-5c를 다루고, 실패를
  장전하는 case는 build tag `polyspec_fault_test`를 갖는다(GN-13b). `binding check`는 class의 static member를 그 Go
  패키지의 이름 가운데 하나로 센다(CK-13). 끝에서 끝까지 확인은 crate의 시험 feature마다 tag를 주어 `go test`를 실행하고,
  feature 없이 빌드한 라이브러리에서 모든 시험용 진입점을 찾는다. `packages/ts`의 `npm test`로 확인했다.
- `binding scaffold`는 70칸보다 넓은 allow 속성을 인자마다 한 줄로 썼다. 이것은 rustfmt 기본 설정의 꼴이어서,
  `use_small_heuristics = "Max"`와 `max_width = 120`을 쓰는 저장소에서는 그 설정이 한 줄로 합치는 각 바인딩 crate의
  `src/lib.rs`에서 `cargo fmt --check`가 실패했다. 이제 allow 속성은 두 꼴 모두가 그대로 두는 80칸 이하의 한 줄이고, 들어가지
  않는 이유는 그 위의 주석이 된다. Node addon의 이유는 규칙 id를 적는다(GN-3a, GN-4).
- 생성기는 루트가 아닌 module의 오류 unit을 모든 target에서 거부했다. 이제 그것을 생성한다. PHP는 그 module의 namespace에
  클래스를 등록하고, Python은 `<root>.<module>`과 `<root>`에서 주며, Node와 WASM은 그 이름으로 내보낸다(GN-7a, GN-11).
  tests/e2e/shapes의 오류 unit `utf8_error`는 module `errors`에 있으므로, 종단 검사는 각 target에서 그 오류를 낸다.
- 기본값 `{empty: "object"}`가 있는 record parameter는 모든 target에서 거부되었다("a default of a record parameter is not
  generated yet"). 그래서 `parse(source, options = {})` 같은 parameter가 있는 계약은 어떤 target도 생성되지 않았다. 이제
  record의 모든 field에 기본값이 있으면 그 parameter를 생성한다. 코어는 모든 field가 `None`인 record를 받고, Python과
  PHP는 field의 keyword와 이름 있는 인자를 생략하며, Node와 WASM은 options record를 빠지거나 `undefined`일 수 있는 뒤쪽
  인자로 받는다. 기본값 없는 field가 있는 record는 이름을 대고 거부한다(GN-6i). `tests/e2e/shapes`는 이 꼴의 member
  `shapes.wrap`을 갖는다. `packages/ts`의 `npm test`와 `tests/e2e/shapes`의 `make e2e`로 확인했다.
- Makefile에 단위 시험 target이 없어서, packages/ts와 binding_core의 시험은 각 패키지의 명령으로만 돌았다. `make test-ts`는
  packages/ts를 type-check하고 시험을 돌리고, `make test-rust`는 binding_core를 모든 feature로, 그리고 feature 없이 시험한다.
  `make lint-rust`는 두 꼴로 clippy를 돌리고 형식을 확인하며, `make check`는 셋을 끝까지 돌리고 실패한 것을 모두 이름한다.
- `binding generate`는 다른 target을 쓴 뒤 거부된 target을 usage 줄과 상태 2로 끝냈다. 명령줄이 잘못된 것처럼 끝냈으므로,
  저장소는 거부와 usage 오류를 구별할 수 없었다. 이제 거부, 계약의 crate가 아닌 코어 manifest, 실패한 `cargo metadata`는 usage
  줄 없이 상태 1로 끝난다. usage는 명령줄 오류만 상태 2와 함께 찍는다(GN-1c).
- 실패 주입점은 binding_core의 feature `fault-test`로 판정되었는데, Cargo는 build 전체에서 그 feature를 합친다. 그래서 코어
  하나가 `fault-test`를 켜면 모든 코어의 지점이 켜졌고, feature에서 `polyspec-<library>/fault-test`를 빠뜨린 바인딩 crate도
  그 라이브러리의 지점을 장전하는 case를 통과했다. 이제 지점은 macro `fault::point!`이고, 그것을 적은 crate의 feature
  `fault-test`로 판정된다. `tests/point.rs`는 코어 둘과, 그 가운데 하나의 feature만 켜는 바인딩을 만들어 이를 확인한다(GN-5).
  코어는 `binding_core::fault::point(NAME)` 대신 `binding_core::fault::point!(NAME)`을 적는다.
- 함수나 다른 타입 안의 callback을 받으면서 raises가 있는 member는 case 형식을 기다린다고 지적되어 그 kind에 case가
  없었다(CK-22). 이제 case는 함수를 `args`가 parameter의 위치인 `{"function": [<행>]}`로, callback 타입의 모든 자리를 그
  fixture나 그 interface를 구현하는 class의 인스턴스 값으로 주고, `binding check`는 fixture를 판정하듯 각각을 판정한다
  (CK-22, GN-13). 생성기는 함수 타입과 다른 타입 안의 callback을 여전히 이름을 대고 거부한다(GN-13a). `packages/ts`의
  `npm test`로 확인했다.
- 인스턴스 값의 `then` 호출이 실패하면 시험은 준비 실패로 멈췄다. 그래서 실패한 호출 뒤의 인스턴스만 닿는 kind(본문이
  다시 주는 실패 같은 것)는 case가 없었다. 이제 `then`의 호출은 그 member `raises`의 kind인 `"raises": {"kind": <kind>}`를
  적을 수 있고, `binding check`가 그것을 판정하며 모든 target이 다음 단계 전에 그것을 요구한다(GN-13f, CK-22).
  `tests/e2e/classes`는 `gate.enter`의 그런 case를 가진다. `packages/ts`의 `npm test`로 확인했다.
- case는 타입 `cancel` 자리에 어떤 값을 주어도 지적되지 않았다. 그래서 호출 전에 발동한 취소만 닿는 kind에는 case
  형식이 없었다. 이제 case는 그것을 `{"cancel": "fired"}`로, 발동하지 않는 취소를 `{"cancel": "open"}`으로 주고,
  `binding check`는 다른 값을 지적한다(CK-22). `packages/ts`의 `npm test`로 확인했다.
- `make`가 member를 적은 값 alias의 `out` 행은 거부되었다. 그래서 언어 형태가 계약의 class instance인 값은 바인딩이
  없었다. 이제 하나뿐인 parameter가 그 kind의 내용이고 실패하지 않는 생성된 class의 생성자나 static member인 행은 그
  내용으로 코어 경로를 부르고, 그 값은 그 class의 instance로 나간다. 다른 member는 이름을 대고 거부한다(GN-6e).
  `packages/ts`의 `npm test`로 확인했다.
- `make`가 `{"keyed_map": {"key": [...]}}`인 값 alias의 `out` 행은 생성되지 않는 형식으로 거부되었다. 그래서 순서열이
  아닌 key의 map을 keyed map으로 주는 값 alias는 어느 언어에도 바인딩이 없었다. 이제 그 행은
  map으로 만들고, 그것이 적은 종류의 key는 항목과 같이 alias의 행으로 만든다(GN-6e). `packages/ts`의 `npm test`로 확인했다.
- 검사는 타입 `int`나 `uint` 자리에 있는 case의 정수를 판정하지 않았다. 그래서 `int` parameter에 9223372036854775807을
  주는 case가 검사를 통과했고, Python과 PHP는 그 값을 i64로 받았지만 Node와 WASM은 kind `invalid_number`로 거부했다.
  이제 검사는 그런 자리에서 안전 정수 밖에 있는 case의 정수를 보고한다(CK-64).
- Node과 WASM 선언은 `int64` parameter를 `number | bigint`로, `int64` 결과를 `bigint`로 적었지만 바인딩은 안전 정수의
  number만 받고 주었다. 그래서 case 9223372036854775807이 인자 오류로 거부되었고, `binding`은 case 파일의 그 정수를 가장
  가까운 double로 읽었다. 이제 바인딩은 i64 범위의 `bigint`를 받고 `bigint`를 주며, `binding`은 안전 정수 밖의 정수를
  `bigint`로 읽는다(GN-12a). 이름이 lint 규칙에 걸리는 메서드(`from_end`)는 Python과 PHP crate에서 clippy를 통과하지
  못했고, bool field는 필요 없는 borrow로 WASM 변환에 갔다. 이제 메서드는 언어 이름을 attribute로 단 Rust 이름
  `member_<name>`을 갖고, scalar field는 값으로 넘긴다(GN-6l). `tests/e2e/shapes`는 이 꼴을 위한 member
  `shapes.measure`, `shapes.negate`, `buffer.from_end`를 갖는다. `packages/ts`의 `npm test`와 `tests/e2e/shapes`의
  `make e2e`로 확인했다.
- case는 값 타입의 값을 단계마다 한 번 중첩된 JSON으로만 줄 수 있어서, JSON reader의 기본 한도(PHP 512, serde_json
  128)보다 깊은 값을 적을 수 없었고 그런 값만 일으키는 kind는 case가 없었다(CK-22). 이제 case는 그것을
  `{"kind": "list", "repeat": <n>, "value": <값>}`로 주고, 각 시험은 그것을 loop로 만든다(G-5). 내장 꼴의 표는
  `keyed_map`의 Go 타입을 적지 않아서, Go에 `*KeyedMap[T]`가 있는데도(GN-15) 계약 검사가 Go에 내장 keyed_map 값이
  없다고 지적했다(CK-8). 이제 표는 `*KeyedMap[any]`를 적는다. `packages/ts`의 `npm test`로 확인했다.
- JSON 텍스트는 올바른 꼴의 텍스트만 담으므로 case는 올바른 꼴이 아닌 텍스트를 줄 수 없었고, 그런 텍스트만 일으키는 kind는
  case가 없었다(CK-22). 이제 case는 그것을 `{"ill_formed": "<텍스트>"}`로 준다: 그 텍스트와 Python·Node·WASM에서는 짝 없는
  surrogate, PHP·Go에서는 바이트 0xFF다(G-5). `packages/ts`의 `npm test`로 확인했다.
- `tests/e2e/consumer`에는 WASM의 계약 case runner가 없었다. 그래서 Node는 계약 case도 실행했지만, end-to-end 실행은 다른
  레포의 값 alias와 callback을 WASM에서 생성 시험으로만 확인했다. `tests/e2e/consumer/cases.wasm.test.mjs`가 같은 case를
  subpath `./wasm`으로 실행한다. `DEPS=tests/e2e/sample`과 함께 `tests/e2e/consumer`의 `make e2e`로 확인했다.
- 생성기는 값 alias(U-7), 다른 레포의 값 alias, `in_raises`가 있는 alias, callback unit(U-3)을 가진 계약의 WASM 바인딩을
  거부했다. 그래서 `tests/e2e/sample`과 `tests/e2e/consumer`는 무엇을 빌드하기도 전에 WASM에서 실패했다. 이제 WASM 모듈은
  JavaScript 값을 Node의 규칙대로 `HostValue`로 기술하고 코어 값을 alias의 `out` 행으로 만든다(GN-18b). 기술 중 값의 코드를
  실행할 수 있는 JavaScript 연산은 모두 `catch`로 불러 그 예외를 그대로 다시 던지며, 예외가 모듈을 거쳐 unwind하지 않는다.
  alias의 `in` 함수는 이제 WASM crate도 갖는 feature `codec-test`의 `__aliasIn<Alias>`로 따로 실행하고, callback은 JavaScript
  객체 위의 struct로 생성하며 그 예외는 같은 객체로 호출자에게 닿는다(GN-18c). 생성한 WASM 시험은 K-2 시험, case의 callback
  fixture, alias의 U-7 시험을 가진다(GN-13c). `packages/ts`에서 `npm test`로 확인했다.
- `tests/e2e/shapes`와 `tests/e2e/sample`의 코어는 길이와 index를 `as`로 변환했는데, 이제 그 workspace가 가진 R-1의 lint가
  이를 금하므로 코어의 lint가 모든 target을 실패시켰다. 길이는 변환의 이유를 단 함수 하나로 넓히고, index는
  `usize::try_from`으로 변환하며, data 값의 정수는 U-7의 이유를 단 가장 가까운 float다.
- 다른 라이브러리의 실패 주입점(`<library>.<id>`)을 장전하는 case는, `fault-test`가 자기 코어의 feature만 켜는 바인딩
  crate에서 돌았다. 그래서 다른 코어의 지점이 컴파일되지 않아 case가 그것을 장전하지 못했고, `binding check`는 그
  manifest를 지적하지 않았다. 이제 `binding scaffold`는 case 파일이 장전하는 지점의 라이브러리를 읽어 각각의
  `polyspec-<library>/fault-test`를 그 코어에 대한 의존과 함께 `fault-test`에 적고, 코어가 의존하지 않는 라이브러리는
  그 이름을 대고 멈추며, `binding check`는 manifest를 그것과 비교한다(GN-5, CK-19). e2e 실행은 각 바인딩 crate를 그
  manifest의 feature로 빌드한다. `packages/ts`의 `npm test`로 확인했다.
- `core.features.wasm`이 플랫폼 I/O의 feature(`fs`, `blocking-io`, `process`, `net`)를 적은 계약은 계약 검사를
  통과했고, 그 WASM 빌드는 나중에 실패하거나 브라우저에 없는 I/O를 빌드했다. 이제 `binding check`가 그것을 지적하고
  (CK-63), 코어에서 그 feature의 꼴은 명세의 행이다(GN-4b). `packages/ts`의 `npm test`로 확인했다.
- 매개변수 없는 member의 Python 인자 수 시험(G-7)은 매개변수가 있는 함수의 문구를 기대했는데, CPython은 인자 없는 함수에
  그 문구를 주지 않는다. 또 WASM은 아무것도 돌려주지 않는 fallible member의 unit 결과를 변수에 묶었고 lint가 이를 금한다.
  이제 시험은 그 자리에서 "takes no arguments"와 "takes no keyword arguments"를 기대하고, WASM은 그런 member의 오류만
  돌려준다. `tests/e2e/classes`의 `make e2e`로 확인했다.
- 생성기는 host Node 패키지의 WASM 바인딩을 거부했고, host 패키지의 생성 Node 시험은 host 코드인 패키지 자신의 진입점을
  import했으며, e2e 실행은 기본 배치의 경로에서 `packages/rust/interface.json`만 읽었다. 이제 host Node 패키지의 WASM
  crate는 `native/wasm/`이고, host 패키지의 시험은 옆의 생성 진입점을 import하며, `binding check`는 host의 `files`에 WASM
  module을 요구하고(GN-3b), 실행은 레포의 모든 계약, 곧 `packages/rust`와 `packages/<component>/rust`를 각자의 배치에서
  받는다(GN-14e). `packages/ts`의 `npm test`와 `tests/e2e/classes`의 `make e2e`로 확인했다.
- scaffold는 바인딩 manifest마다 자기 `[lints]` 표를 썼고, 패키지가 workspace의 lint를 받아야 하는
  저장소(`lints.workspace = true`)는 그 manifest를 거부했다. 이제 바인딩 manifest는 `lints.workspace = true`를 쓰므로
  workspace 표가 코어와 바인딩의 R-1 lint를 정하고, 한 crate의 예외는 이유를 단 그 소스의 attribute다(GN-4).
  `tests/e2e`의 workspace는 R-1의 lint를 갖는다. `packages/ts`의 `npm test`로 확인했다.
- e2e 실행은 receiver를 인스턴스 값(GN-13f)으로 주거나 인자가 그 타입의 모양이 아닌 raise case를 빼고 끝에서야
  실패했다. 그래서 classes 계약이 CK-22로 실패했다. 이제 저장소의 모든 case가 실행되고, target이 쓸 수 없는 case는 그
  target의 거부다. scaffold는 host Node 패키지의 WASM crate(`packages/ts/native/wasm`)의 core 경로를 한 단계 모자란
  `../../rust`로 썼고, WASM과 Go crate는 계약이 타입을 부르는 다른 라이브러리의 core에 의존하지 않았다. 이제 각 바인딩
  crate는 그 core들을 core 아래 자기 깊이만큼 올라간 경로로 부른다(L-2a, T-3). `packages/ts`의 `npm test`로 확인했다.
- case는 메서드의 receiver를 그 class의 생성자나 static member로만 만들 수 있어서, 앞선 호출이 만든 receiver만 닿는 kind는
  case가 없었고 `binding check`가 계약을 거부했다(CK-22). 이제 case는 receiver를 인스턴스 값으로 준다: 그것을 만드는
  member(`new`), 또는 결과가 그것을 담는 member와 거기에 닿는 단계(`from`, `pick`), 그 member의 receiver, 인자, 그것을
  준비하는 호출(`then`). 모든 target은 그 인스턴스를 시험의 지역 변수로 만들고, `binding check`는 형식을 어기는 값을
  지적한다(GN-13f, CK-22). WASM은 record의 optional field를 컴파일러가 타입을 추론하지 못하는 일반 변환으로 썼는데, 이제
  그 자리에서 optional을 match한다. `packages/ts`의 `npm test`와 `tests/e2e/classes`의 `make e2e`로 확인했다.
- WASM은 실패 주입점이 있는 계약과 다른 레포의 record를 거부했다. 이제 WASM crate는 진입점 `__armFaults`, `__faultLeft`를
  가진 feature `fault-test`를 갖고, 코어 호출마다 시험이 장전한 실패를 안고 실행하며, `faults`를 가진 case의 B-4 시험이 그것을
  장전한다. 다른 레포의 record는 그 주인의 코어를 거쳐 변환하는 plain object이고, crate는 그 코어에 의존한다(GN-5, GN-6c).
  `packages/ts`의 `npm test`와 `make e2e`로 확인했다.
- `binding generate`는 한 target이 항목 하나를 거부하면 아무것도 쓰지 않아, Go가 아직 받지 못하는 계약은 어느 target의
  바인딩도 내지 않았다. 이제 target마다 따로 생성해, 아무것도 거부하지 않은 target은 모두 쓰고, 거부된 target은 그 항목과
  함께 이름한 뒤 상태 2로 실패한다(GN-1c). `packages/ts`의 `npm test`로 확인했다.
- `tests/e2e/sample`의 값 alias `data`는 target Go와 WASM을 선언했지만 out 행이 Go 값과 WASM 값을 만들지 않고 그 값을 분류하는 in 행도 없어, `binding
  check`가 `tests/e2e/sample`과 `tests/e2e/consumer`의 모든 target을 실패시켰다(CK-8). 이제 각 out 행이 그 kind의 Go 값과
  WASM 값을 만들고, in 행이 그 값을 분류한다. `packages/ts`의 `npm test`와 `make e2e`로 확인했다.
- 생성한 시험은 실패하는 contract case만 실행하고 결과를 비교하지 않았다. 실패하지 않는 case만 가진 member는 어느 시험도
  부르지 않았다. 이제 모든 target이 그런 case를 하나씩 실행해 결과를 case의 값과 비교한다. 그 값의 키는 `cases` 행의 새
  `result`이거나 `result`이며, 결과에 case 형식이 없는 case는 이름을 대고 시험이 실패한다(GN-13e, CK-22). `packages/ts`의
  `npm test`로 확인했다.
- WASM이 parameter의 타입 `source`, `bytes`, parameter와 record field의 기본값, 오류 unit, receiver `&mut self`인 member를
  생성한다: lock이 있는 class의 표는 그 값을 lock에 담고, 호출의 자리마다 그 guard를 잡는다(GN-6h, GN-6i, GN-6j, GN-7a,
  GN-18, GN-18a). 모든 바인딩 crate가 `binding_core`의 feature `lock`을 켠다. WASM 시험은 Node 시험처럼 기본값, source,
  오류 unit의 정확한 클래스를 확인한다(GN-13d). `packages/ts`의 `npm test`와 `tests/e2e/shapes`의 `make e2e`로 확인했다.
- Go C ABI crate의 진입 `src/lib.rs`가 allow 속성을 125자 한 줄로 써서 레포의 `cargo fmt --all --check`가 거부했다.
  `binding scaffold`는 allow 속성마다 rustfmt의 꼴로 쓴다(GN-3a). `packages/ts`의 `npm test`로 확인했다.
