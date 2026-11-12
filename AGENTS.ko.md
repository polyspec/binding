<!-- doc-id: development -->
# 개발

[English](AGENTS.md)

모든 polyspec repository의 작업 원칙은 [PRINCIPLES.md](PRINCIPLES.ko.md)에 있다. 이 파일은 이 repository의 규칙만 적는다.

- Own: bindgen은 모든 polyspec repository의 바인딩을 그 인터페이스 계약에서 생성한다. 계약 형식은
  `packages/ts/schema/interface.schema.json`이고, 생성기와 계약 검사의 규칙은 `docs/spec/`에 있다. bindgen을 만드는 이유와 구현 언어는
  `docs/rebuild/bindgen.md`에 있다.
  Enforced by: none, 어느 문서가 주제를 소유하는지는 판단이다.
- Own: `packages/core/rust`는 생성 crate와 코어 crate가 의존하는 런타임 지원 crate `bindgen_core`이고, `packages/ts`는 생성기와
  계약 검사다. `bindgen_core`의 공개 API를 바꾸는 변경은 같은 커밋에서 `docs/core-api.md`를 고친다.
  Enforced by: none, crate와 문서를 비교하는 도구는 없다.
- Own: Rust 코드는 R-1의 lint를 따른다. `unwrap_used`, `expect_used`, `let_underscore_must_use`, `let_underscore_untyped`는
  deny이고, `clippy.toml`은 `Option`의 `unwrap_or`·`map_or` 계열과 `Result::ok`를 금한다. 남는 사용은
  `#[allow(..., reason = "<규칙 id>")]`를 단다.
  Enforced by: `packages/core/rust`의 `cargo clippy --all-targets -- -D warnings`
- Own: 계약 검사의 모든 검사는 자기 이유로 실패하는 시험을 가진다(PRINCIPLES P19).
  Enforced by: `packages/ts`의 `npm test`
- Own: 생성기를 바꾸는 변경은 커밋 전에 `docs/spec/generator.md`의 끝에서 끝까지 확인(GN-14)을 실행한다.
  Enforced by: none, 그 확인은 PHP, Python, Node와 그 runner가 필요하며 어느 단위 시험도 소유하지 않는다.
