<!-- doc-id: development -->
# 개발

[English](AGENTS.md)

모든 polyspec repository의 작업 원칙은 [PRINCIPLES.md](PRINCIPLES.ko.md)에 있다. 이 파일은 이 repository의 규칙만 적는다.

- Own: binding은 모든 polyspec repository의 바인딩을 그 인터페이스 계약에서 생성한다. 계약 형식은
  `packages/ts/schema/interface.schema.json`이고, 생성기와 계약 검사의 규칙은 `docs/spec/`에 있다. binding을 만드는 이유와 구현 언어는
  `docs/rebuild/binding.md`에 있다.
  Enforced by: none, 어느 문서가 주제를 소유하는지는 판단이다.
- Own: `packages/core/rust`는 생성 crate와 코어 crate가 의존하는 런타임 지원 crate `binding_core`이고, `packages/ts`는 생성기와
  계약 검사다. `binding_core`의 공개 API를 바꾸는 변경은 같은 커밋에서 `docs/core-api.md`를 고친다.
  Enforced by: none, crate와 문서를 비교하는 도구는 없다.
- Own: Rust 코드는 R-1의 lint를 따른다. `unwrap_used`, `expect_used`, `let_underscore_must_use`, `let_underscore_untyped`는
  deny이고, `clippy.toml`은 `Option`의 `unwrap_or`·`map_or` 계열과 `Result::ok`를 금한다. 남는 사용은
  `#[allow(..., reason = "<규칙 id>")]`를 단다.
  Enforced by: `packages/core/rust`의 `cargo clippy --all-targets -- -D warnings`
- Own: 릴리스에 따라 검사 결과가 달라지는 모든 도구는 추적 파일에 고정하고 checkout 안에 설치한다. Node.js, npm, Go, Python,
  Composer, wasm-bindgen CLI는 `mise.toml`에, 그 digest는 `mise.lock`에 있고(npm은 `package.json`의 `devEngines`에도),
  Rust는 component(기호를 읽는 `llvm-nm`의 `llvm-tools` 포함)와 target `wasm32-unknown-unknown`과 함께 `rust-toolchain.toml`에, PHP는 minor로 `.php-version`에,
  PHPUnit은 `config/phpunit`에, mise는 배포 대상 플랫폼마다의 sha256과 함께 `config/toolchain.json`에 있다. `make install`은
  `@polyspec/kit`의 도구로 이것들을 `var/tools`에 설치하고(기계의 유일한 도구인 rustup이 Rust toolchain을 가지며, 기계의
  PHP는 그대로 감싼다), 고정한 digest로만 내려받으며, 어떤 도구도 처음 쓰일 때 다른 도구를 설치하지 않는다. wasm-bindgen
  CLI는 생성 manifest의 `wasm-bindgen` crate와 같은 릴리스다(GN-18). CLI는 자기 릴리스의 모듈만 읽기 때문이다. 이유:
  저장소가 고정하지 않은 도구로 얻은 결과는 되풀이할 수 없으므로 진단이지 증거가 아니다.
  Enforced by: `make install`, 그 `mise install --locked`가 `mise.lock`이 고정하지 않은 도구를 실패시킨다.
- Own: 계약 검사의 모든 검사는 자기 이유로 실패하는 시험을 가진다(PRINCIPLES P19).
  Enforced by: `packages/ts`의 `npm test`
- Own: 끝에서 끝까지 확인은 계약의 모든 target을 checkout의 도구로 실행하고, 도구가 없는 target은 그 target, 도구,
  `make install`을 적고 실행을 실패시킨다(GN-14a). target을 빼는 스위치는 없고, 실행 보고는 lint와 시험을 가른다. lint는 코드를
  실행하지 않으므로 어느 target도 검증하지 않는다. 이유: 돌지 않은 target은 검증되지 않았는데 결과는 통과로 보인다.
  Enforced by: `make e2e`, 도구가 없으면 첫 단계 전에, 시험이 돌지 않은 target이 있으면 끝에서 실패한다.
- Own: 생성기, `binding_core`, 끝에서 끝까지 확인을 바꾸는 commit은 push나 merge 전에 그 commit의 끝에서 끝까지
  확인(`make e2e BINDING=<commit>`, GN-14와 GN-14b)을 통과하고, 실패는 새 commit으로 고치며 그 commit도 같은 방법으로
  확인한다. 기록(`var/report/e2e/`)이 그 commit의 증거라고 적은 실행만 센다. 이유: 작업 tree의 실행은 어느 commit에도 없는
  생성기를 다른 commit의 `binding_core`와 함께 확인하므로 둘이 갈릴 수 있고, 그 결과는 push나 merge가 나르는 어느 commit의
  것도 아니다.
  Enforced by: none, 그 확인은 모든 target과 그 runner가 필요하며 어느 단위 시험도 소유하지 않는다. 기록이 실행마다 그
  commit을 적는다.
