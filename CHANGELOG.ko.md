<!-- doc-id: changelog -->
# 변경 기록

[English](CHANGELOG.md)

## Unreleased

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
