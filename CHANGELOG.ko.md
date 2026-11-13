<!-- doc-id: changelog -->
<!-- source-sha256: 95696a2afcda2e9fc60385ff4495dcd7ee10763becdc5b966f2340ead819983f -->
# 변경 기록

[English](CHANGELOG.md)

## Unreleased

- `tests/e2e/plot`과 `tests/e2e/consumer`의 WASM crate는 컴파일되지 않았고, WASM에서의 첫 `make e2e`가 그것을 보였다.
  crate는 함수나 helper가 `Array`를 이름할 때만 그것을 import했는데, 모든 crate의 오류는 `Array::of4`를 부른다. 그래서
  list가 없는 plot의 crate는 `cannot find type Array`로 실패했다. `async fn`인 helper `caught`는 이름 없는 항목으로
  읽혀 모든 crate에 남았다. 그래서 기다리는 member가 없는 consumer의 crate는 `function caught is never used`로
  실패했다. 이제 crate는 `Array`를 항상 import하고, `async fn`으로 시작하는 helper는 코드가 이름하는 곳에만 남는다.
  `packages/ts`의 `npm test`로 검증했다. 그 테스트는 두 crate를 생성한다. 이 변경에 대해 crate를 다시 컴파일하지 않았다.
- Python crate의 `Raised` 값의 scope는 `std::cell::RefCell`을 경로로 이름했는데, crate는 본문이 `RefCell`을 이름하는
  곳마다 그것을 import한다. 그래서 class가 없는 계약의 crate는 쓰지 않는 import를 가졌고 lint가 그것을 거부했다.
  `tests/e2e/consumer`의 `make e2e`가 Python crate의 lint에서 `unused import: std::cell::RefCell`로 실패했다. 이제 scope는
  `RefCell`을 import로 이름한다. `packages/ts`의 `npm test`로 검증했다. 그 테스트는 consumer의 Python crate를 생성한다.
  이 변경에 대해 crate를 다시 컴파일하지 않았다.
- WASM crate의 `Driven` 객체의 `advance`는 작업을 `shielded` 밖에서 돌렸다. 그래서 언어 코드가 다른 member의 호출
  안에서 하는 advance는 시험이 그 member에 장전한 fault를 보았다. Node crate는 그것을 shield했다. 이제 WASM crate도
  shield한다(GN-8a). fault 진입의 테스트는 장전 호출의 수와 shield의 수만 비교했다. 새 테스트는 sample의 WASM crate를
  진입마다 읽고, member의 각 진입이 guard 하나, shield 하나, 장전 하나(`with_faults` 또는 `armed_future`)를 갖고
  `advance`는 shield 하나를 갖고 장전은 없기를 요구한다. `packages/ts`의 `npm test`로 검증했다. 이 변경에 대해 생성된
  crate는 컴파일하지 않았다.
- WASM crate의 class의 member의 진입은 `class_<unit>_<member>`였고, 이 이름은 두 가지로 읽힌다. class `a`의 member
  `new_x`와 class `a_new`의 member `x`가 둘 다 `class_a_new_x`였고, member `free`는 class의 해제처럼
  `class_<unit>_free`와 export `__<Class>_free`였다. 이제 진입은 export의 module 안의 module `class_<unit>`의 함수
  `member_<member>`이고, 해제는 `free_<unit>`과 export `__free_<Class>`다(GN-4c). member의 export는 이름을 유지한다.
  `packages/ts`의 `npm test`로 검증했다. 그 테스트는 두 class와 member `free`, `guard`를 가진 sample의 WASM crate를
  생성하고, 어느 module도 함수를 두 번 정의하지 않고 어느 export도 다른 export의 이름을 갖지 않기를 요구한다. 같은 계약은
  Go crate에 C 심볼 `polyspec_sample_tag_new_x`를 두 번 주며, 이것은 고치지 않았다(task B2.86-3). 이 변경에 대해 생성된
  crate는 컴파일하지 않았다.
- 다른 레포의 unit의 변환은 `in_<library>_<name>`이었고, 이 이름은 두 가지로 읽힌다. 라이브러리 `c`의 record `a_b`와
  라이브러리 `c_a`의 record `b`가 둘 다 `in_c_a_b`여서 한 함수의 두 정의였고, 자체 unit `c_a_b`가 세 번째였다. 이제 다른
  레포의 unit의 변환(`in_`, `out_`, 그리고 value alias의 `make_`)은 crate의 module `library_<library>`의 함수이고, 코드는
  경로 `library_<library>::in_<name>`으로 부른다(GN-4c). 생성기의 helper 하나가 모든 사용처에 그 이름을 준다. module의
  이름은 `<library>`만으로 하지 않는다. `std`라는 라이브러리가 생성된 crate 전체에서 crate `std`를 가리기 때문이다.
  변환만 부르는 closure는 경로로 불러도 그 변환 자체이고, 다른 라이브러리의 alias를 주는 Node callback은 자기 환경을
  유지한다. `packages/ts`의 `npm test`로 검증했다. 그 테스트는 라이브러리 `c`의 record `a_b`, 라이브러리 `c_a`의 record
  `b`, 자체 record `c_a_b`를 가진 계약의 다섯 crate를 생성하고, 어느 module도 함수를 두 번 정의하지 않기를 요구한다. 이
  변경에 대해 생성된 crate는 컴파일하지 않았다.
- 코어가 drop하고 반환하지 않은 `Raised`는 PHP, Python, Go crate의 table에 던져진 것을 남겼다. Node와 WASM crate만 그것을
  해제했기 때문이다. 이제 세 crate의 모든 진입점의 `guard`가 자기 스레드의 scope를 열고, `Raised`를 만드는 함수가 그
  handle을 가장 안쪽 scope에 기록하며, 진입점은 반환할 때 아무도 가져가지 않은 것을 table에서 제거한다(GN-6ae). PHP는
  table을 놓은 뒤에, Python은 GIL과 함께 drop한다. 세 crate의 machine은 한 진입점 안에서 돌므로, 두 진입점 사이에
  handle을 보관하는 객체는 없다. 진입점의 스레드가 아닌 스레드에서 만들어진 `Raised`는 어느 scope에도 기록되지 않아
  아직 해제되지 않는다(G-4). `packages/ts`의 `npm test`로 검증했다. 그 테스트는 세 crate에 scope, 기록, 해제가 있고
  table이 없는 crate에는 그 어느 것도 없기를 요구한다. 이 변경에 대해 생성된 crate는 컴파일하지 않았다.
- functions unit의 함수의 진입에는 이름이 둘 있었다. PHP와 Python crate에서는 `function_<name>`, Node와 WASM crate에서는
  `entry_<member>`였고, Node와 WASM의 함수 parameter의 helper `function_in`은 앞의 접두로 시작했다. Node와 WASM crate는 이제
  진입을 `function_<name>`, helper를 `callable_in`으로 이름하므로 GN-4c는 다섯 crate에 한 규칙을 적는다. Node와 WASM lane을
  병합했고, 어떤 target도 함수 타입의 parameter나 결과 `passthrough`가 있는 member를 거부하지 않는다. `packages/ts`의
  `npm test`로 검증했고 실패 없이 통과한다. 그 시험은 `guard`, `pass`, `called`, `throw`, `internal`, `in`이라는 함수가 있는
  Node와 WASM crate를 생성하고 어떤 함수도 두 번 정의되지 않을 것과 어떤 helper도 `function_`으로 시작하지 않을 것을
  요구한다. 이 변경으로 생성된 crate를 컴파일하지는 않았다.
- end-to-end sample에는 함수 parameter가 method에만 있어서, 함수를 받는 functions unit의 함수와 static member의 진입은
  생성되기만 하고 컴파일된 적이 없었다. sample에 이제 함수 `scoped`와 static member `store.once`가 있고, 각각 돌려주는
  case, 던지는 case, 기다리는 case를 가진다(GN-6ae). `tests/e2e/sample`의 `make e2e`로 검증했다: PHP는 생성된 시험 98개,
  Python은 100개, Go는 77개를 통과하고 실패와 skip은 없으며 각 lint는 깨끗하다. Node와 WASM은 거기서 그 거부로 실패한다.
- Go callback의 method의 panic은 static library의 frame을 지나 unwind했고, 코어의 destructor를 건너뛰었다. member가 빌린
  인스턴스는 잠긴 채 남았고, 그 뒤 그것을 쓰는 member는 kind `busy`로 실패했다. 이제 호출(`Call.run`)이 모든 Go callback과
  모든 Go `func`의 panic을 recover하고 그 값을 호출의 error로 쥐며, member는 C ABI 호출이 돌아온 뒤 같은 값으로
  panic한다(GN-15b). `func`의 dispatch는 더는 따로 recover하지 않는다. callback을 받는 member의 Go 시험은 호출자가 panic의
  값을 받을 것, member가 같은 인스턴스에서 다시 돌 것, 그 인스턴스를 쓰는 member가 `busy`가 아닐 것을 요구한다.
  `packages/ts`의 `npm test`와 `tests/e2e/sample`의 `make e2e`로 검증했다: 변경 전에 `ledger.known`의 Go 시험은 "the
  panic of the callback left ledger.note busy"로 실패했고, 변경 후 Go 시험 77개가 통과한다.
- Go lane을 병합했다: 함수 타입의 parameter와 결과 `passthrough`의 거부는 Node와 WASM만 이름하고, GN-4c는 Go crate의 진입의
  계열, 곧 C symbol `polyspec_<library>_<module>_<member>`를 적으며 어떤 helper도 그것으로 시작하지 않는다. helper와 이름이
  같은 함수의 시험은 Go crate도 생성한다. 함수 이름은 `pass`, `guard`, `raised`, `held`, `lock`, `taken`, `thrown`,
  `called`이고, 두 번 정의된 함수를 찾지 못한다. `packages/ts`의 `npm test`로 검증했고, 모든 target으로 sample을 생성하는
  시험 20개는 Node와 WASM의 거부로 아직 실패한다. `tests/e2e/sample`의 `make e2e`로도 검증했다. sample이 커지기 전에 PHP는
  생성된 시험 88개, Python은 88개, Go는 61개를 통과했다.
- library `core`, `binding`, `failure`, `library`를 이름하는 계약의 생성된 crate는 컴파일되지 않았다. 그 library의 오류의
  helper `<library>_error`와 `<library>_failure_error`가 helper `core_error`, `binding_error`, `failure_error`,
  `library_error`의 이름을 가졌기 때문이다. 이제 다섯 crate에서 `error_of_<library>`와 `failure_of_<library>`이고, 이
  둘은 어떤 helper도 시작하지 않는 GN-4c의 계열이다. `packages/ts`의 `npm test`로 검증했다. 그 시험은 그런 library마다 그
  값 alias를 받는 계약의 crate를 생성하고 crate의 어떤 함수도 두 번 정의되지 않을 것을 요구한다. 변경 전에 그 시험은 Go
  crate에서 `core_error`의 정의 둘을 찾았다. 이 변경으로 생성된 crate를 컴파일하지는 않았다.
- sample의 `scope`처럼 class가 함수 parameter의 인자로만 쓰이는 계약의 Python crate는 clippy를 통과하지 못했다. 함수
  타입의 parameter를 들어오는 값으로 읽어서, 아무도 부르지 않는 변환 `in_<class>`가 crate에 있었기 때문이다. 그
  parameter는 함수로 나가는 값이므로 이제 함수 타입이 돌려주는 것만 들어오는 값으로 세고, 그 변환은 쓰지 않는다.
  sample의 `make e2e`에서 찾았다. Python crate의 clippy가 "function `in_scope` is never used"로 실패했다.
  `packages/ts`의 `npm test`로 검증했고, Python crate의 시험은 `in_scope`가 없을 것을 요구한다.
- `pass`, `guard`, `raised`처럼 crate의 helper와 이름이 같은 함수가 있는 계약의 PHP와 Python crate는 컴파일되지 않았다.
  functions unit의 함수의 진입이 함수의 이름을 그대로 가졌고 helper도 그 이름이었기 때문이다. 진입은 이제
  `function_<name>`이고 언어의 이름은 attribute가 준다. event loop를 받는 Python 진입은 `loop_function_<name>`이고,
  helper `recognized_kind`는 `kind_of_recognized`다. 그래서 어떤 helper도 계약 이름의 계열의 접두로 시작하지 않는다
  (GN-4c). 값 alias와 함수 parameter가 함께 있는 계약의 Python crate는 helper `raised`도 두 번 정의했다. alias의 값을
  위해 한 번, 함수의 기다린 값을 위해 한 번이었다. 이제 한 번 정의한다. `packages/ts`의 `npm test`로 검증했다. 그
  시험은 `pass`, `guard`, `raised`라는 함수가 있는 PHP crate와 `guard`, `raised`, `driven`이 있는 Python crate를 생성하고
  crate의 어떤 함수도 두 번 정의되지 않을 것을 요구한다. 변경 전에 그 시험은 `pass`의 정의 둘을 찾았다. sample의
  `make e2e`로도 검증했다. PHP와 Python crate는 clippy를 통과하고 생성된 시험은 각각 88개가 통과한다.
- Python은 함수 타입의 parameter나 결과 `passthrough`가 있는 member를 이름을 대고 거부했다. Python binding은 이제 그것을
  생성한다. callable은 들어올 때 검사하고(kind `invalid_callback`), closure는 GIL을 쥐고 그것을 부르며 각 class 인자를 새
  인스턴스로 준다. 그것이 돌려준 값은 다시 주지 않는 handle 아래 thread-local table에 쥐고, member는 그 객체를 그대로
  돌려준다. 함수가 awaitable을 돌려줄 수 있는 member에는 진입 `_<name>_on_loop`가 있다. `a<name>`은 호출자의 돌고 있는
  event loop와 함께 그것을 asyncio의 스레드에서 돌리고, driver는 그 loop에서 `asyncio.run_coroutine_threadsafe`로
  awaitable을 기다린다. awaitable을 받은 `<name>`은 그것을 닫고 `a<name>`을 이름하는 message의 kind `invalid_callback`으로
  실패한다. Python 시험은 함수 fixture를 시험 module의 함수로, `awaits`가 있는 fixture를 coroutine 함수로 쓰고, step의
  결과, `raises: "callback"` case, `after`의 호출을 쓴다(GN-6ae, CK-22). `packages/ts`의 `npm test`로 검증했고 Python
  crate와 Python 시험의 시험은 통과한다. 모든 target으로 sample을 생성하는 시험은 Node, Go, WASM의 거부로 아직 실패한다.
  sample의 `make e2e`로도 검증했다. Python crate는 clippy를 통과하고 생성된 시험 88개가 unittest에서 통과하며,
  `store.transaction`의 case 다섯이 그 안에 있다. 그 실행은 Node, Go, WASM을 거부로 실패한 target으로 이름한다.
- 이름이 `text`, `list`이거나 helper의 다른 단어인 unit이 있는 계약의 생성된 Go crate는 컴파일되지 않았다. 변환
  `in_<unit>`이나 `out_<unit>`이 helper `in_<word>`나 `out_<word>`의 이름을 가졌기 때문이다. Go crate의 helper는 이제
  GN-4c가 적는 대로 방향을 끝에 적는다: `text_in`, `list_out`, `safe_int_in`, `tuple<N>_in`, `key_out`,
  `no_form_out`, `passed_out`. Go crate의 어떤 함수도 member의 이름을 갖지 않는다: 진입점은
  `<prefix>_<module>_<member>`다. `packages/ts`의 `npm test`로 검증했다. 그 시험은 enum `default`, `callable`,
  `text`가 있는 sample의 Go crate를 생성하고 각 변환의 정의가 하나이며 `in_<...>`이나 `out_<...>`이라는 이름의 다른
  함수가 없을 것을 요구한다. 변경 전에 그 시험은 `in_text`의 정의 둘을 찾았다.
- Go 바인딩은 함수 타입의 parameter나 결과 `passthrough`가 있는 member를 이름을 대고 거부했다. 이제 그것을 생성한다:
  parameter는 Go `func(<parameters>) (any, error)`이고 결과는 `any`다. `func`는 호출의 callback으로 들어가 export
  `<prefix>__go_callback`으로 member의 goroutine과 스레드에서 돌고, class 인자는 각각 새 인스턴스다. package
  `binding`은 `func`가 돌려준 것을 mutex 뒤의 table에 수인 handle로 쥐고, static library는 버려진 `Passthrough`의
  값을 export `<prefix>__go_release_passed`로 지우며, handle이 값을 가리키지 않는 결과는 kind `internal`이다.
  member는 `func`가 돌려준 error 값을 돌려주고, `func`의 panic은 static library의 frame을 지나 unwind하지 않도록
  dispatch가 recover하며, member가 같은 값으로 panic한다. Go 시험은 함수 fixture를 `func`로 쓴다. `result`를 적은
  step은 호출이 다른 값을 돌려주면 error를 돌려주고, 표시 `"awaits": true`는 아무것도 바꾸지 않는다. Go 시험은 또
  `raises: "callback"` case, `after`의 호출, nil `func`와 `func`의 error와 panic의 시험을 쓰며, `after`나 `raises:
  "callback"`이 있는 case를 더는 거부하지 않는다(GN-6ae, CK-22). `packages/ts`의 `npm test`로 검증했고 Go crate, package,
  시험의 시험 2개는 통과한다. 모든 target으로 sample을 생성하는 시험 20개는 아직 Python, Node, WASM의 거부로 실패한다.
  `tests/e2e/sample`의 `make e2e`로 검증했다: Go는 `go test`에서 생성된 시험 61개를 통과하고(`store.transaction`의
  case 다섯 개 포함) clippy, `gofmt -l`, `go vet`이 깨끗하며, PHP는 88개를 통과한다. Python, Node, WASM은 거기서 그
  거부로 실패한다.
- 코어가 반환하지 않고 drop한 `Raised`는 던져진 것을 Node와 WASM crate의 table `THROWN`에 스레드가 끝날 때까지 남겼다.
  `Raised`에 해제 함수가 없기 때문이다. 이제 규칙은 `Raised`를 만든 호출이 그것을 해제한다는 것이다. 각 진입점은 자기가
  도는 동안 만들어진 handle을 기록하고, 반환할 때 `failure_error`가 가져가지 않은 각 handle 아래의 던져진 것을 제거한다.
  machine은 자기 advance들의 handle을, 결과를 주거나 실패하는 advance까지, 또는 그 `Driven` 객체가 끝날 때까지
  보관한다(U-3, GN-6ae). PHP, Python, Go의 crate는 아직 이 규칙을 적용하지 않는다. `packages/ts`의 `npm test`로 검증했다.
  그 시험은 변경 전에 sample의 crate에서 table `RAISING`을 찾지 못했다. 생성된 시험은 그 table을 관찰하지 않으므로,
  end-to-end 실행은 crate가 컴파일되고 clippy를 통과하며 결과를 유지한다는 것만 보인다.
- Node crate의 machine이 소유하는 callback(`Owned<Callback>`)은 machine이 계속 진행하는 동안 예외를 환경에 pending으로
  남겼고, 같은 advance에서 뒤따르는 Node-API 호출, 예를 들어 다음 Io future의 promise를 만드는 호출이 실패할 수 있었다.
  이제 소유된 callback은 machine의 함수와 같이 예외를 환경에서 꺼내어 그 `Raised`의 handle 아래에 보관하고,
  `failure_error`가 같은 객체를 다시 던진다(GN-6ab). machine이 callback을 소유하고 함수를 받지 않는 crate도 이제 variant
  `Thrown::Held`, `Owned::boxed`, `thrown_again`을 가진다. `packages/ts`의 `npm test`로 검증했다. 그 시험은 변경 전에
  sample의 소유된 callback에서 `kept`를 찾지 못했다.
- 함수 parameter의 argument로만 쓰이는 class(`store.transaction`의 `scope`)가 있는 계약의 Node crate는 그 class의 들어오는
  변환 `in_<class>`를 썼고 아무도 그것을 호출하지 않는다. 그것은 dead code이고 `-D warnings`에서 빌드를 실패시킨다. 함수
  parameter의 argument는 언어 코드로 나가고 들어오지 않으므로, 들어오는 class를 찾는 검사는 이제 함수 타입을 읽지
  않는다(T-5, GN-6ae). sample의 생성 crate를 처음 컴파일하여 찾았다. `packages/ts`의 `npm test`로 검증했다. 그 시험은
  변경 전에 sample의 Node crate에서 `fn in_scope`를 찾았다.
- value alias와 함수 parameter를 받는 member가 함께 있는 계약의 Node 생성 crate는 함수 `raised`를 두 번 정의했다. 하나는
  값의 walk를 위한 것이고 하나는 함수의 예외를 위한 것이며, 이는 컴파일되지 않는다(E0428). 이제 값의 walk는 napi의
  error를 `js_raised`로 보관한다. `js_raised`는 pending 예외를 그대로 보관하고 다른 error는 binding의 실패로 보관하며,
  crate에는 `raised`가 하나만 있다. WASM crate는 advance의 boxed closure를 `Driven`의 field 타입으로 직접 썼고 clippy가
  이를 거부한다(`type_complexity`). 이제 그 타입의 이름은 `Advance`이다(GN-6ae). sample의 `make e2e`에서 생성 crate를
  처음 컴파일하여 찾았다. `packages/ts`의 `npm test`로 검증했다. 그 시험은 변경 전에 sample의 Node crate에서 `raised`를
  두 번 찾았다.
- callback unit도 value alias도 없이 함수 parameter만 언어 코드인 계약의 Node crate는 crate 안에서 아무도 만들지 않는
  variant `Thrown::Js`를 가졌다. 그것은 dead code이고 `-D warnings`에서 빌드를 실패시킨다. 이제 그 variant와 그 arm은
  callback unit이나 value alias가 있는 계약에만 쓴다(GN-6ae). `packages/ts`의 `npm test`로 검증했다. 그 시험은 callback
  unit과 alias를 뺀 sample을 생성하고 crate가 이름하는 모든 variant를 crate가 만들 것을 요구하며, 변경 전에는 `Js`를
  찾았다. `tests/e2e`의 어떤 계약도 이 형태가 아니므로 end-to-end 실행은 그것을 컴파일하지 않는다.
- `default`, `text`, `list`처럼 helper의 단어를 이름으로 가진 unit이 있는 계약의 Node와 WASM 생성 crate는 함수
  `in_<word>`나 `out_<word>`를 두 번 정의했고, `guard`, `pass`, `called`, `throw`, `internal`이라는 이름의 function
  member는 crate의 helper 이름을 가졌다. Node crate에서는 두 번째 정의이고, WASM crate에서는 export의 모듈 안에서
  helper를 가리는 export다. 이제 Node와 WASM crate의 helper는 방향을 끝에 적고(`text_in`, `list_out`, `default_in`,
  `function_in`, `passed_out`), function member의 진입점은 `entry_<member>`이며 member의 이름으로 내보낸다(GN-4c).
  `packages/ts`의 `npm test`로 검증했다. enum `default`, `callable`, `text`가 있는 sample의 시험은 변경 전에 Node
  crate에서 `in_default`의 정의 둘을 찾았고, 함수 `guard`, `pass`, `called`, `throw`, `internal`의 시험은 `guard`의 정의
  둘을 찾았다. 둘 다 통과하고, 생성된 WASM 진입점을 `rustc`로 컴파일하는 두 시험도 새 이름으로 통과한다. Python이나
  Go에 대해 sample을 생성하는 20개 시험은 그 target의 거부로 여전히 실패한다.
- Node와 WASM 시험은 함수 fixture의 step의 결과와 표시 `awaits`를 쓰지 않았다. 이제 결과를 이름하는 step은 함수 안에서
  그 호출의 `assert.deepStrictEqual`이고, `awaits`가 있는 fixture는 async 함수다. 그래서 sample의 기다리는 두 case는
  machine의 기다리는 step을 이행된 promise와 거부된 promise로 돌린다(GN-6ae, CK-22). `packages/ts`의 `npm test`로
  검증했다. Node와 WASM fixture의 시험이 통과한다. Python이나 Go에 대해 sample을 생성하는 20개 시험은 그 target의
  거부로 여전히 실패한다.
- WASM binding은 함수 타입의 parameter나 결과 `passthrough`가 있는 member를 이름을 대고 거부했다. 이제 Node처럼 그
  member를 생성한다(GN-6ae). machine은 함수를 `js_sys::Function`으로 소유하고, 모듈의 스레드에서 각 class 인자의
  class의 새 인스턴스와 함께 함수를 부른다. 함수가 돌려준 값은 다시 주지 않는 handle 아래 `JsValue`의 thread-local
  table에 쥔다. 함수가 던진 값은 그 `Raised`의 handle 아래에 두었다가 다시 던지므로 호출자는 같은 객체를 받는다.
  `Driven` 객체의 `advance(settled)`와 ES 모듈의 `drive`는 Node의 step `[0, promise]`, `[1, value]`, `[2, result]`를
  쓰고, 각 advance는 `state.mjs`를 거치며, machine은 거부된 기다림 뒤에도 끝에서 해제된다. 선언과 생성된 시험은 Node의
  것과 같다. `packages/ts`의 `npm test`로 검증했다. WASM closure의 시험, 시험이 연기하는 machine에 대고 돌린 `drive`의
  시험, WASM 시험의 시험 세 개가 통과하고, WASM에 대해 sample을 생성하는 WASM value alias의 시험이 다시 통과한다.
  Python이나 Go에 대해 sample을 생성하는 20개 시험은 그 target의 거부로 여전히 실패한다.
- Node binding은 함수 타입의 parameter나 결과 `passthrough`가 있는 member를 이름을 대고 거부했다. 이제 그 member를
  생성한다(GN-6ae). machine은 함수를 napi 참조로 소유하고, JavaScript 스레드에서 각 class 인자의 class의 새 인스턴스와
  함께 함수를 부른다. 함수가 돌려준 값은 다시 주지 않는 handle 아래 thread-local table에 쥐었다가 결과로 그대로
  내보낸다. 함수의 예외는 환경에서 꺼내 쥐었다가 member의 끝에서 다시 던지므로 호출자는 같은 객체를 받는다. `Driven`
  객체의 `advance(settled)`는 기다림에 `[0, promise]`, machine이 기다리는 값에 `[1, value]`, 끝에 `[2, result]`를
  돌려주고, JavaScript 진입의 `drive`는 step `1`의 값을 promise든 다른 값이든 기다려 `[true, value]`나
  `[false, rejection]`을 다음 advance에 준다. 기다림의 promise의 거부는 호출을 reject하고 machine에 주지 않는다. 선언은
  각 `passthrough`를 타입 parameter로 이름한다. `transaction<T>(work: (arg0: Scope) => T): Promise<Awaited<T>>`다.
  Node 시험은 함수 fixture, 같은 예외 객체를 요구하는 `raises: "callback"` case, `after`의 호출, 함수가 아닌 값이 kind
  `invalid_callback`이라는 시험을 쓴다. `packages/ts`의 `npm test`로 검증했다. Node closure의 시험, 시험이 연기하는
  machine에 대고 돌린 `drive`의 시험(값, promise, thenable, 거부된 기다리는 값, 거부된 기다림), Node 시험의 시험 세
  개가 통과한다. Python, Go, WASM에 대해 sample을 생성하는 21개 시험은 그 target의 거부로 여전히 실패한다.
- `default`, `callable`, `text`, `list`처럼 helper의 단어를 이름으로 가진 unit이 있는 계약의 생성 crate는 컴파일되지
  않았다. 그 unit의 변환 `in_<unit>`이나 `out_<unit>`이 helper `in_<word>`나 `out_<word>`와 같은 이름이어서 함수가 두 번
  정의되었기 때문이다. 이제 `in_<...>`과 `out_<...>`은 unit의 변환만 갖는 이름이고, helper는 방향을 끝에 적는다:
  `text_in`, `list_out`, `default_in`, `callable_in`, `passed_out`(GN-4c). PHP와 Python의 crate는 이 규칙을 적용하고,
  Node, WASM, Go의 crate는 아직 적용하지 않는다. `packages/ts`의 `npm test`로 검증했다. 그 시험은 enum `default`,
  `callable`, `text`가 있는 sample의 PHP crate를 생성하고 각 변환의 정의가 하나이며 `in_<...>`이나 `out_<...>`이라는
  이름의 다른 함수가 없을 것을 요구한다. 변경 전에 그 시험은 `in_default`의 정의 둘을 찾았다.
- awaitable을 돌려주는 함수를 주는 case가 없어서, awaitable이 나중에 settle되거나 예외를 내는 `Step::Await`의 경로에는
  case가 없었다. 함수 fixture는 이제 `"awaits": true`를 적을 수 있다. 그 함수는 그 언어의 awaitable을 돌려주고 그
  결과는 fixture의 `result`나 `raise`다. 계약 검사는 그 표시를 값이 `true`일 때만, `async_allowed: true`인 함수 타입에만,
  step 안에서는 그 step의 fixture가 그것을 적을 때만 받아들인다. PHP와 Go에는 awaitable이 없으므로 거기서는 같은
  fixture가 보통 함수이고, 표시가 있는 case는 다섯 target에서 돈다. PHP 시험은 그렇게 쓴다. sample은 `store.transaction`에
  그런 case 둘을 가진다: 기다리고 commit하는 함수와 중첩된 함수, 그리고 예외를 내고 항목을 버리는 awaitable이다(CK-22,
  GN-6ae). `packages/ts`의 `npm test`로 검증했고 그 표시의 시험은 통과한다.
- 함수 fixture의 step은 그 호출이 돌려주는 값을 적을 수 없었다. 그래서 `store.transaction`의 case는 함수 안에서
  `scope.get`을 부르면서 그 값을 검증하지 않았고, 아무것도 쥐지 않은 scope도 통과했을 것이다. step은 이제 `result`를
  적을 수 있다. 계약 검사는 그것을 받아들이고, 생성된 함수는 다음 step 전에 그 값을 요구한다. PHP 시험은 그것을 함수
  안의 단언으로 쓴다. sample의 세 case는 이제 scope가 쥔 것을 요구한다: commit 전과 예외 전의 대기 중인 항목, 중첩된
  scope 안에서 본 바깥 scope의 항목, 바깥 scope에서 본 중첩된 scope의 항목이다(CK-22, GN-6ae). `packages/ts`의
  `npm test`로 검증했고 함수 fixture의 시험은 통과한다.
- Python, Node, Go, WASM의 시험은 그 target이 함수 parameter를 생성하게 되면 `after`나 `raises: "callback"`이 있는
  case를 말없이 빼놓았을 것이다. 그것을 쓰는 것은 PHP 시험뿐이기 때문이다. 그 시험 생성기는 이제 그런 case를 쓰게 될
  때까지 "after and raises "callback" are not written in the test of <Target> yet"라는 이름으로 거부한다(GN-6ae,
  G-4). `packages/ts`의 `npm test`로 검증했고 그 거부의 시험은 통과한다. 그 target으로 sample을 생성하는 시험 21개는
  아직 member의 거부로 실패한다.
- class `store`와 `scope`가 있는 계약의 생성된 PHP extension은 컴파일되지 않았다. 이름이 `scope`인 class의 변환이
  class의 scope 안에서 property를 읽는 helper의 이름 `in_scope`를 가졌고, `machine`이 있는 method는 lock이 주는
  borrow의 borrow를 clone하는 `Clone::clone(&*receiver)`를 코어에 주었으며, sample의 코어 경로는 `&self`를 받았다.
  helper는 이제 `with_scope`이고, `machine`이 있는 method의 receiver는 `Clone::clone(receiver)`이며, sample 코어의
  `Store::transaction`과 `Scope::nested`는 GN-6ae가 적는 대로 `self`를 받는다(GN-6h). sample의 `make e2e`에서 PHP
  crate의 clippy가 E0428과 E0308로 실패하여 찾았고, sample의 `make e2e`의 PHP로 검증했다.
- 생성된 시험은 함수 타입의 parameter가 있는 member를 실행하지 않았고, end-to-end sample의 계약에는 그런 member가
  없었다. PHP 시험은 이제 함수 fixture의 함수를 쓴다. 그 step은 인자의 method를 호출하고, 함수는 결과를 돌려주거나
  던진다. `raises: "callback"` case는 같은 예외 객체를 요구하고, `after`의 호출은 호출 뒤의 receiver를 관찰하며, callable이
  아닌 값은 kind `invalid_callback`이어야 한다. case는 `passthrough` 값을 GN-13의 값으로 준다. `tests/e2e/sample`의
  계약은 이제 `store`(`new`, `get`, `transaction`)와 `scope`(`put`, `get`, `nested`)를 가지며, `store.transaction`의
  case는 셋이다. commit, 함수가 던진 뒤의 rollback, 중첩된 scope다(GN-6ae, CK-22). Python, Node, Go, WASM은 아직 이
  member를 거부하므로, `packages/ts`의 `npm test`는 그 target으로 sample을 생성하는 시험 21개가 그 거부로 실패하고,
  sample의 end-to-end 검사는 그 target을 실패로 이름한다. 각 target이 그 member를 생성할 때까지 그렇다.
- `binding_core::Passthrough`는 `Send`였으므로 코어가 그것을 다른 스레드로 옮길 수 있었고, 거기서 버려지면 언어 코드의
  스레드에 묶인 table의 release 함수가 불려 값이 table에 남았다. `Passthrough`는 이제 `Send`가 아니다(GN-6ae).
  `docs/core-api.md`는 이제 crate에는 있고 문서에는 없던 `Passthrough`, `Step::Await`, `Machine::settle`,
  `machine::drive`의 `awaited` 인자, `Next::Await`, `Driving::settle`을 적는다. `make test-rust`로 검증했다. 그
  `tests/construct.rs`는 `Passthrough`를 다른 스레드로 보내는 crate가 컴파일되지 않을 것을 요구한다.
- 계약 검사는 함수 타입의 값을 `{"function": [<행>]}`으로 읽었다. 이 형식은 어느 생성기도 쓰지 않았고 class 인자를 줄 수
  없었으며, GN-6ae는 함수 fixture를 적는다. 검사는 이제 함수 fixture `{"function": {"calls": [<step>], "result" |
  "raise"}}`만 읽는다. step `{"on", "call", "args"}`는 위치 `on`의 parameter의 class의 method를 정확히 그 parameter로
  호출하고, step의 함수 타입 인자는 다시 fixture이며, `raise`는 `"exception"`이거나 함수가 인식하는 error unit이다. case는
  `raises: "callback"`을 기대할 수 있고, 그러려면 `"exception"`을 던지는 fixture가 있어야 한다. method의 case는 `after`,
  곧 receiver의 method 호출과 그 `result`를 적을 수 있다(CK-22, GN-6ae). 행 형식을 가진 계약이나 case 파일은 없었다.
  `packages/ts`의 `npm test`로 검증했다.
- PHP는 함수 타입의 parameter나 결과 `passthrough`가 있는 member를 이름을 대고 거부했다. PHP 바인딩은 이제 그것을
  생성한다. parameter는 `callable`을 받고(다른 값은 kind `invalid_callback`이다), 진입점은 그것으로 machine이 부르는
  closure를 만들며 각 class 인자는 그 class의 새 인스턴스가 된다. callable이 돌려준 값은 그 `Passthrough`의 handle
  아래 thread-local table에 쥐고, 코어가 버리면 놓으며, member의 결과로 그대로 돌려준다. callable의 예외는 `Raised`이고
  호출자는 같은 객체를 받는다. driver는 기다리는 값을 곧바로 settle한다. stub은 `@param callable(<parameters>):
  mixed`와 결과 `mixed`를 선언한다. Python, Node, Go, WASM은 여전히 그 member를 이름을 대고 거부한다(GN-6ae).
  `packages/ts`의 `npm test`로 검증했다. 생성된 확장은 아직 컴파일하지 않았다. 모든 target이 생성하기 전에는 어느
  end-to-end 레포의 계약도 그런 member를 갖지 않기 때문이다.
- 함수 타입의 parameter와 결과 `passthrough`는 모든 member에서 "the type ... is not generated yet"로 거부되어, 그
  거부는 규칙도 target도 대지 않았다. 이제 model은 그것을 `machine`이 있는 member에서만 받고, 함수가 `passthrough`를
  돌려주기를 요구하며 그 parameter의 타입을 검사한다. 다른 member는 "a parameter of a function type is generated for a
  member with machine only"나 "a result passthrough is generated for a member with machine only"로 거부하고, 각
  target은 그것을 생성하기 전까지 그런 member를 "a parameter of a function type and a result passthrough are not
  generated for <Target> yet"로 이름을 대고 거부한다(GN-6ae, G-4). `packages/ts`의 `npm test`로 확인했다.
- 생성된 테스트 둘이 생성기 때문에 `tests/e2e/sample`의 `make e2e`에서 실패했다. Node 테스트 파일은 load되지 않았는데,
  기다리는 block의 첫 테스트만 async 함수였고 K-2 테스트 `resolveSlowly lets the exception of a callback through`는
  보통 함수에서 `await`를 썼기 때문이다. 또 호출을 기대하지 않는 fixture의 Go 테스트는 nil인 calls를 빈 slice와
  `reflect.DeepEqual`로 비교했는데, 그것은 둘을 구별한다. 이제 Node block의 각 테스트는 기다릴 때 async이고, 호출을
  기대하지 않는 Go fixture는 calls의 길이 0을 요구한다(GN-6m, G-5). `packages/ts`의 `npm test`와 sample의 `make
  e2e`로 확인했다.
- end-to-end sample에는 transaction의 코어가 없어서 어떤 case도 GN-6ae가 생성하는 것을 보일 수 없었다. 이제 sample
  코어에는 clone들이 한 상태를 나누는 handle `Store`와 `Scope`가 있고, `Store::transaction`과 `Scope::nested`의 state
  machine `Scoped`는 I/O future로 scope를 시작하고, driver의 스레드에서 함수를 부르고, `Step::Await`로 함수의 값을
  기다리고, 값이 settle되면 I/O future로 보류 entry를 commit하며, 함수나 그 awaitable이 예외를 던지면 그것을 버린다.
  아직 어느 target도 함수 parameter를 생성하지 않으므로 계약 member `store.transaction`, `scope.put/get/nested`와 그
  case는 아직 더하지 않았다(결함 86). 이 branch의 binding_core에 대한 sample 코어의 `cargo clippy --all-targets`로
  확인했다.
- 두 결함이 더 `tests/e2e/sample`의 `make e2e`가 Node, WASM, Go의 테스트를 돌리지 못하게 했다. Node `Driven` 객체는
  `Self`를 돌려주지 않는 함수 `new`로 만들어졌고(clippy `new_ret_no_self`), Go binding crate는 feature `fault-test`의
  진입점 `_fault_left`만 쓰는 helper `out_list`를 dead code를 거부하는 feature 없는 build에도 지녔다. 이제 Node 함수는
  `Driven::start`이고, 한 feature의 테스트 진입점만 쓰는 Go helper는 그런 각 feature의 `#[cfg(feature = ...)]`를
  지닌다(GN-6ab, GN-15). `packages/ts`의 `npm test`와 sample의 `make e2e`로 확인했다.
- `machine`이 있는 member를 가진 계약의 binding crate는 compile되지도 lint를 통과하지도 못해서, `tests/e2e/sample`의
  `make e2e`는 모든 target에서 테스트가 돌기 전에 실패했다. PHP, Python, Go는 결과를 match하는 식이 block인 곳에서
  machine을 만들었고(clippy `blocks_in_conditions`) 각 Io future를 `async move { io.await }`로 감쌌다(clippy
  `redundant_async_block`). WASM 함수 `caught`는 `async move` block에서 `impl Future`를 돌려주었다(clippy
  `manual_async_fn`). Node machine은 호출의 `Env`를 빌리는 callback struct를 소유했는데 `Driven` 객체는 그 호출보다 오래
  산다(E0521). 이제 machine은 `drive` 호출의 임시 값이고, 각 Io future는 machine이 준 그대로, 계약이 fault를 적으면
  `armed_future` 안에서 poll되며, `caught`는 `async fn`이고, machine이 소유하는 Node callback은 객체에 대한 napi 참조를
  지니고 drop될 때 그것을 지우는 struct `Owned<Callback>`이다(GN-6ab). `packages/ts`의 `npm test`(그 WASM future
  테스트는 rustc로 `caught`를 compile한다)와 sample의 `make e2e`로 확인했다.
- 생성된 machine driver는 `machine::drive`에 함수 두 개를 주고 `Next::Await`를 match하지 않아서, passthrough 값을
  기다리는 binding_core로는 어느 binding crate도 compile되지 않았다. 이제 PHP, Python, Go는 값을 바로 settle하는 함수
  `|value| Ok(Ok(value))`를 `drive`에 주고, Node와 WASM은 함수 parameter가 없는 member의 `Next::Await`에 그 member를
  적은 kind `internal`로 답한다. 코어는 binding이 준 값으로만 `Passthrough`를 만들기 때문이다. sample의 machine은
  `settle`을 구현한다(GN-6ae). `make test-ts`로 확인했다.
- binding_core에는 member의 machine이 함수에서 받아 그대로 돌려주는 언어 코드 값의 형식도, machine이 awaitable을
  driver에 넘기는 step도 없어서, transaction의 machine은 함수의 값을 돌려줄 수도 async 함수를 기다릴 수도 없었다. 이제
  binding_core에는 코어가 읽지 않고 옮기며 drop되면 handle을 binding의 해제 함수에 주는 binding table의 handle
  `Passthrough`, `Step::Await(Passthrough)`, `Machine::settle(Result<Passthrough, Raised>)`, `Next::Await`,
  `Driving::settle`이 있다. `machine::drive`는 기다린 각 값의 결과를 주는 세 번째 함수 `awaited`를 받고, 그 오류로
  끝난다(GN-6ae). binding_core의 `cargo test --all-features`, `cargo test`와 그 clippy 실행으로 확인했다.
- 언어 코드에 닿는 `wait: async_driver` method는 거부되어("a method with machine is not generated, because its machine
  would borrow its receiver") orm의 `db.transaction`, `tx.savepoint`, `db.close`는 어느 target에서도 생성되지 않았다.
  이제 그런 method는 receiver `&self`를 적고, 모든 target은 인스턴스 값의 clone `Clone::clone(&*receiver)`을 인자보다
  앞에 값으로 코어 경로에 주므로, machine은 clone들이 한 상태를 나누는 handle을 소유한다. `binding check`는 machine이
  있는 method의 다른 receiver를 보고한다(CK-69, GN-6ae). GN-6ae가 case의 함수 fixture와 함께 적는 함수 타입의
  parameter, 결과 `passthrough`, 기다리는 `async_allowed` 함수는 아직 생성하지 않는다(결함 86). `packages/ts`에서
  `npm test`로 확인했다.
- end-to-end sample에는 예외를 던지는 callback의 계약 case가 없어서, callback을 받는 member가 언어 코드의 예외를 어떻게
  다루는지는 각 target의 생성 테스트 K-2만 보였다. 이제 sample에는 `lookup.find`가 `Error::recognized`로 인식하는(U-3)
  kind `refused`의 오류 unit `refused_error`가 있고, `sample.resolve_driven`의 case
  `a_lookup_that_raises_a_recognized_error_refuses_the_key`에서는 lookup이 call에서 그 오류 unit을 던지므로, 모든
  target이 machine에서 kind `refused`를 기대한다. `make test-ts`로 확인했고, target들은 `make e2e`에서 그 case를 실행한다.
- WASM은 `wait: async_driver`인 모든 member와 `machine`인 member(GN-6ab)를 거부해서("wait async_driver is not generated
  for WASM yet"), 그런 계약은 WASM 모듈을 생성하지 못했다. 이제 WASM은 `wasm_bindgen_futures::future_to_promise`의
  promise를 돌려준다: 브라우저에서도 Node에서도 JavaScript의 event loop가 모듈의 스레드에서 future를 poll하며 tokio
  runtime은 쓰지 않는다. WASM crate는 자기 `wasm-bindgen` 0.2.130과 `js-sys` 0.3.107의 release인 `wasm-bindgen-futures`
  0.4.80에 의존하고 binding_core의 driver에는 의존하지 않는다(GN-6n). `machine`인 member는 `Driven` 객체를 돌려주며, 그
  `advance()`는 그 스레드에서 machine의 call을 하고 기다림에는 `[false, promise]`를, 끝에는 `[true, result]`를 준다. ES
  진입의 `drive`가 그것을 기다린 뒤 해제한다(GN-6ab). 그런 member의 ES 진입은 async 함수이고 선언은 `Promise`이며, 생성된
  시험은 그것을 await한다. `tests/e2e/classes`는 future가 한 번 pending이고 tokio runtime이 필요 없는 `classes.settle`을
  갖고, 단위 시험은 그 생성된 WASM 진입을 코어와 함께 rustc로 host와 wasm32에 대해 컴파일한다. `packages/ts`의 `npm test`로
  확인했다.
- list parameter를 표의 타입으로 된 `Vec`으로 코어에 줘서, `&[usize]`, `&[u32]`나 더 좁은 정수의 tuple slice를 빌리는 코어는
  컴파일되지 않았다. 이제 그런 list는 `IntoCore`를 거쳐 코어 항목 타입의 `Vec`으로 들어가고, 코어 호출은 `&values[..]`를
  받는다. 코어 타입 밖의 항목은 kind `invalid_number`다(GN-6ad). Go는 아직 바꾸지 않는다. `tests/e2e/shapes`는 `&[usize]`를
  받는 `shapes.width_sum`과 `&[u32]`를 받는 `shapes.largest`를 갖고, 단위 시험은 그 fixture의 생성된 WASM 진입점을 그
  코어와 함께 rustc로 host와 wasm32에 대해 컴파일한다. `packages/ts`의 `npm test`로 확인했다.
- PHP, Python, Node, WASM은 각 정수를 표의 타입(u64나 i64)으로 코어에 주고 결과는 u8, u16, u32에서만 넓혀서, `u32`,
  `usize`, `[usize; 2]`를 받거나 `usize`를 돌려주는 코어는 컴파일되지 않았다. 이제 인자, record나 case의 field, tuple의
  부분은 코어 호출이 대상을 정하는 `IntoCore`를 거쳐 코어에 들어간다: 정수는 `TryFrom`으로 좁히고 코어 타입 밖의 값은 kind
  `invalid_number`이므로, 코어 `u32`와 wasm32의 `usize`에 대해 2^32를 거부한다. tuple은 Rust tuple이나 배열로 들어간다.
  tuple 결과는 Rust tuple이나 배열에서 `partsN`으로 읽고, `usize`와 `isize`는 `const _: () = assert!(usize::BITS <= 64);`
  뒤에 `as`로 넓힌다(GN-6ac). list parameter는 GN-6ad대로 넘기며, Go는 아직
  바꾸지 않는다. `tests/e2e/shapes`는 `[usize; 2]`를 받는 `shapes.span_width`, `u32` parameter에 `[u32; 2]` 결과를 가진
  `shapes.span_at`, 코어 struct가 `ends: [usize; 2]`와 `step: u32`를 가진 record `stride`를 받는 `shapes.stride_count`,
  `u8` parameter에 `isize` 결과를 가진 `shapes.offset`을 갖는다. 2^32인 step과 256인 start는 kind `invalid_number`다.
  GN-6ad의 컴파일 시험은 그들의 생성된 WASM 진입점을 코어와 함께 host와 wasm32에 대해 컴파일하며, 이 변경 전의 생성기에서는
  실패한다. `packages/ts`의 `npm test`로 확인했다.
- 기본값이 `{literal: null}`인 `optional` 타입의 case field를 거부해서("a field default of a case is not generated yet"),
  template AST처럼 case에서 그런 field를 빼는 variant는 어떤 target도 생성하지 못했다. 이제 그런 field는 빠질 수 있고 빠지면
  null이다: Python은 기본값 `None`인 dataclass field, Node와 WASM은 없거나 `undefined`인 member를 null로 읽고 선택적으로
  선언하며, PHP는 생성자의 그 자리에서 null을 받는다. case 값은 그 키를 뺄 수 있다(GN-6v). case field의 그 밖의 기본값은
  계속 이름으로 거부한다. `tests/e2e/variants`는 이 기본값을 가진 case `label`의 field `at`을 갖는다. `packages/ts`의
  `npm test`로 확인했다.
- Go는 tuple을 받는 member를 받았지만 PHP, Python, Node, WASM은 그것을 거부해서("no input conversion"), 그런 member를 가진
  계약은 그 target들을 생성하지 못했다. 이제 tuple은 정확히 그 부분들로 된 열로 들어온다: Python `tuple`, Node와 WASM `Array`,
  PHP list이고, 각 부분은 그 타입대로 바뀐다. 다른 값이나 항목 수가 다른 열은 kind `invalid_argument_type`이다(GN-6t).
  `tests/e2e/shapes`는 tuple parameter, tuple의 list, 부분 타입이 다른 tuple인 `shapes.span_length`, `shapes.spans_total`,
  `shapes.labelled`를 갖는다. `packages/ts`의 `npm test`와 `tests/e2e/shapes`의 `make e2e`로 확인했다.
- 생성기는 variant unit(T-9)과 `implements`를 가진 class unit을 거부해서, 둘 중 하나를 가진 계약은 어떤 target도 생성하지
  않았다. 이제 variant는 그 `core_type`의 Rust enum이고 wildcard 없는 case의 match로 양방향으로 바뀐다. variant를 다시 담는
  field는 상자에 담는다. 각 case는 Python dataclass, tag를 가진 Node·WASM 객체, variant의 interface를 구현하는 PHP final 클래스다
  (GN-6v). 계약의 callback interface를 구현하는 class는 가진 값에 trait를 부르는 interface의 member를 갖고, 그 인스턴스는 case에서도
  callback을 대신한다(GN-6w). Go는 둘을 이름으로 거부한다. `tests/e2e/variants`는 case `group`이 list, 상자, optional 상자에 figure를
  담는 variant `figure`와 `tail`을 구현하는 class `ribbon`을 갖는다. `packages/ts`의 `npm test`와 `tests/e2e/variants`의 `make e2e`로
  확인했다.
- 콜백을 받는 함수처럼 언어 코드에 닿는 `wait: async_driver` member는 "a member with wait async_driver that reaches
  language code is not generated"로 거부되었다. runtime이 자기 스레드에서 poll하는 future는 그 스레드에서 언어 코드를
  부르게 되기 때문이다. 이제 그런 member는 `core`에 `"machine": true`를 적고, 그 코어 경로는 I/O 없는 state machine인
  `binding_core::machine::Machine`을 돌려준다. 그 단계는 언어 코드에 닿지 않는 I/O future, 언어 코드의 call, 결과다.
  PHP는 호출 스레드에서 machine을 돌리고, Python `<name>`은 각 기다림을 GIL 밖에서 하며 machine을 돌리고 `a<name>`은
  `<name>`을 `asyncio.to_thread`에서 돌린다. Node는 JavaScript 진입이 진행시키는 `Driven` 객체를 돌려주며, 각 call은
  JavaScript 스레드에서, 각 기다림은 napi의 tokio runtime에서 한다. `binding check`는 `machine`이 없는 그런 member와 다른
  member의 `machine`을 보고한다(CK-68). Go는 C ABI 호출 안에서 호출 스레드로 machine을 돌리며, 각 기다림은 block하고 각
  callback은 cgo로 부른다. machine은 인자를 값으로 받으므로, 생성 코드는 class parameter를 그 값의 clone으로 넘긴다.
  생성기는 machine이 receiver를 빌리게 될 `machine`이 있는 method와 그런 member의 기본값이 있는 parameter를 거부한다(GN-6ab). end-to-end sample에 `sample.resolve_driven`을
  더했다. 그 machine은 I/O 단계, lookup의 call, 그 결과를 지나며, case는 찾은 key, 없는 key, 읽기가 실패한 경우다.
  lookup이 던지는 경우는 callback을 받는 각 member의 생성 테스트다. `make test-ts`와 `make test-rust`로 확인했고,
  `tests/machine.rs`는 `drive`와 `Driving`으로 machine을 돌린다.
- 코어 함수가 `Result<String, Error>`를 돌려주는 `partial_target_error.removal_kind` 같은 `raises`가 있는 오류 unit의
  property와, 오류의 trace 같은 타입 `list<text>`의 property는 "a property of an error unit that raises is not generated
  yet"와 "a property of an error unit of type {\"list\":\"text\"} is not generated yet"로 거부되어, 그런 계약의 어떤
  대상도 생성되지 않았다. 이제 모든 대상이 둘 다 생성한다. 생성 코드는 오류를 만들 때 모든 property를 읽으므로, raise하는
  property의 `Err`는 코어가 돌려준 오류 대신 그 자신의 kind의 오류로 일어나고, `list<text>` property는 문자열 list다.
  kind가 아니거나 그 class가 raise하는 property를 가진 property `raises`의 변형은 이름을 대어 거부한다(GN-7a). `packages/ts`에서
  `npm test`와 `npm run typecheck`로 확인했다.
- 생성된 PHP 오류 클래스의 어떤 생성자도 kind를 받지 않아서, PHP 코드는 category 클래스의 scope에서 private 속성 `kind`를
  적어야만 kind를 가진 오류를 만들 수 있었고, 그것은 공개 API가 아니며 raise 행의 fixture가 그렇게 했다. 이제 모든 category
  클래스는 공개 생성자 `__construct(string $message, string $kind, ?int $status = null, ?int $errno = null)`를 가지며 모든
  오류 unit이 이를 상속하고, raise 행의 fixture는 Python·Node·WASM처럼 그것으로 오류를 만든다(GN-10, GN-13). `packages/ts`에서
  `npm test`와 `npm run typecheck`로 확인했다.
- callback fixture에 raise 행이 있는 case(없는 파일을 알리는 loader 같은)는 "a raise row of a callback fixture is not
  generated yet"로 거부되었다. 이제 모든 target의 fixture가 그런 행에서 그 행의 오류 unit 인스턴스를 언어 코드가 만들듯이
  kind와 메시지 `G-5: <kind>`로 만들어 던진다. Go는 `internal/binding`의 `Raised<Unit>`로 만든다(GN-13). `packages/ts`에서
  `npm test`로 확인했다.
- `errors.recognize`가 있는 callback member(없는 파일을 알리는 loader의 `file_loader.load` 같은)는 "recognized callback errors
  are not generated yet"로 거부되어 그런 계약의 target은 생성되지 않았다. 이제 member의 예외가 recognize한 오류 unit의
  인스턴스이고 그 unit 행의 kind를 가지면 코어에 그 kind로 간다. `errors.recognized`가 kind의 값과 메시지로 코어 오류를 만드는
  코어 함수를 적고, Python·Node·PHP·WASM·Go가 인스턴스의 kind와 메시지를 읽는다. 그 밖의 예외는 같은 객체로 호출자에게
  돌아간다. `binding check`는 callback이 자기 오류 unit을 recognize하는데 `errors.recognized`가 없는 계약을 보고하고(CK-17),
  생성기는 다른 라이브러리의 unit을 recognize하는 것을 이름을 대어 거부한다(GN-6d). `packages/ts`에서 `npm test`로 확인했다.
- class parameter는 늘 코어에 공유 빌림(`&guard`)을 주었다. 그래서 `&mut Form`을 받는 코어는 컴파일되지 않았고, class를 값으로
  받는 코어는 값을 받지 못했다. 이제 generated class나 그 optional인 모든 parameter는 코어의 빌림을 `core`에 적는다(`&`, `&mut`,
  `value`). `&mut`는 쓰기 쪽 자리이고, `value`는 읽기 guard 아래의 복제를 주며, 모든 crate는 그런 member의 빌림을 코어 경로의
  fn pointer 타입으로 단언한다. `binding check`는 `core`가 없는 class parameter와 class가 아닌 parameter의 `core`를 보고하고
  (CK-67), 생성기는 둘 다와 optional class의 빌림을 이름을 대어 거부한다(GN-6h). `tests/e2e/classes`와 `tests/e2e/sample`의
  계약은 class parameter의 빌림 `&`를 적는다. `packages/ts`에서 `npm test`로 확인했다.
- 코어 오류가 code enum을 담은 구조체(`FormError { code: FormErrorCode, .. }` 같은)인 계약은 `errors.kinds`에 code의 variant를
  적었다. code의 variant가 의존 레포의 code를 담으면 생성기는 "the kinds name 2 error enums"로 거부했고, 아니면 code의 variant에
  대해 `match error`를 써서 컴파일되지 않았다. 이제 `errors.code`가 오류의 타입과 code로 가는 투영을 적고, 모든 crate가 code를
  match하고 단언한다(`match <투영>(&error)`). 다른 enum의 값을 담은 variant는 `<바깥>/<안쪽>`으로 적고 `Outer(Inner { .. })`로
  match한다(GN-7b). `packages/ts`에서 `npm test`로 확인했다.
- `tests/e2e/classes`의 Node 바인딩이 컴파일되지 않았다(E0515, E0597): 호출이 receiver guard의 참조를
  (`let receiver = &*receiver;`) 묶은 뒤 guard를 `Gate.enter_later`(async_driver)의 future와 `Gate.enter_slowly`
  (blocking_io)의 pool closure로 옮겼으므로, future와 closure가 호출의 지역 변수를 빌린 참조를 쥐었다. 이제 future와 pool
  closure가 guard를 소유하고 그 안에서 참조를 묶는다(GN-6h). `tests/e2e/classes`의 `make e2e`로 검증했고, 그 기록은 증거이며
  모든 target에서 통과했다(PHP 생성 시험 60개와 contract case 4개, Python 58개와 4개, Node 63개, Go 27개, WASM 42개).
  `tests/e2e/sample`, `tests/e2e/shapes`, `tests/e2e/consumer`의 `make e2e`도 증거인 기록에서 모든 target이 통과했다.
- feature 없는 binding_core의 `cargo test`가 `tests/lock.rs`와 `tests/driver.rs`를 시험 없이 돌리고 통과했다. 각 파일이
  crate 수준의 `#![cfg(feature = ...)]`로 막혀 있었기 때문이다. 이제 두 파일은 `required-features`를 가진 `[[test]]`
  target이고, feature 없는 실행은 그것을 빌드하지 않는다(HR-84). `make check`로 확인했다: test-ts는 시험 290개를 돌려 모두
  통과했고 `tests/core-tests.test.ts`의 시험이 그 안에 있다. test-rust는 모든 feature에서 lock과 driver를 돌렸고 feature
  없이는 둘 다 목록에 없었다.
- `tests/e2e/sample`의 e2e가 Node와 Go에서 실패했다. Node: `resolveSlowly`의 K-2 시험 가운데 묶음의 첫 시험만 async
  function이 되어, 생성된 시험 module이 해석되지 않았다(async가 아닌 function 안의 `await`). 이제 기다리는 묶음의 모든 시험이
  async다. Go: feature `fault-test`의 진입점만 쓰는 `out_list`가 feature 없는 정적 라이브러리에도 컴파일되어, 그 라이브러리가
  그것을 죽은 코드로 거부했다. 이제 시험 feature의 진입점만 쓰는 도우미는 그 feature에서만 컴파일된다(GN-4).
  `tests/e2e/sample`의 `make e2e`로 확인했다: 모든 target이 통과했고 node는 시험 67개, go는 41개다. `packages/ts`의 `npm
  test`로도 확인했다: 289개 중 289개 통과.
- changelog 항목 하나가 end-to-end 실행이 확인한 commit을 이름했다. 이것은 찾아보지 않는 독자에게 아무것도 말하지 않고
  얕은 history에서는 사라진다. 이제 추적 파일은 GitHub action의 commit 고정과 lock 말고는 Git commit을 이름하지 않는다.
  `tests/tracked-commits.test.ts`가 다른 commit 이름 토큰을 모두 실패시키고, 그 항목은 그것을 검증한 실행을 적는다(B1.4).
  `packages/ts`의 `npm test`로 검증했다.
- GN-13a는 B-10을 G-5가 생성하지 않는 시험에 넣었지만, GN-6p는 PHP, Python, Node가 `cleanup`이 있는 class unit마다
  B-10 시험을 생성한다고 적는다. 이제 GN-13a는 B-10을 그런 unit을 이름으로 거부하는 Go와 WASM에서만 열린 항목으로
  적는다(GN-6p, GN-13a). `packages/ts`의 `npm test`가 PHP, Python, Node에 요구하는 B-10 시험을 읽어 확인했다.
- binding에는 문서 검사가 없었다: `make docs-check`도 `config/documents.json`도 체크리스트도 없어서, 깨진 link, 원문의
  개정을 갖지 않은 한국어 짝, 꼴이 틀린 체크리스트 행이 드러나지 않았다. 이제 `make docs-check`가 설치된
  `@polyspec/kit`의 문서 검사를 모든 Markdown 문서, changelog, `config/checklist.json`이 선언한 체크리스트
  `docs/plans/execution/checklist.md`에 돌리고, `make documents-stamp`가 검토한 한국어 짝에 `source-sha256`을 쓴다(B1.1,
  B1.2). `make docs-check`로 검증했다.
- instance 값이 아닌 class의 Go case 값(json `Value`의 `{"kind": "text", "value": "a"}`)은 "a case value of the class
  value is an instance value"로 Go target 전체를 거부했다. 이제 Go는 다른 target과 같이 쓴다: origin value인 class는 그
  kind의 make member로, 다른 class는 생성자와 쌍의 insert로 만들고, 각각 시험의 지역 변수다. receiver나 인자를 쓰지 못하는
  case는 그 시험이 이름을 대고 실패하고, target의 다른 시험은 쓰인다(U-1, GN-13, GN-13e, GN-13f). `packages/ts`의
  `npm test`로 검증했다.
- parameter 없는 생성자(json `OrderedMap()`)의 Python G-7 시험은 인자 없는 CPython 함수의 말인 `takes no arguments`를
  기대했지만, 그 생성자는 PyO3의 `__new__`이고 `takes 0 positional arguments`와 `unexpected keyword argument`로 알린다. 이제 시험은
  형태마다 그 말을 기대한다(G-7). `packages/ts`의 `npm test`로 검증했다.
- JSON이 정수로 적는 float case 값(json `value.from_float`의 `0`, `100`, `1e20`)은 Python과 PHP에서 정수로 적혔는데, 두 언어는
  float 자리의 정수를 거부한다(kind `invalid_argument_type`). 음의 0은 모든 언어에서 부호를 잃었다. 이제 float는 Python과 PHP에서
  float literal(`0.0`, `1e+20`)이고, 음의 0은 `-0.0`, Node와 WASM에서 `-0`이다(B-2, G-5). `packages/ts`의 `npm test`로 검증했다.
- 결과가 class optional의 `null`인 case(json `ordered_map.get`의 `get_absent`)는 "a class has no case value form"으로 시험이
  실패했다. 이제 optional의 결과 `null`은 optional이 무엇을 담든 case 형식이 있고, 각 target은 결과를 자기 null과 비교한다
  (Python `None`, Node, WASM, PHP `null`, Go는 결과 타입의 `nil`). class인 결과는 여전히 그 이유로 실패한다(GN-13e). `packages/ts`의
  `npm test`로 검증했다.
- JavaScript가 예약한 낱말을 이름으로 가진 Node class member(json `Value`의 static member `null`)는 진입점이
  `function null(...args)`로 정의해서 진입점이 파싱되지 않았다(SyntaxError). 이제 진입점은 addon 위의 각 member를 계산된 key
  `<name>`의 메서드로 쓰고 그 메서드는 `<name>`을 `name`으로 지니며, JavaScript의 모든 예약어를 Node 진입점과 WASM module에
  대해 시험한다(GN-6b). `packages/ts`의 `npm test`로 검증했다.
- Python 파서가 받는 것보다 깊게 중첩된 Python case 값(json `value.array`의 `array_past_limit`)은 import되지 않는 시험
  module을 냈다("too many nested parentheses"). 이제 괄호가 50단보다 깊게 중첩될 case 값은 시험 module 함수의 지역 변수로
  단계별로 만들고 시험이 그 함수를 부르므로, case는 온전히 남는다(GN-13e). `packages/ts`의 `npm test`로 검증했다.
- 식별자가 받지 않는 문자를 id에 가진 case(json의 `document-order`)는 PHP 메서드 `testGn13eparseDocument-order`와 Python
  메서드 `test_gn13e_parse_document-order`를 내서, PHPUnit과 unittest가 생성된 시험을 읽지 못했다. 이제 case 시험의 이름은
  ASCII 글자와 숫자가 아닌 문자가 이어진 곳마다 나눈 id의 낱말을 담고(`DocumentOrder`, `document_order`, Go는 이미 그랬다), 한
  member나 한 값 alias의 두 id가 같은 이름을 내면 target을 이름을 대고 거부하며 PHP는 대소문자 없이 비교한다(GN-13e).
  `packages/ts`의 `npm test`로 검증했다.
- make member가 다른 class를 받는 origin value class(`OrderedMap`을 받는 json의 `Value.object`)의 kind map case 값은
  "takes more than one value"나 "no case value of the type"으로 시험이 실패했다. case의 `[key, value]` 쌍이 그 class의 값이 아니기
  때문이다. 이제 쌍이 그 class를 채운다: parameter 없는 생성자가 만들고, receiver `&mut self`와 parameter 둘을 가진 하나뿐인
  member가 각 쌍을 받으며, parameter가 origin value class면 text key는 kind text의 값이 된다. 다른 자리(`value.object`의
  `members`)의 그런 class case 값도 같은 쌍의 list다(GN-13). `packages/ts`의 `npm test`로 검증했다.
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
- `tests/e2e/classes`의 Go C ABI가 `panic-test` 없이 빌드되지 않았다. poison 진입점이 쓰기 쪽 자리가 있는 모든 class에 갈래를
  두었는데, Go가 만들지 않는 `lease`도 그랬고, 그 갈래만 쓰는 `held_lease`가 feature가 꺼지면 쓰이지 않았다. 이제 진입점은
  Go poison 시험처럼 Go가 생성자나 static member로 만드는 class만 받고, 그런 class가 없는 패키지에는 진입점이 없다(GN-6h).
  `tests/e2e/classes`의 `make e2e`로 확인했다: 모든 target이 통과했고 go는 시험 27개다. `packages/ts`의 `npm test`로도
  확인했다: 289개 중 289개 통과.
- `make e2e`가 `go test -json`을 그 `build-output` 사건 없이 읽었다. 그래서 link에 실패한 Go 패키지는 linker 출력 없이
  "go test failed the packages …"로만 적혔다. 이제 `scripts/go-test-events.mts`가 사건을 읽고, 각 빌드의 출력을 찍고 원인에
  그것을 적는다(GN-14a). `packages/ts`의 `npm test`로 확인했다: 289개 중 289개 통과이고,
  `tests/go-test-events.test.ts`의 시험 두 개가 그 안에 있다. 그 뒤의 e2e 실행에는 빌드되지 않는 Go 패키지가 없었다.
- B-2의 Go 시험은 안전한 정수보다 큰 정수를 `1 << 53`으로 적었는데, gofmt는 그것이 여러 인자 가운데 하나일 때
  `1<<53`으로 바꾼다. 그래서 `tests/e2e/points` Go module의 `gofmt -l`이 `zz_generated_test.go`를
  (`Shift(1 << 53, Point{X: 0, Y: 0})`) 이름했다. 이제 시험은 어느 자리에서든 gofmt가 그대로 두는 수
  `9007199254740992`를 적는다. `packages/ts`의 `npm test`와 tests/e2e 모든 레포의 생성된 Go module의 `gofmt -l`로
  확인했다.
- 생성기는 다른 레포의 record를 이름하는 계약의 Go 바인딩을 "a record of another repository is not generated for Go
  yet (GN-15f)"로 거부해서, `tests/e2e/points`의 record `point`를 받고 주는 `tests/e2e/plot`에는 Go 바인딩이 없었다.
  이제 Go는 그 레포 Go module의 struct `points.Point`를 이름하고 패키지와 시험이 그것을 import하며, C ABI는
  `in_points_point`와 `out_points_point`로 변환한다. target go가 있는 계약의 `binding scaffold`는 코어의 path 의존
  계약을 Cargo 없이 그 경로에서, 다른 의존 계약은 Cargo로 읽고, 계약이 record를 이름하는 라이브러리마다 `go.mod`에 그
  Go module의 `require` 줄을 적는다. 버전은 의존 줄의 정확한 버전이나 tag이고, path 의존은 `v0.0.0`과 그 Go module로
  가는 `replace` 줄이다. branch, commit, 버전 범위는 이름으로 거부한다. end-to-end 실행은 그런 의존의 Go 정적
  라이브러리를 레포의 것 옆에 빌드한다(GN-15f, GN-14). `packages/ts`의 `npm test`와, points와 plot의 생성된 Go
  module의 `gofmt`, `go vet`으로 확인했다.
- class unit이 없는 계약의 Go C ABI는 인스턴스 표의 helper `insert`를 남겼다. helper 정리가 값 alias의 map 호출
  `made.insert(`를 그 helper의 호출로 보았기 때문이다. 그래서 `polyspec-consumer-go`의 `cargo clippy`가 "cannot find
  type `Table`"과 "cannot find type `Arc`"로 실패했다. 이제 helper는 나가는 인스턴스만 이름하는 `insert_held`다.
  `packages/ts`의 `npm test`와 `tests/e2e/consumer` Go crate의 `cargo clippy`로 확인했다.
- class unit `lease`(GN-6p)를 넣은 뒤 `tests/e2e/classes`의 e2e가 세 target에서 실패했다. Python: 실패한 호출이 임시 값으로
  남긴 `Lease`가 그 호출의 `TypeError`가 설정된 채 경고해서 호출이 `SystemError`로 끝났다. 이제 소멸자는 그 예외를 맡아
  두었다가 경고 뒤에 다시 설정한다. PHP: PHP가 메시지 앞에 실행 중인 함수를 붙이므로 경고는 `<function>(): Lease was
  destroyed …`이다. 그래서 B-10 시험은 그 글로 끝나는 메시지를 요구한다. Go: B-5c의 poison entry point가 `held_lease`를
  불렀는데, 그것을 쓰는 것이 그 시험 entry뿐이라 helper 묶음이 그것을 뺐다. 이제 그 helper를 남긴다.
  `tests/e2e/classes`의 `make e2e`로 검증했고, 그 기록은 증거이며 모든 target에서 통과했다: PHP는 생성 시험 60개와 contract
  case 4개, Python은 58개와 4개, Go는 27개.
- parameter나 receiver가 언어 코드를 지니는 `wait: blocking_io` member를 모든 target이 거부했다("a member with wait
  blocking_io that reaches language code is not generated (GN-6m)"). 그래서 host loader를 쓰는 template engine의
  `engine.load`, `prepare`, `prepare_bound`에 바인딩이 없었다. 이제 PHP와 Python은 GN-6m대로 생성한다. Python
  callback의 각 호출은 코어가 그것을 부르는 스레드에서 kind `wrong_thread` 검사 없이 GIL을 얻으므로, `a<name>`의 worker
  스레드에서도 callback이 실행된다. Node는 callback 객체를 가진 JavaScript 스레드에서 호출을 동기로 실행하고 이미
  settle된 promise를 돌려준다. 언어 코드에 닿는 `async_driver` member는 계속 이름을 대고 거부한다. `tests/e2e/sample`의
  `sample.resolve_slowly`가 이것을 다루고, 예외를 던지는 callback으로 `aresolve_slowly`를 기다리는 Python 시험이 있다
  (GN-6q). `tests/e2e/sample`의 `make e2e`로 확인했다: 모든 target이 통과했고 php는 시험 67개, python 66개, node 67개,
  go 41개, wasm 54개다. `packages/ts`의 `npm test`로도 확인했다: 289개 중 289개 통과.
- 코어 receiver가 `self`인 method와 `cleanup`이 있는 class unit은 모든 target이 거부했다("a receiver self is not
  generated yet", "cleanup is not generated yet"). 그래서 닫는 호출이 소비하는 자원에는 binding이 없었다. 이제 PHP·Python·
  Node는 class의 잠금에서 값을 꺼내고(`Exclusive`와 `Shared`의 `take`, 객체는 그 뒤 kind `consumed`다, GN-6o), `cleanup`이
  있는 unit의 코어 타입은 `binding_core::Cleanup`을 구현하고 다른 class unit의 것은 구현하지 않는다는 것을 단언하며,
  객체가 정리 호출 없이 사라지면 경고한다. 경고는 `E_WARNING`, `ResourceWarning`, type `ResourceWarning`인
  `process.emitWarning`이다(GN-6p, B-10). 생성 시험은 호출 뒤의 kind `consumed`와 경고를 요구한다. Go와 WASM은 그런
  member와 unit을 이름을 대고 거부한다. `make check`로 확인했다.
- `tests/e2e/classes`의 end-to-end 검사가 Python에서 실패했다. `a<name>`이 인자 tuple을 이어 붙인
  iterator로 만들었는데, `PyTuple::new`는 크기가 정확한 것만 받기 때문이다. Node와 WASM에서도 실패했다. 기다리는 member의
  결과 변환이 함수를 부르기만 하는 closure였고, clippy가 이것을 거부하기 때문이다(`redundant_closure`). 이제 Python은
  vector로 tuple을 만들고, Node는 함수 자체를 넘긴다(GN-6m, GN-6n). `tests/e2e/classes`의 `make e2e`로 확인했다.
- fsm의 Go C ABI가 컴파일되지 않았다(E0283, type annotations needed): `out_optional`이 `impl Into<Option<T>>`를 받았는데,
  error unit의 optional property인 `Option<i64>`와 optional text field인 `&Option<String>`이 두 타입 `T`에 맞아서 제네릭
  `out_int`과 `out_text`가 `T`를 정하지 못했다. 이제 `out_optional`은 PHP, Python, Node처럼 코어 값의 `as_ref`를 받는
  `Option<T>`를 받는다(GN-16). `packages/ts`의 `npm test`로 확인했다: 280개 중 280개 통과. fsm의 `make e2e`로도
  검증했고, 그 기록은 증거다: PHP, Python, Node, WASM이 통과했고(557, 556, 557, 556개 시험), Go는 컴파일되었고 결함 88의 이름
  붙은 `from_code` 시험 20개만 실패했다. 그 입력은 GN-13의 case-test 진입점이 생성될 때까지 Go에 형태가 없다.
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
  Go는 그런 member를 이름을 대고 거부한다. 기다리는 constructor·property·iterate·hook은 이름을 대고 거부된다. CK-16은
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
  입력 시험이 실패했다. 이제 이 파일들은 실행이 읽지 않는 파일로 각각 이유와 함께 목록에 있다(GN-14b). `packages/ts`의
  `npm test`로 확인했다: 289개 중 289개 통과이고, `tests/e2e-inputs.test.ts`의 시험이 그 안에 있다.
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
  `release-undraft`, `release-coverage`를 더한다. `make check`로 확인했다: test-ts, test-rust, lint-rust가 통과했다.
  `make release-coverage`로도 확인했다: 모든 패키지 파일이 분류되었다. workflow는 `main`의 push 뒤에만 돌므로, 그것들을
  검증한 실행은 아직 없다.
- 실패 주입점을 가진 코어는 저장소가 flag나 자기 dev-dependency를 주지 않으면 지점이 꺼진 채로 `cargo test`를 돌렸고, 저장소들은
  이를 두 꼴로 했다. 이제 코어는 자기 자신을 `fault-test`와 함께 dev-dependency로 두어, flag 없는 `cargo test`가 지점을
  장전한다. `binding check`는 그것이 없는 코어 manifest를 보고한다(CK-65, GN-5). tests/e2e의 sample 코어가 그 dev-dependency를 갖는다.
  `packages/ts`의 `npm test`로 확인했다: 289개 중 289개 통과이고, CK-65의 시험이 그 안에 있다. 그 dev-dependency를 가진
  코어의 `tests/e2e/sample` `make e2e`로도 확인했다: 모든 target이 통과했다.
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
  않는 이유는 그 위의 주석이 된다. Node addon의 이유는 규칙 id를 적는다(GN-3a, GN-4). `packages/ts`의 `npm test`로
  확인했다: 289개 중 289개 통과이고, 바인딩 crate에 rustfmt를 기본 설정과 저장소의 설정으로 돌리는 시험이 그 안에 있다.
- 생성기는 루트가 아닌 module의 오류 unit을 모든 target에서 거부했다. 이제 그것을 생성한다. PHP는 그 module의 namespace에
  클래스를 등록하고, Python은 `<root>.<module>`과 `<root>`에서 주며, Node와 WASM은 그 이름으로 내보낸다(GN-7a, GN-11).
  tests/e2e/shapes의 오류 unit `utf8_error`는 module `errors`에 있으므로, 종단 검사는 각 target에서 그 오류를 낸다.
  `tests/e2e/shapes`의 `make e2e`로 확인했다: 모든 target이 통과했고 php는 시험 66개, python 78개, node 79개, go 50개,
  wasm 77개다.
- 기본값 `{empty: "object"}`가 있는 record parameter는 모든 target에서 거부되었다("a default of a record parameter is not
  generated yet"). 그래서 `parse(source, options = {})` 같은 parameter가 있는 계약은 어떤 target도 생성되지 않았다. 이제
  record의 모든 field에 기본값이 있으면 그 parameter를 생성한다. 코어는 모든 field가 `None`인 record를 받고, Python과
  PHP는 field의 keyword와 이름 있는 인자를 생략하며, Node와 WASM은 options record를 빠지거나 `undefined`일 수 있는 뒤쪽
  인자로 받는다. 기본값 없는 field가 있는 record는 이름을 대고 거부한다(GN-6i). `tests/e2e/shapes`는 이 꼴의 member
  `shapes.wrap`을 갖는다. `packages/ts`의 `npm test`와 `tests/e2e/shapes`의 `make e2e`로 확인했다.
- Makefile에 단위 시험 target이 없어서, packages/ts와 binding_core의 시험은 각 패키지의 명령으로만 돌았다. `make test-ts`는
  packages/ts를 type-check하고 시험을 돌리고, `make test-rust`는 binding_core를 모든 feature로, 그리고 feature 없이 시험한다.
  `make lint-rust`는 두 꼴로 clippy를 돌리고 형식을 확인하며, `make check`는 셋을 끝까지 돌리고 실패한 것을 모두 이름한다.
  `make check`로 확인했다: test-ts는 시험 289개를 돌려 모두 통과했고, test-rust와 lint-rust는 모든 feature와 feature
  없이 통과했다.
- `binding generate`는 다른 target을 쓴 뒤 거부된 target을 usage 줄과 상태 2로 끝냈다. 명령줄이 잘못된 것처럼 끝냈으므로,
  저장소는 거부와 usage 오류를 구별할 수 없었다. 이제 거부, 계약의 crate가 아닌 코어 manifest, 실패한 `cargo metadata`는 usage
  줄 없이 상태 1로 끝난다. usage는 명령줄 오류만 상태 2와 함께 찍는다(GN-1c). `packages/ts`의 `npm test`로 확인했다:
  289개 중 289개 통과이고, GN-1c의 시험이 그 안에 있다.
- 실패 주입점은 binding_core의 feature `fault-test`로 판정되었는데, Cargo는 build 전체에서 그 feature를 합친다. 그래서 코어
  하나가 `fault-test`를 켜면 모든 코어의 지점이 켜졌고, feature에서 `polyspec-<library>/fault-test`를 빠뜨린 바인딩 crate도
  그 라이브러리의 지점을 장전하는 case를 통과했다. 이제 지점은 macro `fault::point!`이고, 그것을 적은 crate의 feature
  `fault-test`로 판정된다. `tests/point.rs`는 코어 둘과, 그 가운데 하나의 feature만 켜는 바인딩을 만들어 이를 확인한다(GN-5).
  코어는 `binding_core::fault::point(NAME)` 대신 `binding_core::fault::point!(NAME)`을 적는다. `make test-rust`로
  확인했다: `tests/point.rs`가 모든 feature와 feature 없이 통과했다.
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
  이제 검사는 그런 자리에서 안전 정수 밖에 있는 case의 정수를 보고한다(CK-64). `packages/ts`의 `npm test`로 확인했다:
  289개 중 289개 통과이고, `tests/contract-check.test.ts`의 CK-64 시험이 그 안에 있다.
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
  `usize::try_from`으로 변환하며, data 값의 정수는 U-7의 이유를 단 가장 가까운 float다. `tests/e2e/shapes`의
  `make e2e`로 검증했고, 그 기록은 증거이며 모든 target에서 통과했다(PHP 66, Python 78, Node 79, Go 50, WASM 77개 시험).
  `tests/e2e/sample`의 `make e2e`도 증거인 기록에서 모든 target의 코어 lint를 통과했다.
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
- `tests/e2e/sample`의 값 alias `data`는 target Go와 WASM을 선언했지만 out 행이 Go 값과 WASM 값을 만들지 않고 그
  값을 분류하는 in 행도 없어, `binding check`가 `tests/e2e/sample`과 `tests/e2e/consumer`의 모든 target을
  실패시켰다(CK-8). 이제 각 out 행이 그 kind의 Go 값과 WASM 값을 만들고, in 행이 그 값을 분류한다. `packages/ts`의
  `npm test`와 `make e2e`로 확인했다.
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
