<!-- doc-id: changelog -->
<!-- source-sha256: ee2b802ed6e85ec5a337be3e0d0b7344a4635e70d8d96cc29f7399d85dc1ee6e -->
# 변경 기록

[English](CHANGELOG.md)

## Unreleased

- 생성된 Node와 WASM의 B-10 시험은 `gc()` 뒤 프로세스의 첫 `ResourceWarning`을 받아 그 메시지를 비교했다. 그래서
  `cleanup`이 있는 class가 둘인 계약은 수거가 앞선 시험의 객체를 먼저 finalize하면 실패했다. `tests/e2e/classes`의
  end-to-end 검사가 Node에서 한 번, `Lease`의 시험에서 `Stall`의 경고로 실패했다. 이제 각 시험은 메시지가 자기 class의
  경고인 warning을 기다린다(GN-6p). `make test-ts`로 검증했고, 그 시험이 두 target의 생성된 시험을 읽는다.
- `wait: process_wait`인 member를 모든 target이 이름을 대고 거부했다. 이제 생성기가 그것을 받는다(GN-6m). 코어 호출은
  `Io` token의 자리에 `binding_core::ProcessWait::for_generated_call()`을 받는다. PHP, Python `<name>`, Go는
  `blocking_io`처럼 호출한 thread에서 기다린다. Python `a<name>`은 `<name>`을 자기 thread에서 돌리고 그 thread가 실행
  중인 loop의 future를 정한다. 모든 `to_thread`가 executor를 함께 쓰는 `asyncio.to_thread`는 쓰지 않는다. Node는 코어
  호출을 자기 thread에서 돌리고 JavaScript thread에서 promise를 정하며(`Env::create_deferred`), libuv pool은 쓰지 않는다.
  WASM에는 그런 member가 없고, 명세는 그것을 그 target의 규칙으로 적으며, CK-15가 `wasm`이 없는 `only`를 요구한다.
  `process_wait`인 constructor, property, iterate, hook은 `blocking_io`인 것처럼 거부한다. `make test-ts`로 검증했다.
  `process_wait`의 거부를 요구하던 시험은 변경 전에 성립했고, 새 시험은 각 언어의 token과 형태를 읽는다. 436개 중
  436개가 통과한다. `tests/e2e/classes`의 함수 `classes.attend`와 method `gate.enter_after`가 PHP, Python, Node, Go에서
  `process_wait`로 기다리며, 각각 결과의 case 하나와 실패의 case 하나를 갖는다. Node와 Python의 형태는 그 저장소의
  end-to-end 검사만 컴파일한다.
- 생성된 Go의 B-10 시험은 `runtime.GC()` 뒤에 표준 logger의 메시지 하나를 channel에서 받았다. 수거가 남긴 객체는 그
  시험을 끝없이 기다리게 했고, 앞선 시험의 객체가 낸 경고는 그 시험을 실패시켰으며, 두 번째 메시지는 쓰는 동안 자기 lock을
  쥐는 logger를 막았다. 이제 시험은 자기 객체의 `weak.Pointer`를 얻어 수거가 객체를 남기면 곧바로 실패하고, writer는
  모든 메시지를 간직하며 결코 막히지 않고, 시험은 자기 class의 경고가 나올 때까지 메시지를 읽는다(GN-6p). cleanup 함수가
  경고 없이 돌았다면 시험은 여전히 기다린다. 그 함수는 생성기의 단위 시험이 읽는다. binding_core lock의 `clean`과
  `cleaned`를 넣은 상태에서 `make test-rust`와 `make lint-rust`가 통과한다. `make test-ts`로 검증했다. 생성된 Go 시험을
  읽는 시험은 변경 전에 실패했다.
- 계약 검사가 생성기가 거부하는 것보다 적게 보고했다. 그리고 기다리는 constructor, 생성할 수 있는 class, variant의 코어
  enum, 객체를 남기는 cleanup의 검사는 id CK-73, CK-74, CK-75, CK-76을 갖는다. CK-73은 이제 host unit도 판정한다. host
  unit의 `constructor`, `property`, `iterate`, hook이 `none`이 아닌 `wait`를 가지면 finding이다. 손으로 쓰는 코드에도
  언어에는 그것들을 await하는 형태가 없기 때문이다. 그 예외를 지키던 시험은 schema에 실패하는 계약을 읽었으므로 아무것도
  판정하지 않았다. CK-77은 새 검사다. `core_type`이 없는 class의 target, 곧 그 `only`의 target이나 계약의 target에 PHP나
  Go가 있으면 그 unit과 그 target들을 적는 finding이다. Python, Node, WASM만 그런 class를 생성하기 때문이다(GN-6af).
  명세는 `cleanup`이 있는 class의 코어 타입이 자기 `Drop`에서 자원을 놓는다는 것과, Rust 소스를 읽지 않는 계약 검사가
  그것을 검증하지 않는다는 것을 적는다(GN-6p, CK-76). CK-76의 finding이 그렇게 적는다. 계약 검사 fixture의 `core_type`
  없는 class들은 `only`나 `core_type`을 적는다. `make test-ts`로 검증했다. finding을 요구하는 바뀌었거나 새로운 시험
  다섯은 변경 전에 실패했고, 419개 중 419개가 통과한다.
- `cleanup`이 코어 receiver가 `&mut self`인 method를 가리키는 class unit을 모든 target이 "no method with the receiver
  self"로 거부했다. 이제 생성기가 두 꼴을 다 받는다(GN-6p). `self`인 cleanup은 전처럼 객체를 소비하고, `&mut self`인
  cleanup은 객체를 남기며 그 뒤 member가 무엇을 주는지는 코어가 정한다. 그런 cleanup의 호출은 쓰기 guard를 쥐었을 때
  객체의 lock에 표시하고(`binding_core::Exclusive`와 `Shared`의 `clean`, 그리고 `cleaned`), 다섯 target 각각의 소멸자는
  소비되지도 표시되지도 않은 객체에만 경고한다. 어느 소멸자도 cleanup member를 부르지 않으므로, 기다리는 cleanup이
  기다릴 수 없는 곳에서 불리는 일이 없다. 자원은 코어 타입의 `Drop`이 놓는다. 계약 검사는 그런 cleanup을 실패 없이 두
  번째로 부르는 case를 요구한다(CK-76). `tests/e2e/classes`의 class `stall`이 그런 cleanup과, 그 두 번째 호출의 case와,
  그 뒤 kind `shut`으로 실패하는 member의 case를 갖는다. `make test-ts`로 검증했다. CK-76의 finding을 요구하는 시험 둘은
  검사를 쓰기 전에 실패했고, 414개 중 414개가 통과한다.
- Go와 WASM은 receiver가 `self`인 method와 `cleanup`이 있는 class unit을 이름을 대고 거부했다. 이제 둘 다 PHP, Python,
  Node처럼 생성한다. receiver의 자리가 class의 table이 handle 아래에 둔 lock에서 값을 꺼내고, 그 객체의 뒤 자리는 kind
  `consumed`이며, binding crate는 `binding_core::Cleanup`을 단언한다(GN-6o, GN-6p). 정리 호출 없이 수거된 객체는 B-10의
  메시지로 경고한다. Go에서는 `runtime.AddCleanup`의 함수가 표준 logger의 `log.Print`로, WASM에서는
  `FinalizationRegistry`의 callback이 type `ResourceWarning`의 `process.emitWarning`으로, 그것이 없는 host에서는
  `console.warn`으로 경고한다. 정리 member가 명시적 해제이고 두 번째 member는 생성하지 않는다. 인스턴스의 Go `Ref`는
  pointer를 갖는다. pointer가 없는 객체의 cleanup은 그 할당 block의 모든 객체가 닿을 수 없을 때에만 돌기 때문이다.
  G-5는 두 target에 kind `consumed`의 시험과 B-10 시험을 생성한다. `tests/e2e/classes`의 `lease`의 member가 다섯
  target을 적는다. `make test-ts`로 검증했다. GN-6o와 GN-6p의 시험은 변경 전에 네 거부로 실패했다.
- `wait: async_driver`인 Go member를 이름을 대고 거부했다. 이제 Go가 PHP처럼 그것을 생성한다. member의 cgo 호출이
  호출 goroutine의 OS 스레드에서 `binding_core::driver::block_on`으로 future를 돌리고, 진입점은 결과를 변환할 때까지
  자기 자리의 guard를 쥐며, `machine`이 있는 member는 그 스레드에서 `binding_core::machine::drive`가 돌린다. runtime은
  process의 것이고 어떤 객체도 그것을 소유하지 않는다(GN-6n, GN-6ab). 그런 member가 있는 계약의 Go crate는
  binding_core의 feature `driver`를 켠다. `tests/e2e/classes`의 member `classes.fetch`, `classes.settle`,
  `gate.enter_later`가 Go를 적는다. `make test-ts`로 검증했다.
- `wait: blocking_io`인 Go member를 이름을 대고 거부했다. 이제 Go가 그것을 생성한다. member의 cgo 호출이 호출
  goroutine의 OS 스레드에서 코어를 부르고 코어가 돌아올 때 돌아오며, C ABI의 진입점은 기다리는 동안 자기 자리의 lock을
  쥐고, 그 member는 기다리지 않는 member의 꼴을 갖는다(GN-6m). 언어 코드에 닿는 member는 그 스레드에서 callback을
  부른다(GN-6q). `tests/e2e/classes`의 member `classes.read`와 `gate.enter_slowly`가 Go를 적고, callback `guide`를 받는
  class `usher`는 언어 코드에 닿는 `blocking_io` member다. 그 레포의 `cases_test.go`는 두 goroutine에서 usher 하나를
  부른다. 첫 호출의 guide가 그 호출을 코어 안에 붙잡아 둔 동안 둘째 호출을 하고, 두 결과를 모두 요구한다.
  `make test-ts`로 검증했다. GN-6m과 GN-6q의 시험은 변경 전에 그 거부로 실패했다. 다섯 target의 증거는
  `tests/e2e/classes`의 end-to-end 검사다.
- `binding check`가 통과시킨 계약 오류를 `binding generate`가 거부로 처음 보고했다. 이제 계약 검사가 그 가운데 셋을
  보고한다. CK-73: host unit이 아닌 unit의 `constructor`, `property`, `iterate`, hook(`stringify`, `to_json`,
  `primitive`)이 `none`이 아닌 `wait`를 적으면 finding이고, 그 member와 wait, 그 자리에서 기다릴 수 있는 member를
  적는다. 인스턴스를 만드는 static member, 또는 값이나 항목을 주는 method다(GN-6m, GN-6n, N-4). CK-74: `core_type`이
  있는 class에 constructor도 `constructible: false`도 없거나, `constructible: false`와 constructor가 함께 있으면
  finding이다(U-1). CK-75: `core_type`이 없는 origin `generated`의 `variant` unit은 finding이다(T-9). 생성기의 거부는
  그대로 둔다. `packages/ts`의 `npm test`로 검증했다. finding을 요구하는 새 시험 12개가 변경 전에는 각각 그 finding이
  없어서 실패했고, 변경 후 `tests/contract-check.test.ts`는 246개 중 246개가 통과한다.
- 생성 crate의 helper가 `async fn`이면 모든 crate에 남았다. `usedHelpers`는 항목의 처음에서 `fn`이나 `trait` 뒤의
  이름만 읽었고, 그래서 WASM crate의 `async fn caught`는 이름이 없어 쓰인 것으로 세어졌다. `wait: async_driver`
  member가 없는 WASM crate(variants, sample)에 죽은 코드가 있었고 lint가 이를 deny한다. 이제 `usedHelpers`는
  `async fn`의 이름도 읽는다(GN-4, GN-6n). variants와 sample의 end-to-end 실행이 찾았다("function `caught` is never
  used"). `make test-ts`로 검증: `caught`의 테스트가 variants의 WASM crate 때문에 실패했고, 변경 후 409개 중
  409개가 통과한다.
- `tests/e2e`의 어느 계약도 드러내지 않는 생성기의 텍스트 세 가지. PHP는 실패하는 member나 value alias가 있는 모든
  계약에 helper `thrown`을 썼는데, 그것을 부르는 것은 callback이나 함수 타입뿐이다. 그래서 alias가 있고 callback이 없는
  계약(relay fixture)의 crate에 죽은 코드가 있었고, lint가 이를 deny한다. 이제 PHP는 Node처럼 `keepsThrown`이 성립할
  때에만 그것을 쓴다(U-3, GN-6z). member의 borrow 단언(GN-6h, I-2)은 함수 포인터 타입에서 `wait: blocking_io`의 `Io`
  토큰을 빼고 receiver `self`를 `&`로 썼다. 그래서 올바른 코어가 그 단언과 컴파일되지 않았다. 이제 단언은 receiver
  뒤에 토큰 자리의 `_`를 두고, receiver `self`를 class의 값으로 쓴다(GN-6m, GN-6o). `machine`과 class 매개변수를 가진
  Node 또는 WASM member는 코어에 매개변수의 guard를 주었다. 진입점이 guard의 borrow를 machine에는 없는 future에
  맡겼기 때문이다. 이제 진입점은 코어가 machine을 만들기 전에 borrow를 바인딩한다(GN-6ab). `make test-ts`로 검증:
  새 테스트 세 개가 각자의 텍스트 때문에 실패했고, 변경 후 409개 중 409개가 통과한다.
- `WORK` 없는 `make e2e`는 스크립트에 빈 `--work`를 주었고, 스크립트는 그것을 checkout의 루트로 해석했다. 그래서 실행이
  commit의 트리, 레포의 복사본, 빌드 디렉터리를 checkout 안에 썼다. `DEPS`가 있으면 그 빈 값이 `--dep`을 디렉터리로
  받기도 했다. 이제 `WORK`는 선택이다. recipe는 이름이 주어진 디렉터리에만 `--work`를 주고, 그것이 없는 실행은
  시스템 임시 디렉터리 아래에 디렉터리를 만들어, 끝날 때, 실패할 때, SIGINT와 SIGTERM을 받을 때 그것을 지운다. 실행의
  명령은 자기 프로세스 그룹에서 돌고 스크립트의 파이프 하나에 쓴다. 그래서 신호는 그 그룹을 멈추고, 마지막 프로세스가
  끝나 파이프가 닫힌 뒤에 디렉터리가 지워진다(GN-14, HR-87). 실행의 오류는 출력과 함께, 쓰인 순서대로 출력된다.
  end-to-end 검사는 각 바인딩 crate를 시험 feature로만 lint했다. 그래서 시험 feature의 진입점만 쓰는 import는 feature
  없는 빌드에서 쓰이지 않았는데도 어느 실행도 그것을 보지 못했다. 이제 검사는 각 바인딩 crate를 feature 없이도
  `-D warnings`로 lint하고, 두 lint를 target의 결과에 적는다(GN-14, GN-5). `scripts/e2e-work.mts`와
  `scripts/e2e-lint.mts`는 실행이 checkout에서 읽는 파일이다(GN-14b). `make test-ts`로 검증: 새 테스트는 두 모듈이
  없을 때 실패했고, 모듈이 있을 때 406개 중 406개가 통과한다.
- end-to-end 검사가 이 트리의 생성 crate를 처음으로 컴파일했고 여섯 가지 텍스트를 거부했다. PHP와 Node:
  `thrown_thread`가 스레드 번호를 `Err` 가지가 0을 주는 `match`로 읽었고, clippy는 이를 `manual_unwrap_or_default`로
  지적한다. 이제 `let ... else`로 읽는다(U-3, GN-6u). Python: 생성 코드가 cfg `pyo3_disable_reference_pool`을 읽는데
  어느 crate도 그것을 선언하지 않아 rustc가 거부했다(`unexpected_cfgs`). 이제 Python crate는 그 cfg를 선언하는
  `build.rs`를 갖고 manifest가 그것을 가리킨다(GN-3a, GN-6u). WASM: `caught`가 `async` 블록 하나를 감싼
  `impl Future`를 돌려주었고, clippy는 이를 `manual_async_fn`으로 지적한다. 이제 `async fn`이다(GN-6n). Go: callback
  unit이 있고 value alias가 없는 계약에서, package binding이 버퍼의 handle 목록을 읽었으나 Rust crate는 alias가 있는
  계약에서만 그 목록을 쓴다. 그래서 모든 호출이 "the encoded result does not follow the encoding of the binding" 또는
  `cgo.Handle` 오용으로 실패했다. 이제 Go는 crate가 목록을 쓸 때에만 그것을 읽는다(GN-6u). Go: 테스트가 optional
  callback을 fixture struct의 포인터로 주었고, interface의 포인터인 매개변수에 대해 `go vet`이 이를 거부한다. 이제
  테스트는 `ptr[<interface>](...)`를 준다(GN-6aa). Node와 WASM: 테스트가 options record 앞에서 생략하는 인자를
  빼 버려 record가 그 자리에 들어갔다. 이제 테스트는 그 자리에 `undefined`를 주고, 뒤쪽 인자만 빠진다(U-2, GN-6i).
  `make test-ts`로 검증: 새 테스트 여섯 개가 각자의 텍스트 때문에 실패했고, 변경 후 399개 중 399개가 통과한다.
- 쓰기 쪽 자리가 있는 class를 갖고 class를 인자로 받는 member가 없는 계약에서, 생성된 Node crate는 napi의
  `ClassInstance`와 `FromNapiValue`를 조건 없이 import했다. 그 둘을 쓰는 것은 feature `panic-test`의 poison 진입점뿐이어서,
  feature 없는 빌드에 쓰이지 않는 import가 남았고, 워크스페이스의 lint가 이를 deny한다. 이제 생성기는 그 진입점만 쓰는
  이름을 `#[cfg(feature = "panic-test")]` 아래의 `use` 줄에 쓰고, 다른 코드가 쓰는 이름은 조건 없는 줄에 둔다(GN-5,
  GN-4). Python, PHP, Go, WASM crate에는 그런 import가 없었다. `make test-ts`로 검증했다. 새 시험은 계약 10개의 생성
  crate 47개를 feature의 항목 없이 읽으며, shapes의 Node crate의 `ClassInstance`와 `FromNapiValue`, functions의 Node
  crate의 `ClassInstance`로 실패했다(393개 중 392개 통과). 변경 뒤에는 393개가 모두 통과한다.
- 시험의 디렉터리를 벗어나는 경로의 case 값(빈 경로, 절대 경로, `..` 부분)은 Go target 전체를 거부했고, Python, Node, PHP는 그 이유로
  실패하는 case 시험을 썼다. 이제 Go도 생성기가 쓰지 못하는 다른 case와 같이 그 실패하는 시험을 쓰므로, target의 나머지 시험은 쓰인다(G-4,
  GN-6y, GN-13e). `make test-ts`로 확인했다.
- 함수 타입이 있고 callback unit이 없는 계약의 바인딩이 컴파일되지 않았다. 함수 호출은 던져진 것을 `thrown`에 넘기는데,
  Node, Python, WASM은 callback unit이 있는 계약에만 `thrown`을 생성했고, PHP는 Closure 호출이 만드는 변형
  `Thrown::Php`를 뺐다. WASM은 그런 계약에 `Thrown`, `failure_error`, 실패의 필드 `thrown`도 생성하지 않았다. 이제 각
  target은 callback unit이나 함수 타입이 있는 계약에 이들을 생성한다(U-3, GN-6z). binding_core의 시험 파일
  `tests/native.rs`에 crate 수준의 `#![cfg(feature = "construct")]`가 있어서, 그 feature 없이 돌리면 시험을 하나도
  돌리지 않은 target이 통과했다. 이제 `required-features = ["construct"]`인 시험 target이다(HR-84).
  `tests/e2e/functions`와 `tests/e2e/sample`의 Rust 코어는 `make fmt-e2e`가 확인하는 rustfmt 꼴이다. `make test-ts`로
  검증: 335개 중 335개 통과.

- `only`가 있는 unit과 `core_type`이 없는 값 class의 규칙이 `wait: blocking_io`인 member의 규칙과 같은 id GN-6m을 썼다.
  `only`가 있는 unit의 규칙은 이제 명세, 코드, 시험에서 GN-6af다. 값 타입의 값이 아닌 언어의 값(`{"host": <종류>}`)을
  alias kind의 시험을 쓰는 Go가 거부했다. 이제 Go는 종류 `callable`, `date`, `object`에 `func() {}`,
  `time.Unix(0, 0).UTC()`, `struct{}{}`를 만든다(GN-13). PHP에 꼴이 없고 `case-test` 진입점도 받지 않는 case 값은 생성기가
  적지 못하는 다른 case와 같은 검사로 시험이 실패하며, 이유에 case와 member를 댄다(G-4, GN-13e). `make test-ts`로
  검증했다: 319개 중 319개가 통과했다.
- case가 errno 기호로 fault를 장전하자(`sample.tally`의 `EIO`) `tests/e2e/sample`의 e2e 실행이 Go와 WASM에서 실패했다.
  Go: 생성 시험이 errno를 `int64(syscall.<기호>)`와 비교했는데 `Errno()`는 `int`를 돌려주므로, `go vet`가 시험 파일을
  거부했다(타입 불일치). 이제 시험은 `int(syscall.<기호>)`와 비교한다. WASM: 생성 시험이 fault를 errno 기호와 함께
  장전하고 Node가 그 기호에 주는 값을 요구했는데, WASM의 target에는 errno가 없으므로 `__armFaults`가 장전을 kind
  `internal`로 거부했다. 이제 WASM 시험은 case와 `then` 호출의 fault를 `errno` 없이 장전하고, case가 기호를 적은
  자리에서는 errno가 없어야 한다고 요구한다(G-5). `packages/ts`의 `npm test`로 검증했다: 310개 중 310개가 통과했고, 두
  형태를 요구하는 시험이 그 안에 있다.
- `tests/e2e/classes`의 Node 바인딩이 컴파일되지 않았다(E0515, E0597): 호출이 receiver guard의 참조를
  (`let receiver = &*receiver;`) 묶은 뒤 guard를 `Gate.enter_later`(async_driver)의 future와 `Gate.enter_slowly`
  (blocking_io)의 pool closure로 옮겼으므로, future와 closure가 호출의 지역 변수를 빌린 참조를 쥐었다. 이제 future와 pool
  closure가 guard를 소유하고 그 안에서 참조를 묶는다(GN-6h). `tests/e2e/classes`의 `make e2e`로 검증했고, 그 기록은 증거이며
  모든 target에서 통과했다(PHP 생성 시험 60개와 contract case 4개, Python 58개와 4개, Node 63개, Go 27개, WASM 42개).
  `tests/e2e/sample`, `tests/e2e/shapes`, `tests/e2e/consumer`의 `make e2e`도 증거인 기록에서 모든 target이 통과했다.
- 수 타입의 Go parameter는 그 Go 타입의 값만 담아서, Go 바인딩은 `int` parameter 자리의 true, "7", 1.5처럼 다른 타입의
  host 값을 바인딩의 변환에 줄 방법이 없었고, 다른 target이 kind `invalid_number`로 거부하는 그런 값의 시험은 Go 형태가
  없었다. 이제 feature `codec-test`와 build tag `polyspec_codec_test`는 parameter의 수 타입마다 진입점
  `<prefix>__number_in` 위에 `internal/binding`의 `<Type>In(value any, subject string) error`를 주고, 진입점은 Go 값을 그
  수 타입의 변환으로 판정한다: 그 Go 타입의 값은 GN-12a의 범위를 거치고, 그 밖의 값은 kind `invalid_number`다.
  `zz_generated_codec_test.go`는 그런 타입마다 GN-13의 B-2 값을 확인하고, 끝에서 끝까지 확인은 `__number_in`을 가진 release
  라이브러리를 거부한다(GN-13g). `packages/ts`의 `npm test`로 확인했다.
- 생성기는 callback interface를 구현하는 class가 있는 계약의 Go 바인딩을 "a class that implements an interface is not
  generated for Go yet (GN-6w)"로 거부해서, `tail`을 구현하는 `tests/e2e/variants`의 class `ribbon`에는 Go 바인딩이 없었다.
  이제 Go는 class가 선언하지 않은 interface member마다 C ABI로 trait 메서드를 부르는 메서드를 class의 포인터에 주고,
  `var _ Tail = (*Ribbon)(nil)`로 단언하며, callback 자리에 있는 case의 인스턴스 값을 그 factory가 만드는 인스턴스로
  적는다(GN-6w, GN-13f). 그런 인스턴스 값의 class를 찾는 일은 이제 case 샘플의 함수 하나 `implementerInstance`이며, Go 시험과
  다른 target이 함께 쓴다. `packages/ts`의 `npm test`와 `tests/e2e/variants`의 생성된 Go module의 `gofmt`로 확인했다.
- 생성기는 variant unit이 있는 계약의 Go 바인딩을 "a variant unit is not generated for Go yet (GN-6v)"로 거부해서
  `tests/e2e/variants`에는 Go 바인딩이 없었다. 이제 Go는 variant를 module 패키지의 interface로 선언하고 그 유일한 method는
  unexported이며, 각 case를 그 interface를 구현하는 field들의 struct로 선언한다. 패키지의 함수 `encode<Variant>`와
  `decode<Variant>`는 case 번호와 field들을 쓰고 읽으며, case struct가 아닌 값은 수 2^64 - 1이고 C ABI가 kind
  `invalid_argument_type`으로 판정한다. C ABI는 wildcard 없는 case match로 variant를 바꾸고 field는 코어가 가진 대로 상자에
  담으며, Go 시험은 case 값을 그 case의 struct로 적는다(GN-6v). `packages/ts`의 `npm test`, 그리고 `tail`을 구현하는 class를
  뺀 `tests/e2e/variants`의 생성된 Go module의 `gofmt`로 확인했다.
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
- Go는 값이 준 func의 `cgo.Handle`을 디코더가 그 func의 node에 닿을 때만 지웠다. 그래서 그 앞에서 실패한 디코딩(Go
  형태가 없는 값, 잘못된 node)이나 호출자가 디코딩하지 않은 결과는 handle과 그 func를 남겼다. 이제 Rust가 Go에 주는 모든
  버퍼는 그 버퍼가 주는 handle의 목록으로 시작하고, func의 node는 그 목록 안 handle의 위치다. `invoke`와 callback의 인자는
  다른 무엇을 디코딩하기 전에 목록을 먼저 읽어 func를 꺼내고 handle을 모두 지운다(GN-6u).
- Node에서 다른 스레드가 drop한 `Native`는 그 owner의 다음 진입점에서야 해제되어, 더 부르지 않는 프로그램은 env가 끝날
  때까지 참조를 가졌다. 이제 owner는 표를 만들 때 unref한 threadsafe function을 만든다. 다른 스레드의 drop은 owner들의 lock
  안에서 그것을 부르고, 그 함수는 owner 스레드에서 대기열을 비운다. env cleanup hook은 generation을 올린 뒤 같은 lock 안에서
  그것을 abort하므로, 이전 generation의 drop은 아무것도 부르지 않는다(GN-6u).
- `Raised`는 handle만 가져서, 코어가 `Raised`를 돌려주지 않고 버리면 그 아래의 예외가 바인딩의 표에 남았고, 다른 스레드에서
  난 바인딩의 실패도 그 표에 남았다. 이제 `Raised`는 `Native`를 갖고(`Raised::from_generated(Native)`, `native()`), 그 마지막
  drop이 항목을 지운다(GN-6u). Python, Go, WASM은 drop에서 지우고, Node와 PHP는 던진 스레드에서 곧바로 지우거나, 다른
  스레드의 drop 뒤에는 그 스레드가 다음에 예외를 보관하거나 다시 던질 때 지우며, 스레드가 끝나면 그 대기열을 버린다. 다른
  스레드에서 난 바인딩의 실패는 그 `Raised`가 `BindingError`로 갖는다. `Raised::from_generated`는 `Handle` 대신 `Native`를
  받고 `handle()`은 `native()`로 바뀌었으므로, binding_core에 의존하는 모든 저장소의 생성 코드는 이 버전으로 다시 생성한다.
  그 전에 생성한 코드는 이 버전에서 컴파일되지 않는다.
- 언어 객체를 `native` 행으로 보냈다가 돌려받는 생성 시험이 없어서, 객체를 붙잡거나 잃는 바인딩도 통과했다. `native` out
  행이 있는 값 alias와 그것을 받아 그대로 돌려주는 함수가 있으면, 이제 각 target이 객체가 같은 객체로 돌아오는지와 바인딩이
  그 객체의 참조를 남기지 않는지 시험한다(GN-6u). Python은 `sys.getrefcount`와 `weakref`로, Node, PHP, WASM은 새 feature
  `native-count-test`의 진입점(`__nativeCount`, `Internal\nativeCount`)이 주는 owner 표의 개수로, Go는 살아 있는 handle의
  개수(`binding.NativeCount`, build tag `polyspec_native_count_test`)로 본다. 들어오는 Go func는 이제 정적 라이브러리가 세는
  `Native`다. end-to-end 확인은 feature 없이 빌드한 정적 라이브러리에 `__native_count`가 있으면 실패한다.
- `tests/e2e/functions`는 함수 타입을 Python에서만 확인했다. 이제 PHP, Node, WASM target도 선언하므로, end-to-end 확인이
  함수 타입을 받는 모든 target의 저장된 함수를 실행한다(GN-6z).
- WASM은 함수 타입을 받는 member를 거부했다(GN-6z). 이제 함수를 모듈의 한 스레드의 표에 있는 `Native`(GN-6u)로 갖고
  parameter를 TypeScript 함수 타입으로 선언한다. 함수가 아닌 값은 kind `invalid_argument_type`이다. WASM의 생성된 테스트는
  함수 fixture의 member 이름을 PHP 문자열로 썼는데, 이제 JavaScript 문자열로 쓴다.
- PHP는 함수 타입을 받는 member를 거부했다(GN-6z). 이제 Closure를 owner 표의 `Native`(GN-6u)로 갖고 `\Closure`로
  선언한다. 다른 스레드의 호출은 kind `wrong_thread`이며 feature `thread-test`의 `Internal\threadTest`가 그것을 보이고,
  Closure가 아닌 값은 kind `invalid_argument_type`이다. Node와 PHP에서 다른 스레드의 호출 중 바인딩의 실패는 모든 스레드가
  닿는 표에 `BindingError`로 남는다. 언어의 오류 객체는 owner 스레드에서만 만들어지므로, 호출이 실패할 때 owner가 그것을
  만든다.
- Node는 함수 타입을 받는 member를 거부했다(GN-6z). 이제 JavaScript 함수를 owner 표의 `Native`(GN-6u)로 갖고 parameter를
  TypeScript 함수 타입으로 선언한다. 호출은 owner 스레드에서 표의 env 안에서 실행되고, 다른 스레드의 호출은 kind
  `wrong_thread`이며, 새 feature `thread-test`의 진입점 `__threadTest`가 그것을 보인다. 함수가 아닌 값은 kind
  `invalid_argument_type`이다. 생성된 테스트는 case의 함수 값을 fixture의 call로 준다.
- 생성된 바인딩은 handle로 들어온 모든 언어 객체를 커지기만 하는 표에 두었다. Python과 WASM은 프로세스가 끝날 때까지,
  Node는 스레드가 끝날 때까지, PHP는 요청이 끝날 때까지 두었다. `Date`와 `Other` 값도 같이 두었고, Go는 func를 그 호출
  안에서만 다루었다. 이제 코어가 보관할 수 있는 언어 객체는 `Native`로 들어오고, 마지막 drop이 target의 규칙으로 그것을
  해제한다(GN-6u). Python은 `Py<PyAny>`를 갖고 `pyo3_disable_reference_pool`을 거부한다. WASM은 표의 key를 갖는다. Node와
  PHP는 owner, generation, key를 갖고, 다른 스레드의 drop을 owner의 대기열에 넣으며, 모든 진입점의 `guard`에서 대기열을
  비우고, env cleanup hook과 request shutdown에서 표를 해제하고 generation을 올린다. Go는 func의 `cgo.Handle`을 갖고 `out`
  마다 새 handle을 준다. `Date`와 `Other` 값은 호출 안의 순서로 번호가 매겨진 handle을 받는다. `tests/e2e/sample`의 data
  alias는 객체나 함수를 `Data::Native`로 갖고 모든 target에서 `native` 행으로 돌려준다. `generate.test.ts`가 target마다
  그 형태를 확인한다.
- binding_core는 코어가 보관할 수 있는 언어 객체(`HostValue::Object`, `HostValue::Callable`, `OutValue::Native`)를
  바인딩 표의 `Handle`로 주었고, 그 표는 모든 객체를 프로세스나 요청이 끝날 때까지 가졌다. 코어가 handle을 버린 때를
  바인딩에 알리는 것이 없었기 때문이다. 이제 그것을 `Native`로 준다. `Native`는 객체로 같음을 판정하는
  `Arc<dyn NativeObject>`이고, 코어가 마지막 것을 drop하면 바인딩이 그 객체 대신 가진 것을 해제한다(B-1, U-7 (d)).
  `HostValue::Object`의 field 이름은 `native`다. `tests/native.rs`는 같음, 복제, 다른 스레드에서의 해제를 확인한다.
  `make test-rust lint-rust`로 확인했다.
- `tests/e2e/functions`의 `registry.call`처럼 receiver가 보관한 언어 코드를 부르는 member는 코어가
  `Result<T, Failure<E>>`를 돌려주는데도, 코어 오류가 `E`인 것처럼 생성되어 바인딩 crate가 컴파일되지 않았다(E0308).
  이제 계약은 그런 member를 `core.failure: true`로 적고, 생성 코드는 그 오류를 callback을 받는 member의 오류처럼 변환한다.
  `binding check`는 receiver가 언어 코드를 보관하지 않는 member의 `core.failure: true`, callback이나 함수를 받는 member의
  `core.failure: false`, `core.result: false`와 함께 쓴 `core.failure: true`를 거부한다(E-1c, GN-7, CK-21).
  `packages/ts`의 `npm test`로 확인했다.
- 다른 타입 안(list의 항목, `optional`, record parameter의 field)에 callback을 가진 parameter는 모든 target에서
  거부되었다("the type {"unit": ...} is not generated yet"). 이제 각 target은 그런 callback을 `Box<dyn <core trait> + 'a>`로,
  그것을 담은 list, `optional`, record를 값으로 코어에 준다. `'a`는 Node에서 `'env`, 다른 곳에서 `'static`이다. callback
  field를 가진 record의 코어 타입은 그 lifetime을 가지며, 그런 record는 record parameter가 아닌 자리에서 이름으로
  거부한다(GN-6aa). 생성된 시험은 다른 값 안의 callback 값을 fixture의 객체로, 또는 그 callback을 구현하는 class의 인스턴스
  값으로 준다. `tests/e2e/sample`은 `sample.first`(list), `sample.maybe`(`optional`), `sample.seek`(record field)를
  가진다. `packages/ts`의 `npm test`로 확인했다.
- 함수 값 `{"function": [<행>]}`을 준 case는 생성기를 "no case value of the type"으로 멈추게 했다. 이제 Python 시험은
  그것을 호출 자체의 fixture로 주고 호출 뒤에 그 호출 기록을 읽는다. `then` 호출의 인자처럼 다른 값 안에 있으면 그런
  fixture의 호출 가능한 객체로 준다. 또 호출 가능하지 않은 값이 kind `invalid_argument_type`인지 확인한다(G-5, GN-6z).
  `tests/e2e/functions`는 코어가 호출 중에 함수를 부르고(`functions.apply`) class 안에 함수를 보관하는(`registry.register`,
  `registry.call`) Python 저장소다.
- 함수 타입 parameter를 가진 member는 모든 target에서 거부되었다("the type {"function": ...} is not generated yet").
  그래서 template `engine.register` 같은 member가 있는 계약은 어떤 target도 생성되지 않았다. 이제 Python은 그것을
  생성한다. 코어는 `Box<dyn Fn(<parameter>…) -> Result<R, binding_core::Failure<E>> + Send + Sync>`를 값으로 받고, 호출
  가능한 객체는 들어올 때 판정되며(kind `invalid_argument_type`), 호출은 인자를 내보내고 결과를 들이며, Python 코드의
  예외는 `Raised`로 코어에 간다(GN-6z). Node, PHP, WASM은 binding_core에 native 수명이 생길 때까지 이름으로 거부하고, Go는
  거부한다. callback member와 함수 타입은 빌린 parameter의 규칙 하나를 함께 쓴다(T-1). `packages/ts`의 `npm test`로
  확인했다.
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
- 콜백을 받는 함수처럼 언어 코드에 닿는 `wait: async_driver` member는 "a member with wait async_driver that reaches
  language code is not generated"로 거부되었다. runtime이 자기 스레드에서 poll하는 future는 그 스레드에서 언어 코드를
  부르게 되기 때문이다. 이제 그런 member는 `core`에 `"machine": true`를 적고, 그 코어 경로는 I/O 없는 state machine인
  `binding_core::machine::Machine`을 돌려준다. 그 단계는 언어 코드에 닿지 않는 I/O future, 언어 코드의 call, 결과다.
  PHP는 호출 스레드에서 machine을 돌리고, Python `<name>`은 각 기다림을 GIL 밖에서 하며 machine을 돌리고 `a<name>`은
  `<name>`을 `asyncio.to_thread`에서 돌린다. Node는 JavaScript 진입이 진행시키는 `Driven` 객체를 돌려주며, 각 call은
  JavaScript 스레드에서, 각 기다림은 napi의 tokio runtime에서 한다. `binding check`는 `machine`이 없는 그런 member와 다른
  member의 `machine`을 보고한다(CK-68). 생성기는 machine이 receiver를 빌리게 될 `machine`이 있는 method를 거부하고, Go와
  WASM은 `async_driver`인 모든 member와 함께 이를 거부한다(GN-6ab). `make test-ts`와 `make test-rust`로 확인했고,
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
- receiver나 parameter가 class인 `wait: async_driver`
  WASM member는 guard의 참조를 future 밖에서 묶었는데, future는 그 guard를 소유하지 않는다. 이제 Node의 future처럼 future가
  guard를 소유하고 참조를 그 안에서 묶는다(GN-6h, GN-6n). case의 함수 값의 행은 값이 넷이고 callback fixture의 행은
  다섯이어서, fixture 객체가 없는 값을 던질 오류로 읽었다. 이제 함수 행도 오류가 아닌 다섯째 값을 가진다(GN-13, GN-6z).
  `core`가 `value`인 parameter는 코어에 `(*<자리>).clone()`을 주고, 다른 모든 class parameter는 그 참조의
  `CoreForm::core_form`을 준다(GN-6h). 중첩 variant `<바깥>/<안쪽>`은 `errors.code` 아래에서도 `library`를 적은 의존 레포의
  행이고(GN-7c), 그 match와 단언은 `errors.code`의 투영을 읽는다(GN-7b). `library`가 없는 중첩 variant는 계속 이름을 대어
  거부한다. `make test-ts`로 검증했다.
- `tests/e2e/classes`의 Go C ABI가 `panic-test` 없이 빌드되지 않았다. poison 진입점이 쓰기 쪽 자리가 있는 모든 class에 갈래를
  두었는데, Go가 만들지 않는 `lease`도 그랬고, 그 갈래만 쓰는 `held_lease`가 feature가 꺼지면 쓰이지 않았다. 이제 진입점은
  Go poison 시험처럼 Go가 생성자나 static member로 만드는 class만 받고, 그런 class가 없는 패키지에는 진입점이 없다(GN-6h).
  `tests/e2e/classes`의 `make e2e`로 확인했다: 모든 target이 통과했고 go는 시험 27개다. `packages/ts`의 `npm test`로도
  확인했다: 289개 중 289개 통과.
- `make e2e`가 `go test -json`을 그 `build-output` 사건 없이 읽었다. 그래서 link에 실패한 Go 패키지는 linker 출력 없이
  "go test failed the packages …"로만 적혔다. 이제 `scripts/go-test-events.mts`가 사건을 읽고, 각 빌드의 출력을 찍고 원인에
  그것을 적는다(GN-14a). `packages/ts`의 `npm test`로 확인했다: 289개 중 289개 통과이고,
  `tests/go-test-events.test.ts`의 시험 두 개가 그 안에 있다. 그 뒤의 e2e 실행에는 빌드되지 않는 Go 패키지가 없었다.
- `binding scaffold`는 플랫폼 패키지 `<npm 패키지>-<platform>`을 자기 버전으로 `package.json`의 `optionalDependencies`에 썼고, `binding check`는 손으로 쓴 host `package.json`에 그것을 요구했다(CK-19). 그래서 npm workspace의 lock은 그 버전의 release 전에는 그것을 담을 수 없었고 `npm ci`가 manifest를 거부했다("Missing: @polyspec/hyper-darwin-arm64@ from lock file"). 이제 source manifest와 workspace lock은 그것을 적지 않는다. 배포 도구가 pack하는 manifest의 `optionalDependencies`에 그 release의 버전으로 적는다(GN-3b, GN-3c). end-to-end 검사는 플랫폼 패키지와 패키지를 두 tarball로 설치하므로, 진입점은 그 필드 없이 addon을 찾는다. `make test-ts`(시험 291개)로 검증했다.
- `binding check`는 손으로 쓴 host `package.json`(L-2a)에서 이름, `files`, 플랫폼 패키지만 읽었다. 그래서 release가 읽는
  `"type"`, `napi.binaryName`, `napi.targets`(kit K1189)가 없는 host 패키지도 검사를 통과했다. 이제 이 세 항목도 읽고, 각각을
  GN-3c의 값과 깊이 비교하며, 없거나 다른 항목은 그 값과 함께 이름을 적는다. 예: `CK-19 napi.targets is missing, not
  ["x86_64-unknown-linux-gnu","aarch64-unknown-linux-gnu","aarch64-apple-darwin"]`. host PHP 확장의 `composer.json`은
  scaffold가 쓰므로 `php-ext.download-url-method`를 포함해 파일 전체를 비교한다(GN-3b, CK-19). `make test-ts`(시험 291개)로
  검증했다.
- `binding scaffold`는 `napi.binaryName`, `napi.targets`, `type`이 없는 `package.json`과,
  `php-ext.download-url-method`가 없는 PHP 확장 `composer.json`을 썼다. 그래서 kit의 배포(K1189)가 npm-native 패키지를
  ("names no napi.binaryName")와 php-ext 패키지를("lists no pre-packaged-binary in php-ext.download-url-method") 거부했고,
  Node는 WASM의 ES 모듈 글루를 `MODULE_TYPELESS_PACKAGE_JSON` 경고와 함께 읽었다. 이제 target `node`를 가진 라이브러리의
  `package.json`은 scope 없는 npm 이름인 `napi.binaryName`과, Rust triple `x86_64-unknown-linux-gnu`,
  `aarch64-unknown-linux-gnu`, `aarch64-apple-darwin`인 `napi.targets`를 적는다. scaffold가 쓰는 모든 `package.json`은
  `"type": "module"`을 갖고, PHP 확장(`<host package>-native`도)의 `composer.json`은 `php-ext.download-url-method`
  `["pre-packaged-binary"]`를 적는다. `binding check`는 각 파일의 일부로 이것을 비교한다(GN-3c, CK-19). `make test-ts`
  (시험 291개)로 확인했다.
- 생성기는 타입 `path`를 "the type path is not generated yet"로 거부했다. 그래서 `host_options.files: optional<path>`
  같은 path를 가진 member나 record field에 바인딩이 없었다. 이제 `path`는 Python, Node, PHP, Go에서 모든 자리에 OS
  경로의 바이트이고, 코어는 `&Path`를 받고 `PathBuf`를 준다. Python은 `str`, `bytes`, `os.PathLike`를 `os.fsencode`로
  받고 `os.fsdecode`한 `str`을 준다. Node는 string을 그 UTF-8로, 또는 `Uint8Array`를 받고, string을 주되 UTF-8이 아닌
  바이트에는 `Uint8Array`를 준다. PHP와 Go는 그 바이트의 string을 받고 준다. NUL 바이트, `os.fsencode`가 인코딩하지
  못하는 Python `str`, Windows에서 UTF-8이 아닌 바이트는 kind `invalid_path`이고, 짝 없는 surrogate가 든 Node string은
  kind `invalid_text`이며, 그 밖의 값은 kind `invalid_argument_type`이다. 새 함수 `binding_core::path_from_bytes`와
  `binding_core::path_bytes`가 모든 target의 바이트를 바꾼다. WASM은 path를 이름으로 거부한다. 계약이 그런 member를
  WASM에서 빼기 때문이다(CK-15). path의 case 값은 상대 경로이고, 생성된 시험마다 자기 임시 디렉터리에서 풀고 지운다.
  빈 경로, 절대 경로, `..` 부분은 이름으로 거부한다(GN-6y). `tests/e2e/shapes`에 함수 `joined`와 `parent_of`가 있다.
  `packages/ts`의 `npm test`(시험 290개), `make test-rust-features`(시험 64개, 그 가운데
  `binding_core::path`의 3개), `make test-rust-plain`(시험 46개), `make clippy-rust`, `make clippy-rust-features`,
  `make fmt-rust`로 확인했다.
- 기본값이 있는 optional 타입 field의 결과 형태를 spec에 적은 커밋(GN-6i)에는 optional 타입 기본값의 Green 일부(`defaults.ts`, `model.ts`,
  `node.ts`, `php.ts`, `python.ts`, `wasm.ts`)도 들어 있다. patch를 stage한 것이 그 커밋에 함께 들어갔고, 나머지는 optional 타입, enum, 값 타입의
  기본값을 생성하는 커밋에 있다.
- 생성기는 `optional` 타입의 기본값을 "a default of an optional type is not generated yet (U-2)"로, enum의
  `{literal}` 기본값과 값 타입의 `{literal: null}` 기본값을 "a {literal} or {const} default names the constant of the
  core in default_core (U-2)"로 거부했다. 그래서 `format_options.delimiters: optional<text> = {literal: null}` 같은
  record field, `optional<uint> = {computed}` field, `= {literal: "indent"}` enum field, parameter
  `assign: template_value = {literal: null}`에 바인딩이 없었다. 이제 `{literal: null}`이나 `{computed}`인 optional
  타입의 기본값은 그 타입 자신의 `Option<T>`다. 바인딩은 생략된 값에도 null에도 `None`을 넘기고, Go는 포인터 `*T`
  하나를 그대로 쓰며, member가 돌려주기도 하는 record는 `None`에 언어의 null을 준다. enum의 `{literal}` 기본값은
  `default_core`에 상수를 적고, crate는 그것이 그 값의 variant임을 `matches!`로 단언한다. 값 타입의
  `{literal: null}` 기본값은 상수 없이 `None`을 넘긴다. 명시한 null이 거부됨을 보는 시험은 null을 값으로 받는
  optional과 값 타입을 제외한다(GN-6i, GN-13d, GN-15e). `tests/e2e/shapes`에 이 기본값들을 가진 함수 `pad`가,
  `tests/e2e/sample`에 함수 `describe`가 있다. `packages/ts`의 `npm test`(시험 289개)로 확인했다.
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
- end-to-end 검사의 레포의 Rust 코어(`tests/e2e/*/packages/rust`)는 확인된 형식이 없었다. `fmt-rust`가
  `binding_core`만 읽었기 때문이다. `lint-rust`와 CI의 `rust` job의 대상인 `make fmt-e2e`가 rustfmt의 기본값으로 그것을
  확인하며, 네 코어는 이제 그 형식이다.

- `raises`가 `EIO` 같은 errno 기호를 적는 case의 PHP 시험은 거부되었다("the errno symbol EIO is not compared in PHP
  yet"). PHP에는 그 기계의 errno 기호 표가 없기 때문이다. `binding_core::errno::value`가 feature 없이, Unix에서 `libc`를
  의존으로 하여, fault를 장전하는 표에서 기호의 값을 준다. 모든 계약의 PHP 확장은 모든 시험 빌드가 켜는 feature
  `panic-test`에서 그것을 `Internal\errnoOf`로 주며, PHP 시험은 Python, Node, Go가 자기 언어의 값과 비교하듯이 fault
  주입점이 없는 계약에서도 실패의 errno를 그것과 비교한다(GN-8a). end-to-end 검사는 시험 feature로 빌드한 확장에서
  `errno_of`를 찾은 뒤, feature 없이 빌드한 PHP 확장에서 `llvm-nm`이 시험용 진입점을 찾으면 실패한다. sample의 tally case는 다시 `EIO`를 적는다.

- `then` 호출의 두 꼴(GN-13f)에는 단위 시험만 있어서, 어느 꼴의 생성된 시험이 target에서 통과하는지를 보인 실행이
  없었다. end-to-end sample `tests/e2e/sample`이 이제 둘을 모두 담는다. `counter.tally`는 fault `sample.tally`를 장전하고
  그 실패 `unreadable`을 `counter.settle`에 남기며, settle의 case는 `then`의 호출에서 그 fault를 장전한다. 그리고
  `shelf.slip`이 만든 slip의 `slip.read`는 `"on": "receiver"`를 가진 호출 `shelf.clear` 뒤에 `missing`으로 실패한다.
  fault 주입점이 없는 계약의 시험은 tally의 case 가운데 fault를 장전하는 것을 뺀다.

- 앞선 호출의 실패가 뒤의 호출이 내도록 남기는 kind와, 인스턴스를 꺼낸 인스턴스의 호출 뒤에만 닿는 kind에는 case
  꼴이 없었다. 그래서 그런 kind를 내는 계약은 CK-22를 통과할 수 없었다. case의 장전은 자기 호출에만 걸리고, `then`의
  모든 호출은 인스턴스 자신에 불렸기 때문이다. 이제 `then`의 호출은 `faults`를 가질 수 있다. 그것은 그 호출 바로 앞에서
  그 호출의 member에 장전되고 바로 뒤에서 발동했음이 요구된다. 또 `"on": "receiver"`를 가질 수 있다. 그것은 pick 뒤에 값의
  `receiver`의 class의 메서드를 그 receiver에 부른다(GN-13f). `binding check`는 두 키를 받는다. 그런 호출의 faults는
  case의 faults이고, 그것이 기대하는 실패는 그 점들의 kind이며, 인스턴스 값이 fault를 장전하는 case는 그 점들의 kind만
  채운다(CK-22). PHP, Python, Node, WASM의 시험은 그 호출의 fault를 장전하고 확인하며(WASM은 시험 전의 hook이 읽는 glue
  module로), Go는 그런 시험을 fault를 장전하는 case와 함께 두고 그 goroutine을 thread에 고정한다. 아무 receiver나 필요한
  시험은 fault를 장전하는 receiver를 쓰지 않는다.

- callback unit은 있고 class unit은 없는 계약의 Go C ABI가 컴파일되지 않았다(`tests/e2e/consumer`에서 E0425 `Table`,
  E0433 `Arc`). 생성기는 도우미 이름이 코드의 단어로 나오면 쓰인 것으로 셌기 때문에, method 호출
  `lock(&THROWN).insert(handle, error)`가 class unit의 `Table`과 `Arc`를 적는 table 도우미 `insert`를 끌어들였다. 이제 도우미와
  이름이 같은 method(`.insert(`)는 그 도우미를 쓰는 것이 아니며, 모든 target이 `usedHelpers`로 도우미를 고르므로 다섯 target에
  같이 적용된다(GN-4). `make test-ts`로 검증했다: 293 통과.
- 다른 레포의 callback unit을 받는 class나 member를 언어 코드에 닿지 않는 것으로 판정했다. 언어 코드를 담는 타입의 계산(GN-6h)이
  다른 레포의 모든 타입에 false를 돌려주어서, 그런 callback을 받는 wait `blocking_io`나 `async_driver` member가 생성되었고 그
  class의 lock도 그것을 세지 않았다. 이제 그런 callback unit은 언어 코드를 담으므로 lock이 그것을 세고, 그것을 받는 `async_driver`
  member는 "a member with wait async_driver that reaches language code is not generated"로 거부되며, 그것을 받는
  `blocking_io` member는 언어 코드에 닿는 member로 생성된다(GN-6s). `make test-ts`로 검증했다.
- 다른 레포의 callback unit을 parameter로 받는 member(unit의 origin이 `callback`인 `{unit, library}` 타입)는 어떤 target도
  생성되지 않았다. "the type ... is not generated yet"으로 거부되었기 때문이다. 이제 PHP, Python, Node는 언어 객체를 소유 레포의
  코어 trait 구현으로 감싸고, 그 method는 `binding_core::Failure<<소유 레포 오류>>`를 돌려준다. 선언은 소유 패키지의 타입을
  적는다. PHP는 소유 namespace의 interface, Python은 소유 패키지에서 가져온 Protocol, TypeScript는
  `import("<소유 npm>").<이름>`이다. Go와 WASM은 그런 parameter를 이름으로 거부하고, id가 이 계약의 unit과 같은 callback unit도
  거부한다(GN-6s). `make test-ts`로 검증했다.
- 코어가 의존 레포의 kind를 그대로 전달하는 계약(E-1b (a))은 어떤 target도 생성되지 않았다. `errors.kinds`의 그런 행마다 "a kind of
  another library (E-1b (a)) is not generated yet"으로 거부되었기 때문이다. 이제 그런 행은 `<바깥>/<안쪽>`을 적는다. 바깥은 그
  라이브러리의 오류를 담은 코어 오류의 variant이고 안쪽은 그 오류의 variant이며, member는 `raises`에 같은 경로를 적는다. 모든
  target은 코어 오류의 클래스·property match와 `raises`의 단언에서 그것을 `<바깥>(<안쪽> { .. })`로 맞추고, category는 라이브러리
  계약에서 `<안쪽>` 행의 것이며, 그런 kind만 내는 member는 코어를 실패할 수 있는 호출로 부른다. schema는 `errors.kinds`와
  `raises`에서 그 경로를 받고, 계약 검사는 `library`가 있는데 `<바깥>/`이 없는 행과 `library`가 없는데 그것이 있는 행을 보고한다
  (CK-10, GN-7c). `packages/ts`의 `npm test`로 검증했다.
- origin이 `host`인 unit이 있는 계약은 어떤 target도 생성되지 않았다. host class와 host functions unit은 "a host class unit is not
  generated yet"과 "a host functions unit is not generated yet"으로 거부되었고, host record의 field는 생성 record의 것처럼
  판정되었다. 이제 생성기는 어느 target에도 host unit을 쓰지 않는다. 그 소스가 선언이고 host 패키지가 그것을 내보내기 때문이다.
  타입에 host unit을 적는 생성 unit은 그 이유로 거부한다(GN-6ag). `packages/ts`의 `npm test`로 검증했다.
- visibility가 `internal`인 unit이 있는 계약은 어떤 target도 생성되지 않았다. 그런 unit마다 "an internal unit is not generated
  yet"으로 거부되었기 때문이다. 이제 internal unit은 같은 kind의 public unit처럼 생성되고 공개 API가 아니라고 표시된다. PHP stub과
  Node·WASM 선언에는 `@internal`이 있고, Python 이름은 어느 `__all__`에도 없으며(루트 module은 `<root>._root`에, 다른 module `m`은
  `<root>._m`에 둔다), Go doc comment에는 U-1의 문장이 있다. 생성기가 public처럼 생성하던 public unit의 internal member는 이름을 대고
  거부하며, 계약 검사는 internal unit의 예약어를 판정한다(CK-23)(GN-6r). `packages/ts`의 `npm test`로 검증했다.
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
- `codec-test`의 진입점(`in_raises`, GN-5)이 있는 값 alias의 결과는 alias의 행을 거쳐 돌아온다(GN-13e, U-1). 각 target은
  진입점 `_alias_round_<alias>`(Python), `__aliasRound<Alias>`(Node, WASM), `<namespace>\Internal\aliasRound<Alias>`(PHP)를
  생성한다. 이 진입점은 값을 alias의 in 함수로 받고 core 값을 out 함수로 돌려준다. case의 시험은 그것이 돌려준 값의
  텍스트가 결과의 텍스트와 같기를 요구한다. 전에는 out 방향만 비교했으므로, in 함수가 거부하거나 다른 값으로 읽는 결과도
  시험을 통과했다. `codec-test`의 진입점이 없는 값 unit의 왕복은 열린 항목으로 남는다(GN-13a). `make test-ts`(시험 276개)로
  확인했다. php-serialization의 생성 시험은 결과를 주는 case 601개 각각에서 Python, Node, WASM, PHP 모두 이 진입점을 부른다.
- 값 alias인 결과(GN-13e)는 그 자리들을 전위 순서로 적은 텍스트로 비교하며, 양쪽 모두 반복문이 쓴다. 생성기는 case 값의
  텍스트를 alias의 out 행으로 쓴다. 자리의 kind와 predicate(`utf8`, `safe_integer`, `integral_float`, `sequence_keys`)에
  맞는 행과 그 언어 형태다. 시험은 결과의 텍스트를 각 자리의 타입으로 helper `tokens`(Node, WASM, PHP)나
  `_tokens`(Python)로 쓴다. 텍스트는 형태와 동일성을 적는다. out 행이 `<unit>.constructor`로 적는 class(생성자가 값 하나를
  받고 그 이름의 property가 그것을 돌려준다)의 인스턴스, PHP `stdClass`, PHP reference는 첫 자리로 번호를 받고 뒤에서는 그
  번호로 다시 적힌다. 전에는 out 행이 그 kind의 내장 형태가 아닌 형태(bytes에 text, `bigint`, 값 class, map에 list,
  `stdClass`)를 만드는 결과는 비교하지 않는다는 이유로 시험이 실패했다. `make test-ts`(시험 275개)로 확인했고, PHP로도
  확인했다. 결과를 주는 php-serialization의 case 601개 각각의 data를 PHP 자신의 `unserialize`가 읽은 값의 텍스트가 생성기가
  쓰는 텍스트와 같다.
- 값 타입의 값이 아닌 언어의 case 값은 닫힌 표의 `{"host": <종류>}`다(G-5, GN-13). 종류는 `callable`, `date`, `object`이며,
  Python은 `lambda: None`, `datetime.date(1970, 1, 1)`, `object()`로, Node와 WASM은 `() => null`, `new Date(0)`,
  `new (class Other {})()`로, PHP는 `static fn (): null => null`, `new \DateTimeImmutable('@0')`, `new class {}`로
  만든다. 명세는 Go에 `func() {}`, `time.Unix(0, 0).UTC()`, `struct{}{}`를 주며, Go의 alias kind 시험은 여전히 이름을 대고
  거부한다(U-7). 64비트 밖의 정수를 가진 PHP case 값은 10진 token(`HostValue::Number`)으로 feature `case-test`의 진입점을
  지나며, member의 case에도 alias의 case에도 그렇다. 전에는 alias의 `{"host": ...}` case가 모든 target의 생성을 거부했고,
  PHP는 64비트 밖의 정수에서 생성을 거부했으므로, 그런 alias의 case는 어느 생성 시험에도 없었다. `make test-ts`(시험
  274개)로 확인했다.
- case 규약(G-5)이 객체에 동일성을, 참조에 자기 값 안의 자리를, JSON reader가 받는 것보다 깊이 중첩된 객체에 형식을
  준다. `reference`는 그 id의 첫 자리에서 `{"id": n, "value": ...}`를, 뒤의 모든 자리에서 `{"id": n}`을 담는다.
  `"id": n`을 가진 `object`는 뒤의 자리에서 `{"kind": "object", "id": n}`으로 부른다.
  `{"kind": "object", "repeat": n, "key": <key>, "value": <값>}`은 n개의 객체이며, 각 객체는 그것을 감싸는 객체의 유일한
  property `key`다. 전에는 두 번 담긴 stdClass, 참조의 순환, PHP가 읽는 가장 깊은 객체의 case에 값이 없었다. 생성된 case
  값은 id마다 하나를 내용 없이 만든 뒤 채우며, 이것을 PHP closure, Python의 대입식 tuple, Node와 WASM의 화살표 함수 안에서
  한다. 그래서 첫 자리 안의 뒤 자리가 순환을 만든다. 되풀이되는 객체는 바깥부터 만들므로 어떤 생성자도 그 안의 객체를
  다시 판정하지 않고, PHP는 `(object)`로 가장 안쪽부터 만든다. case-test 진입점은 id를 가진 객체의 handle을 값보다 먼저
  잡고, 참조의 뒤 자리를 그 동일성으로 기술한다. id의 값을 되풀이하는 뒤 자리는 이름을 대고 거부한다. `make test-ts`(시험
  273개)로 확인했다.
- Python, Node, WASM의 case 값은 reference의 자리마다 reference class(GN-6af)의 새 인스턴스를 만들었다. 그래서 같은 id의
  두 자리가 reference 둘을 가졌고, case가 공유된 reference 하나를 적는 곳에서 `serialize`는 값 둘을 썼다(G-5: 같은 id는
  같은 reference다). 이제 값은 id마다 인스턴스 하나를, 그것을 담는 값보다 먼저, 각 인스턴스에 이름을 붙이는 식 안에서
  만든다. Python은 `(r0 := pkg.Reference(...), [r0, r0])[-1]`, Node와 WASM은
  `(() => { const r0 = new pkg.Reference(...); return [r0, r0]; })()`이다. `make test-ts`(시험 273개)로 확인했다.
- Python, Node, WASM의 생성 시험에는 `core_type`이 없는 value class(GN-6af)의 시험이 없었다. 그 생성자와 property가
  시험이 부르는 member에 들어 있지 않아, 그 case는 어느 target에서도 실행되지 않았다. 이제 이것들은 class의 member의
  시험을 가진다(GN-13). 실패하는 case마다 B-4, 그 밖의 case마다 GN-13e이며, property는 생성자가 case의 키로 만든
  인스턴스에서 읽고, 인자를 쓴 방식으로 쓴 값과 비교한다. property는 생성자가 받은 언어 값을 주기 때문이다(Node의 int는
  number로 남는다). G-7을 포함한 parameter의 시험도 가진다. primitive(N-4, Node와 WASM의 `valueOf`)는 실패하지 않는
  case마다 시험을 가지며, 그 시험은 `Number(instance)`를 case의 `result`와 `assert.strictEqual`로 비교하고, case가
  `result`를 주지 않으면 수 형태만 얻는다. 전에는 그 case가 어디서도 실행되지 않았다. case의 float `-0`은 음의 영(`-0`,
  `-0.0`)으로 쓴다. 전에는 `0`으로 썼다. 명시한 null이 거부되는지 보는 시험은 기본값이 `{literal: null}`인 parameter에는
  쓰지 않는다. 그 null이 선언된 값이기 때문이다(GN-13d). `make test-ts`(시험 272개)로 확인했다.
- 값이 배열이나 property의 자리가 아닌 reference인 case(예: `serialize`의 맨 위 값)의 PHP 시험은 `self::fail`로 실패했다.
  어떤 PHP 호출도 그 값을 줄 수 없어서, 코어의 거부가 PHP에서 한 번도 실행되지 않았다. 이제 그런 case는 feature
  `case-test`의 진입점 `<namespace>\Internal\caseTest<n>`으로 실행한다. 진입점은 PHP가 기술할 host 값으로 그 값을 만들어
  alias의 `in` 함수에 주고, 시험은 case의 클래스와 kind를 요구한다. binding scaffold는 그런 case가 있는 계약의 PHP crate에
  `case-test = []`를 쓰고, 종단 검사는 `llvm-nm`으로 feature 없이 빌드한 확장에 그 진입점이 없고 feature를 켠 확장에는
  있음을 요구한다(GN-13, GN-5). 다른 kind의 인자를 받는 Go의 case는 C ABI에 같은 진입점이 필요하며, Go 생성기가 생성한다.
  `packages/ts`의 `npm test`로 확인했다.
- PHP 확장은 라이브러리 클래스가 상속하는 PHP 클래스가 없을 때("B-4: the class {name} is missing")와 라이브러리 클래스가
  등록되지 않았을 때 panic했다. 그래서 `clippy::panic`을 deny하는 레포는 바인딩의 clippy에서 실패했다. 이제 startup은 무엇이든
  등록하기 전에 라이브러리 클래스가 상속하거나 구현하는 PHP 클래스를 모두 찾고, 없는 클래스가 있으면 module 시작이
  실패한다(GN-10). 모든 target에서 일부러 panic하는 panic 시험 진입점은 B-7을 이유로 적은 `#[allow(clippy::panic)]`를
  가지므로, 다른 모든 항목에는 deny가 유지된다(GN-5). `packages/ts`의 `npm test`와, feature `panic-test`와 `fault-test`를
  켠 php-serialization 바인딩 crate들의 clippy로 확인했다.
- `only`가 있는 unit과 `core_type`이 없는 origin `value`의 class는 거부되었다("only and native are not generated yet").
  그래서 php-serialization의 `StdClass`와 `Reference`처럼 value alias가 그런 class를 만드는 계약은 어떤 target도
  생성되지 않았다. 이제 `only`가 있는 unit은 그것이 적은 target에만 생성한다. Python, Node, WASM은 그 class를 받은 값을
  보관하는 언어의 class로 생성한다. constructor는 기술한 인자로 코어의 검사 함수를 부르고, 쓰기 가능한 property는 그
  값을 바꾸며, alias의 in 행은 walk마다 identity가 있는 instance를 기술하고 `read`는 보관한 값을 주며, out 행은 내용보다
  먼저 instance를 만든다. class의 primitive hook은 Node와 WASM에서 `valueOf`다(GN-6g). PHP binding은 이제 형식
  `php_reference`를 reference로 만들고, `php_object`를 어떤 바이트든 담은 property 이름으로 만들며, bytes 배열 key를
  만들고, 객체와 reference를 그 handle의 모든 위치에서 한 값으로, 순환까지 만든다. reference가 있는 PHP case 값은
  closure 안에서 만들며, reference에 PHP 자리가 없는 case는 target을 거부하는 대신 그 이유로 시험이 실패한다(GN-6af,
  GN-13). lock이 없는 class의 property는 lock 없이 읽고, 큰 정수는 napi 3의 BigInt로 만들며, 생성한 Node와 PHP 코드는
  계약에 callback이 없으면 `thrown` 함수와 `Thrown::Php` variant를 두지 않는다. `-D warnings`가 그것들을 dead code로
  거부했기 때문이다. `packages/ts`의 `npm test`와 php-serialization의 네 binding crate의 clippy로 확인했다.
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
- 어떤 실행도 json 값을 json 소비자로 변환하지 않았으므로 json의 `value_in`과 `value_out`은 어느 언어에서도 실행되지
  않았고, `go.mod`는 다른 레포의 Go module을 그 record에 대해서만 require했으므로 json의 값 class를 이름하는 계약의 Go
  바인딩은 자기 module이 require하지 않는 json 패키지를 import했다. `tests/e2e/relay`가 그 소비자다. 그 함수 `carry`는
  옆의 path 의존인 json의 값 class를 받고 주며, Node, WASM, Python, PHP, Go의 case runner는 짝 없는 surrogate, 짝지은 쌍,
  섞인 text, 짝 없는 surrogate를 가진 key, 큰 정수 token, 모든 kind의 문서, 깊이 한계 256의 값에 대해 돌아온 값의 text를
  들어간 값의 text와 비교한다. 이제 `go.mod`는 계약이 record나 값 class를 이름하는 라이브러리마다 그 Go module을 require한다.
  실행은 `tests/e2e/<library>`의 `bench.mjs`, `bench.py`, `bench.php`로 json의 `parse(stringify(value))`에 대한 carry의
  21회 실행 중앙값을 load average와 함께 `var/report/bench/`에 경고로만 측정한다. Red: `make test-ts`가 319개 중 1개
  실패했다(relay의 go.mod). Green: 319개 모두 통과한다(B2.87).
- 다른 레포 값 class의 문자열은 정수 list로 코어에 들어왔다. json의 in case가 모든 문자열을 `value.string_units`로
  읽었으므로 문자열마다 UTF-16 code unit이 언어의 경계를 건넜고, WASM은 내장 문자열을 unit 하나씩, Python은 UTF-32
  인코딩으로 읽었다. 이제 kind `text`의 case는 `uint`의 list를 주는 member인 `units`를 적을 수 있다. 그 `read`는
  optional `text`를 주고, 생성 코드는 그것을 언어의 text로 받으며, 없음, 곧 짝 없는 surrogate를 가진 text일 때만
  `units`로 code unit을 읽는다. 그런 case는 CK-8 왕복에서 kind `text16`의 case이기도 하며, 이것이 `text` 행이 kind
  `text16`의 case로 돌아와도 된다는 규칙을 대신한다. Python은 surrogate 없는 `str`을, WASM은 `isWellFormed`인
  string을 UTF-8 byte로 받는다. Red: `make test-ts`가 318개 중 7개 실패했다(`units`의 CK-8 시험과 다섯 target의 값
  class 시험). Green: 318개 모두 통과한다(B2.89).
- 짝 없는 surrogate가 있는 text는 코어를 나갈 형태가 없었다. `binding_core::OutValue`는 text를 Rust `String`으로만
  담았으므로 json의 `out` 함수는 `polyspec_json::Value`가 담는 문자열 `"\ud800"`을 줄 수 없었고, 값 class는 문자열을
  text를 주는 member로 읽었는데 json은 그런 문자열에 그것을 거절한다. `OutValue::Text16(Vec<u16>)`과 kind `text16`은
  text를 짝 없는 surrogate까지 UTF-16 code unit으로 준다. kind `text16`의 `out` 행은 `uint`의 list를 받는 class의
  member(json `value.from_units`)로 값을 만들고, kind `text16`의 `in` case는 그 list를 주는 member(json
  `value.string_units`)로 그것을 `HostText::Utf16`으로 읽는다. Python, Node, PHP, WASM이 그렇게 한다. 값 class는
  kind `text`의 case 값을 계속 만들 수 있도록 `text` 행을 그대로 두고, CK-8은 그 행이 kind `text16`의 case로 돌아오는
  것을 받아들인다. Unicode text는 그 UTF-16 code unit과 같은 값이기 때문이며, 다른 kind의 짝은 받아들이지 않는다. PHP와 Go의
  문자열은 짝 없는 surrogate를 담지 못하므로 어떤 내장 형태도 그 kind를 만들지 않는다(CK-8). Red: `make test-ts`가 301개 중 2개 실패했고(kind의 CK-1, make `value.from_units`와 kind
  `text16`의 case의 거절), `make test-rust`가 `OutValue::Text16`의 test를 compile하지 못했다. Green: 둘 다 통과한다
  (B2.81). 이제 Go가 값 class를 받으므로(B2.80), Go는 값 class의 문자열을 code unit의 node 13으로 읽고 `text16` 행의
  함수로 그것을 만든다. Red: `make test-ts`가 생성 시험의 kind `text16` Go 단언에서 실패했다. Green: 314개 모두 통과한다.
- 생성기는 다른 레포의 값 class를 받거나 주는 계약의 Go 바인딩을 "a value class of another repository is not
  generated for Go yet: the call of GN-15c has no description, read and making of an instance (GN-6x)"로 거부해서,
  owner의 값 class를 받고 주는 함수에는 Go 바인딩이 없었다. 이제 Go는 패키지 binding이 import하는 owner Go 타입의
  포인터를 이름한다. 패키지 binding은 인스턴스를 class의 Go in 행으로 node 11로 묘사한다. node 11은 case의 kind와 handle을
  담고, 그 handle의 질문 read(op 2)는 case의 read member를 부른다. key와 value를 순회하는 owner class의 인스턴스는 그
  entry들의 map으로 묘사한다. owner member의 오류는 node 12이며, Go 함수는 그 오류를 그대로 돌려준다. 코어 값은 class와
  out 행의 번호, 행의 내용을 담은 결과의 node 11로 나가고, 패키지 binding이 owner의 export 함수로 인스턴스를 만든다
  (GN-6x, GN-15c). `packages/ts`의 `npm test`, 그리고 owner 계약에서 생성한 Go 패키지 옆에서 owner fixture와 함께 생성한
  consumer 샘플 Go module의 `gofmt`, `go vet`으로 확인했다.
- GN-6ac의 단위 시험은 Go C ABI에 대해 `shapes.stride_count`와 `shapes.offset`에 아무것도 요구하지 않았다.
  `shapes.stride_count`는 코어가 `[usize; 2]`와 u32 field로 가진 record `stride`를 받고, `shapes.offset`은 u8 parameter를
  받아 isize를 준다. 이제 시험은 Go crate가 struct literal 앞에서 각 field를 `IntoCore`로 주고, 두 u8 parameter를 좁히고,
  isize 결과를 너비의 assertion 뒤에 int로 넓히기를 요구한다. 생성기는 이미 이 꼴을 썼다(record field는 GN-6ac의 Go 변경
  뒤로). field를 좁히지 않으면 시험은 실패한다. `packages/ts`의 `npm test`로 확인했다.
- Go C ABI crate는 list parameter를 표의 타입(u64나 u64의 tuple)으로 된 `Vec`으로 코어에 주면서 코어 호출은
  `&values[..]`를 받았다. 그래서 코어가 `width_sum`에서 `&[usize]`를, `largest`에서 `&[u32]`를 빌리는 `tests/e2e/shapes`의
  Go binding이 컴파일되지 않았다. 이제 crate는 다른 crate처럼 그런 list를 `IntoCore`로 코어 항목 타입의 `Vec`으로
  바꾼다(GN-6ad). 코어 타입 밖의 항목은 kind `invalid_number`다. `packages/ts`의 `npm test`로 확인했다.
- Go C ABI crate는 parameter를 표의 타입(u64나 u64의 tuple)으로 코어에 주고 tuple 결과를 field `.0`과 `.1`로 읽었다.
  그래서 코어가 `span_width`에서 `[usize; 2]`를, `span_at`에서 u32를 받고 `[u32; 2]`를 주는 `tests/e2e/shapes`의 Go
  binding이 컴파일되지 않았다. 이제 crate는 다른 crate처럼 정수 parameter와 record의 정수 field를 `IntoCore`로
  코어에 주고, tuple 결과를 `partsN`으로 읽으며, usize 결과는 너비의 assertion 뒤에 넓힌다(GN-6ac). 2^32인 start는 kind
  `invalid_number`다. `packages/ts`의 `npm test`로 확인했다.
- template의 `engine.render_json.assign`이 받는 json의 class `value`처럼 다른 레포의 값 class인 parameter나 결과는 모든
  target에서 "the type {"unit":"value","library":"json"} is not generated yet"로 거절되었다. 이제 owner가 class에
  `core: {in, out}`과 `core_type`을 적으면(CK-8) Python, Node, PHP, WASM은 owner class의 인스턴스를 받는다. `in` 행의 `by`
  member로 그것을 `HostValue::Value`로 묘사하고, `read` member로 내용을 읽으며, owner의 map class 인스턴스는 그 iteration의
  entry로 읽는다. 코어 값은 owner 패키지를 통해 `out` 행의 static과 constructor member로 만든다. owner의 `in`과 `out` 함수가
  유일한 변환이다(GN-6x). Go는 GN-15c의 호출에 아직 인스턴스의 꼴이 없으므로 이름으로 거절하고, 그 함수가 없는 다른 레포의
  값 class도 이름으로 거절한다. `make test-ts`로 검증했다(300개 통과).
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
- Python, Node, WASM의 host는 이 계약의 값 class(`core_type`이 없는 class, 또는 값 alias의 `in` 행이 이름하는 class)의
  인스턴스를 읽었고, 같은 계약 안의 다른 레포 값 class의 인스턴스를 담을 형태가 없었다.
  이제 host 하나가 둘을 모두 갖는다. 이 계약의 class의 인스턴스는 읽기의 번호와 함께 `Held::Value`로, 다른 레포의
  class의 인스턴스는 `in` case의 read member와 함께 `Held::Foreign`으로 갖고, `read`는 어느 쪽의 내용이든 준다. 다른
  레포의 값 class의 변환은 host를 `JsHost::new`, `PyHost::new`로 만들고, PHP에서는 field `marked`를 넣어 만든다.
  다른 레포의 값 class가 있고 callback unit과 함수 타입이 없는 계약의 PHP 바인딩은 컴파일되지 않았다. owner의 member가
  자기 예외를 `Thrown::Php`로 주는데, 그 variant는 callback이나 함수 타입이 있을 때만 생성되었기 때문이다. 이제 그런
  계약에서도 그 variant를 생성한다. variant의 interface와 class가 구현하는 callback의 interface를 주는 PHP 함수
  (`variant_<unit>`, `interface_<unit>`)는 class 표에 그 interface가 없으면 `panic!`으로 끝났다. 이제 panic이 없는
  `own_interface`로 그것을 읽고, `startup`은 variant의 interface를 그 case의 class를 등록하기 전에 찾지 못하거나
  callback의 interface를 interface를 등록한 뒤에 찾지 못하면 시작을 실패시킨다(B-1, B-4, GN-6af, GN-6v, GN-6w, GN-6x).
  case의 optional field를 생략할 수 있는지 알려 주는 GN-6v의 함수는 `caseLeftOut`이다. `leftOut`은 생략할 수 있는
  인자의 변환이기 때문이다(GN-6i). `tests/e2e/shapes`와 `tests/e2e/variants`의 Rust 코어는 `make fmt-e2e`가 검사하는
  rustfmt 꼴이다. `make test-ts`로 검증: 시험 373개 통과.
