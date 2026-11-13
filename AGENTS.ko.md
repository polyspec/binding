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
  Composer, wasm-bindgen CLI, maturin은 `mise.toml`에, 그 digest는 `mise.lock`에 있고(npm은 `package.json`의 `devEngines`에도),
  Rust는 component(기호를 읽는 `llvm-nm`의 `llvm-tools` 포함)와 target `wasm32-unknown-unknown`과 함께 `rust-toolchain.toml`에, PHP는 minor로 `.php-version`에,
  PHPUnit은 `config/phpunit`에, mise는 배포 대상 플랫폼마다의 sha256과 함께 `config/toolchain.json`에 있다. `make install`은
  `@polyspec/kit`의 도구로 이것들을 `var/tools`에 설치하고(기계의 유일한 도구인 rustup이 Rust toolchain을 가지며, 기계의
  PHP는 그대로 감싼다), 고정한 digest로만 내려받으며, 어떤 도구도 처음 쓰일 때 다른 도구를 설치하지 않는다. wasm-bindgen
  CLI는 생성 manifest의 `wasm-bindgen` crate와 같은 릴리스다(GN-18). CLI는 자기 릴리스의 모듈만 읽기 때문이다. 이유:
  저장소가 고정하지 않은 도구로 얻은 결과는 되풀이할 수 없으므로 진단이지 증거가 아니다.
  Enforced by: `make install`, 그 `mise install --locked`가 `mise.lock`이 고정하지 않은 도구를 실패시킨다.
- Own: 바인딩 crate의 링크 설정은 그 crate의 build script에 두고, `RUSTFLAGS`나 `.cargo/config.toml`에 두지 않는다. PHP 확장은
  macOS에서 그 `build.rs`로 링크된다(GN-3d, BD-9). 이유: build script는 Cargo를 어디서 시작하든 그 crate에 걸리지만 `rustflags`는
  모든 crate에 걸리고, `.cargo/config.toml`은 Cargo가 시작한 디렉터리 아래에서만 유효하며 `RUSTFLAGS`에 밀리므로, 같은 tree가
  빌드 방법에 따라 다르게 링크된다.
  Enforced by: `packages/ts`의 `npm test`, 그 BD-9 시험이 scaffold를 build script와 비교한다. CK-19가 저장소의 build script를
  그것과 비교한다.
- Own: 계약 검사의 모든 검사는 자기 이유로 실패하는 시험을 가진다(PRINCIPLES P19).
  Enforced by: `packages/ts`의 `npm test`
- Own: 끝에서 끝까지 확인은 계약의 모든 target을 checkout의 도구로 실행하고, 도구가 없는 target은 그 target, 도구,
  `make install`을 적고 실행을 실패시킨다(GN-14a).
  target마다 생성·빌드·시험을 따로 끝까지 돌리고, 실행은 실패한 target을 그 원인과 함께 모두 이름한다(GN-14c). target을
  빼거나 더하는 스위치는 없고, 실행 보고는 lint와 시험을 가른다. lint는 코드를 실행하지 않으므로 어느 target도 검증하지
  않는다. 레포의 사본은 실행의 binding을 받는 변경만 받고(GN-14d), 레포의 결함은 실행의 이름 있는 실패이며 사본에서 고치지
  않는다. 이유: 돌지 않은 target은 검증되지 않았는데 결과는 통과로 보이고, 사본이 고쳐 준 결함은 실행을 통과하고 레포에 남는다.
  Enforced by: `make e2e`, 도구가 없으면 첫 단계 전에, 시험이 돌지 않은 target이 있으면 끝에서 실패한다.
- Own: `tests/e2e`의 모든 계약과 단위 시험의 fixture 레포(`packages/ts/tests/fixtures/repo`)의 계약은 다섯 target을 적는다(BD-27).
  생성기나 계약 검사가 거부하는 target은 생성기가 그것을 받을 때까지 끝에서 끝까지 확인의 이름 있는 실패로 남고, fixture의 거부는
  그 단위 시험이 단언한다. 어떤 target도 계약에서 빼거나, 건너뛰거나, 기대 실패로 적지 않는다.
  이유: 계약에서 뺀 target은 생성기가 그 형태를 받지 못한다는 사실을 감추고, 그러면 통과한 실행은 규칙이 요구하는 것보다 적게
  검증한다.
  Enforced by: none, 계약이 적는 target은 검토에서 읽는다. 끝에서 끝까지 확인이 거부된 target을 하나씩 이름한다.
- Own: 생성기, `binding_core`, 끝에서 끝까지 확인을 바꾸는 commit은 push나 merge 전에 그 commit의 끝에서 끝까지
  확인(`make e2e BINDING=<commit>`, GN-14와 GN-14b)을 통과하고, 실패는 새 commit으로 고치며 그 commit도 같은 방법으로
  확인한다. 기록(`var/report/e2e/`)이 그 commit의 증거라고 적은 실행만 센다: `scripts/e2e-inputs.mts`의 닫힌 목록
  `READ_FROM_CHECKOUT`의 어느 파일도 그 commit과 다르지 않아야 하며, 실행이 읽는 추적 파일은 그것을 더하는 변경에서 그 목록에
  더한다. 이유: 작업 tree의 실행은 어느 commit에도 없는
  생성기를 다른 commit의 `binding_core`와 함께 확인하므로 둘이 갈릴 수 있고, 그 결과는 push나 merge가 나르는 어느 commit의
  것도 아니다.
  Enforced by: none, 그 확인은 모든 target과 그 runner가 필요하며 어느 단위 시험도 소유하지 않는다. 기록이 실행마다 그
  commit을 적는다.
- Own: `.github/workflows/ci.yml`은 `main`의 push와 수동 실행에서 돈다. matrix 항목마다 job 하나다. `ts`는 `typecheck-ts`,
  `unit-ts`, `release-coverage`를 실행하고, `rust`는 `test-rust-features`, `test-rust-plain`, `clippy-rust-features`,
  `clippy-rust`, `fmt-rust`, `fmt-e2e`를 실행한다. 그래서 job들은 `make check`의 모든 대상을 한 번씩 실행한다. 각 job은 그 대상을
  `make ci-targets`로 실행한다. `make ci-targets`는 모든 대상을 끝까지 실행하고 보고서 `var/ci/<name>/`을 쓴다. 마지막 job
  `ci-passed`는 다른 모든 job이 통과했을 때만 통과한다. job은 `ubuntu-26.04-arm`에서 돌고, 모든 action을 commit으로
  고정하며, `timeout-minutes`를 두지 않고, step의 모든 명령을 make target 하나로 실행한다. `.github/actions/bootstrap`은
  모든 job의 bootstrap이다. 끝에서 끝까지 확인은 workflow의 job이 아니다. 그 확인은 확인하는 각 레포의 checkout이
  필요하고, 위의 규칙이 commit을 push하거나 merge하기 전에 그 commit의 실행을 요구한다. 이유: release는 모든 job이 통과한
  실행의 id를 받고, 도구를 바로 실행하는 step은 Makefile의 설정을 받지 못한다.
  Enforced by: none, workflow는 review에서 읽는다. `make ci-passed`가 한 실행의 job을 판정한다.
- Own: `config/release.json`은 모든 package 파일을 분류한다(`make release-coverage`). tag `vX.Y.Z`는 생성기
  `packages/ts`를 GitHub Release의 npm archive `polyspec-binding-X.Y.Z.tgz`로 release하고, `npm pack`이 prepack script
  `npm run build`로 그것을 만든다. `packages/core/rust`의 crate `binding_core`는 Git tag로 release하고, Cargo 의존은 그것을
  `tag = "vX.Y.Z"`로 가리킨다. 어느 쪽도 registry에 두지 않는다. version 0.1까지 레포는 다른 polyspec 레포를 GitHub tag나
  release asset으로 받기 때문이다. version-bump commit `chore(release): Release X.Y.Z`는 `packages/ts/package.json`과 그
  lock, `packages/core/rust/Cargo.toml`에 X.Y.Z를 적고, 두 changelog의 `## Unreleased`를 `## X.Y.Z`로 바꾸고 그 위에 빈
  `## Unreleased`를 둔다. `main`으로의 그 push의 CI 실행이 성공하면 `.github/workflows/release.yml`이 스스로 시작하고,
  `gh workflow run release.yml -f run=<id>`가 그것을 다시 시작한다. `make release-tag`가 그 commit에 annotated tag
  `vX.Y.Z`를 만들어 push하고, `make release-assets`, `make release-publish`, `make release-undraft`가 archive를 만들고
  GitHub Release를 만든다. tag를 손으로 만들지 않는다. 이유: release는 성공한 실행이 확인한 commit이고, 그 version은 그것이
  release하는 모든 manifest의 version이다.
  Enforced by: `make release-coverage`는 `config/release.json`이 분류하지 않은 package 파일을 실패시킨다. `make
  release-tag`는 성공한 실행의 commit에만 tag를 붙인다.
