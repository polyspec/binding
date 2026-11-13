<!-- doc-id: changelog -->
# 변경 기록

[English](CHANGELOG.md)

## Unreleased

- class unit `lease`(GN-6p)를 넣은 뒤 `tests/e2e/classes`의 e2e가 세 target에서 실패했다. Python: 실패한 호출이 임시 값으로
  남긴 `Lease`가 그 호출의 `TypeError`가 설정된 채 경고해서 호출이 `SystemError`로 끝났다. 이제 소멸자는 그 예외를 맡아
  두었다가 경고 뒤에 다시 설정한다. PHP: PHP가 메시지 앞에 실행 중인 함수를 붙이므로 경고는 `<function>(): Lease was
  destroyed …`이다. 그래서 B-10 시험은 그 글로 끝나는 메시지를 요구한다. Go: B-5c의 poison entry point가 `held_lease`를
  불렀는데, 그것을 쓰는 것이 그 시험 entry뿐이라 helper 묶음이 그것을 뺐다. 이제 그 helper를 남긴다.
- parameter나 receiver가 언어 코드를 지니는 `wait: blocking_io` member를 모든 target이 거부했다("a member with wait
  blocking_io that reaches language code is not generated (GN-6m)"). 그래서 host loader를 쓰는 template engine의
  `engine.load`, `prepare`, `prepare_bound`에 바인딩이 없었다. 이제 PHP와 Python은 GN-6m대로 생성한다. Python
  callback의 각 호출은 코어가 그것을 부르는 스레드에서 kind `wrong_thread` 검사 없이 GIL을 얻으므로, `a<name>`의 worker
  스레드에서도 callback이 실행된다. Node는 callback 객체를 가진 JavaScript 스레드에서 호출을 동기로 실행하고 정해진
  promise를 돌려준다. 언어 코드에 닿는 `async_driver` member는 계속 이름을 대고 거부한다. `tests/e2e/sample`의
  `sample.resolve_slowly`가 이것을 다루고, 예외를 던지는 callback으로 `aresolve_slowly`를 기다리는 Python 시험이 있다
  (GN-6q).
- 코어 receiver가 `self`인 method와 `cleanup`이 있는 class unit은 모든 target이 거부했다("a receiver self is not
  generated yet", "cleanup is not generated yet"). 그래서 닫는 호출이 소비하는 자원에는 binding이 없었다. 이제 PHP·Python·
  Node는 class의 잠금에서 값을 꺼내고(`Exclusive`와 `Shared`의 `take`, 객체는 그 뒤 kind `consumed`다, GN-6o), `cleanup`이
  있는 unit의 코어 타입은 `binding_core::Cleanup`을 구현하고 다른 class unit의 것은 구현하지 않는다는 것을 단언하며,
  객체가 정리 호출 없이 사라지면 경고한다. 경고는 `E_WARNING`, `ResourceWarning`, type `ResourceWarning`인
  `process.emitWarning`이다(GN-6p, B-10). 생성 시험은 호출 뒤의 kind `consumed`와 경고를 요구한다. Go와 WASM은 그런
  member와 unit을 이름을 대고 거부한다. `make check`로 확인했다.
- 8d9ed8c에서 `tests/e2e/classes`의 end-to-end 검사가 Python에서 실패했다. `a<name>`이 인자 tuple을 이어 붙인
  iterator로 만들었는데, `PyTuple::new`는 크기가 정확한 것만 받기 때문이다. Node와 WASM에서도 실패했다. 기다리는 member의
  결과 변환이 함수를 부르기만 하는 closure였고, clippy가 이것을 거부하기 때문이다(`redundant_closure`). 이제 Python은
  vector로 tuple을 만들고, Node는 함수 자체를 넘긴다(GN-6m, GN-6n). `tests/e2e/classes`의 `make e2e`로 확인했다.
- fsm의 Go C ABI가 컴파일되지 않았다(E0283, type annotations needed): `out_optional`이 `impl Into<Option<T>>`를 받았는데,
  error unit의 optional property인 `Option<i64>`와 optional text field인 `&Option<String>`이 두 타입 `T`에 맞아서 제네릭
  `out_int`과 `out_text`가 `T`를 정하지 못했다. 이제 `out_optional`은 PHP, Python, Node처럼 코어 값의 `as_ref`를 받는
  `Option<T>`를 받는다(GN-16). `packages/ts`의 `npm test`로 확인했다: 280개 중 280개 통과.
- Go tuple parameter 시험이 `uint` 부분에 `in_uint`을 요구했지만, GN-12a는 `uint` 부분을 `in_safe_uint`로 안전 정수에
  묶는다. 이제 시험은 `in_safe_uint`를 요구한다. `packages/ts`의 `npm test`로 확인했다: 277개 중 277개 통과.
- 같은 `keyed_map` 정수 key가 두 결과를 냈다: Node와 WASM은 안전 정수가 아닌 number key를 `invalid_argument_type`으로
  거부했고, PHP, Python, Go는 i64 범위의 key를 다 받았다. 이제 모든 target에서 나열된 `int`의 key는 안전 정수이고, 그 밖의
  key는 kind `invalid_number`다(GN-12a). 계약이 나열하지 않은 종류의 key는 그대로 `invalid_argument_type`이고, 그 종류를
  먼저 판정한다. 생성 시험은 모든 target에서 key 2^53을 준다(GN-13, GN-13b). `packages/ts`의 `npm test`로 확인했다:
  269개 통과, 실패 7개는 이 변경이 건드리지 않는 GN-6m(wait `blocking_io`)의 시험이다.
- PHP와 Python은 `int` 인자를 i64 범위로, Go C ABI는 어떤 `int64`든 받아서, `int`에 9223372036854775807을 주는 계약
  case가 Node에서는 `invalid_number`, PHP와 Python에서는 core의 오류를 냈다. 이제 모든 target에서 바인딩이 받는 모든 자리
  (인자, 항목, field)에서 `int`는 안전 정수, `uint`는 0~2^53 - 1이고, 그 밖의 정수는 kind `invalid_number`다(GN-12a).
  `int64`와 `keyed_map`의 key는 i64 범위를 유지한다(`in_int64`). B-2의 생성 시험은 PHP, Python, Go에서 2^53과 -2^53을
  준다(GN-13, GN-13b). `packages/ts`의 `npm test`로 확인했다: 268개 통과, 실패 7개는 이 변경이 건드리지 않는 GN-6m(wait
  `blocking_io`)의 시험이다.
- `wait: async_driver`인 member는 모든 target이 거부했다("wait async_driver is not generated yet"). 그래서 tokio 위의
  코어가 가진 `async fn` member에는 binding이 없었다. 이제 생성기는 그런 member의 future를 tokio runtime에서 돌린다
  (GN-6n). PHP는 `binding_core::driver::block_on`에서 막히고, Python은 그것을 `py.detach`에서 돌리며 `a<name>`을 더하고,
  Node는 napi의 runtime(`tokio_rt`)에서 `Env::spawn_future_with_callback`의 `Promise`를 돌려준다. future는 바꾼 인자와
  guard를 가지고, fault는 poll마다 설치되며(`fault::Armed::around`), poll의 panic은 kind `internal`이다
  (`driver::Caught`). Go와 WASM은 그런 member를 이름을 대고 거부한다. binding_core에 새 feature `driver`가 있다.
  `make check`로 확인했다.
- `wait: blocking_io`인 member는 모든 target이 거부했다("wait blocking_io is not generated yet"). 그래서
  `tests/e2e/classes`의 `classes.read`와 `gate.enter_slowly`에는 binding이 없었다. 이제 생성기는 코어에
  `binding_core::Io::for_generated_call()`을 넘기고 언어마다 자기 꼴로 기다린다(GN-6m). PHP는 호출 스레드를 막는다.
  Python은 코어 호출을 `py.detach`에서 돌리고 `asyncio.to_thread` 위의 awaitable `a<name>`을 더한다. Node는 작업을
  `ScopedTask`로 libuv 풀에서 돌리는 `Promise`를 돌려주고, 그 진입은 async 함수라서 모든 실패가 promise를 거부한다.
  Go는 그런 member를 이름을 대고 거부하고, 기다리는 constructor·property·iterate·hook도 이름을 대고 거부한다. CK-16은
  Python의 예약어인 awaitable 이름도 보고한다. `make test-ts`로 확인했다.
- fault injection point가 있는 계약의 Go C ABI는 남은 point를 closure `|output, item| out_text(output, item)`로
  주어서, `polyspec-sample-go`의 `cargo clippy -D warnings`가 `redundant_closure`로 실패했고 `tests/e2e/sample`의 Go
  target은 시험을 하나도 돌리지 않았다. 이제 entry는 `out_text` 자체를 넘긴다. `packages/ts`의 `npm test`와 sample
  Go crate의 시험 feature를 켠 `cargo clippy`로 확인했다.
- 다른 레포 record의 Go 거부는 Go가 그것을 어떻게 생성할지 적은 행을 이름하지 않았다. 이제 GN-15f가 그 설계를
  적는다. `binding scaffold`가 코어의 의존 줄에 따라 그 레포의 Go module을 `go.mod`에 적는 설계이며, 아직 구현하지
  않았다고 표시한다. 거부는 GN-15f를 이름한다. `packages/ts`의 `npm test`로 확인했다.
- 생성기는 다른 module의 class·callback unit을 이름하는 member의 Go 바인딩을 "a class unit of the module tags in the
  module (the root) is not generated for Go yet"로 거부했다. 이제 Go는 그런 unit에 그 module 패키지의 `<Class>Handle`,
  `<Class>FromHandle`, `Dispatch<Callback>`으로 닿는다. 그 첫 parameter `binding.Token`은 Go module의 패키지만
  이름할 수 있다. 패키지는 다른 module이 이름하는 unit에만 그 함수를 두고, CK-13은 그 이름을 세며, 계약의 패키지
  이름과 같은 parameter는 끝에 `_`를 붙이고, 시험은 다른 module의 생성자를 패키지 이름으로 부르며, 패키지가 서로
  import하게 될 module은 이름으로 거부한다(GN-15a). `packages/ts`의 `npm test`와, class와 callback을 다른 두
  module에 둔 sample의 생성 패키지의 `gofmt`, `go vet`으로 확인했다.
- 생성기는 Go `out` 행이 `"go": "tag.new"`처럼 member로 값을 만드는 값 alias의 Go 바인딩을 "a Go make by a member
  (tag.new) is not generated yet (U-7)"로 거부했다. 이제 Go는 그런 값을 class의 인스턴스로 준다. C ABI는 계약 안
  class의 번호와 값의 handle을 적고, `internal/binding`의 `Reader.ValueWith`가 그것을 읽으며, class 패키지의
  `aliasInstance`가 인스턴스를 만든다. 그 값을 주는 다른 module의 member는 이름으로 거부한다(GN-15c). `packages/ts`의
  `npm test`와 생성된 패키지의 `gofmt`, `go vet`으로 확인했다.
- 생성기는 member `to_json`이 있는 class의 Go 바인딩을 거부해서, `tests/e2e/sample`과 `tests/e2e/classes`의
  `tag.to_json`은 PHP와 Node만 이름하고 Go 바인딩에는 JSON 꼴이 없었다. 이제 Go는 to_json을 내보내지 않은 `toJSON`
  위의 `json.Marshaler`의 `MarshalJSON`으로 준다. 이것은 코어의 값을 `encoding/json`으로 marshal하고 코어의 오류를
  돌려준다. `never`를 돌려주는 to_json은 오류만 돌려주고, B-4 시험은 `toJSON`을 부른다(GN-15a). 두 계약은
  `tag.to_json`에 Go를 이름한다. `packages/ts`의 `npm test`와 생성된 패키지의 `gofmt`, `go vet`으로 확인했다.
- 생성기는 다른 타입 안에 부분 타입이 서로 다른 tuple이 있거나 tuple parameter가 있는 계약의 Go 바인딩을 거부해서,
  `words.split`이 text와 uint의 tuple list를 돌려주는 fixture에 Go 바인딩이 없었다. 이제 Go는 그런 tuple을
  `Tuple<N>[T0, ...]`로 준다. 이것은 field `P0`~`P<N-1>`을 가진 `internal/binding`의 generic struct이며 패키지가 별칭으로
  쓴다. 부분 타입이 하나인 tuple은 `[N]T`를 유지하고, tuple 인자는 부분마다 읽는다(GN-16). `packages/ts`의 `npm test`와
  생성된 패키지의 `go vet`으로 확인했다.
- Go 시험은 `then`의 호출에 `"raises": {"kind": <kind>}`가 있는 case의 인스턴스를 만들 때 그 호출이 성공하기를 요구해서,
  `tests/e2e/classes`의 `TestB4GateEnterAGateClosedTwiceLetsNothingPass`가 case가 기대하는 실패인 "the gate of a is
  closed"로 실패했다. 이제 Go 시험은 다른 target처럼 그 호출의 kind를 요구하고 다음 단계로 넘어간다(GN-13f).
  `packages/ts`의 `npm test`로 확인했다.
- CI와 release workflow 파일, 그리고 `config/release.json`은 GN-14b의 어느 목록에도 없었다. 그래서 이 파일들을 더한 뒤 종단 실행의
  입력 시험이 실패했다. 이제 이 파일들은 실행이 읽지 않는 파일로 각각 이유와 함께 목록에 있다(GN-14b).
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
