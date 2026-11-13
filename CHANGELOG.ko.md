<!-- doc-id: changelog -->
# 변경 기록

[English](CHANGELOG.md)

## Unreleased

- WASM이 parameter의 타입 `source`, `bytes`, parameter와 record field의 기본값, 오류 unit, receiver `&mut self`인 member를
  생성한다: lock이 있는 class의 표는 그 값을 lock에 담고, 호출의 자리마다 그 guard를 잡는다(GN-6h, GN-6i, GN-6j, GN-7a,
  GN-18, GN-18a). 모든 바인딩 crate가 `binding_core`의 feature `lock`을 켠다. WASM 시험은 Node 시험처럼 기본값, source,
  오류 unit의 정확한 클래스를 확인한다(GN-13d). `packages/ts`의 `npm test`와 `tests/e2e/shapes`의 `make e2e`로 확인했다.
- Go C ABI crate의 진입 `src/lib.rs`가 allow 속성을 125자 한 줄로 써서 레포의 `cargo fmt --all --check`가 거부했다.
  `binding scaffold`는 allow 속성마다 rustfmt의 꼴로 쓴다(GN-3a). `packages/ts`의 `npm test`로 확인했다.
