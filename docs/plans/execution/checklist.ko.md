<!-- doc-id: checklist-execution -->
<!-- source-sha256: 8bf47c17580ebfc8634ed26de9461f979252f2757b7cb2210f8548a6a11d4ee8 -->
# 실행 체크리스트

## Wave 1 — polyspec 저장소의 문서 구조

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check`가 설치된 kit의 문서 검사를 `config/documents.json`이 고른 문서, changelog, `config/checklist.json`이 선언한 체크리스트에 돌리고, `make documents-stamp`가 검토한 한국어 짝에 개정 표시를 쓴다 | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | 계획과 이 체크리스트와 그 한국어 짝, 그리고 `AGENTS.md`의 체크리스트 규칙 | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [o] |
| B1.3 | 한국어 짝마다 영어 원문과 같은 것을 말하고 그 `source-sha256`을 가진다 | `config/documents.json`의 한국어 짝 | `make documents-stamp`가 원문이 바뀐 짝을 하나도 적지 않는다 | [o] |

## Wave 2 — 생성기의 결함

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B2.38 | 다른 레포의 값 class는 owner의 코어 함수로 주고받는다(GN-6x, CK-8). template의 `engine.render_json.assign`처럼 json의 class `value`인 parameter나 결과는 모든 target에서 "the type {"unit":"value","library":"json"} is not generated yet"로 거절되었다. owner는 class에 `core: {in, out}`과 `core_type`을 적고, consumer는 Python, Node, PHP, WASM, Go에서 class의 `in` 행으로 인스턴스를 묘사하고 `out` 행으로 값을 만든다 | `docs/spec/generator.md`(.ko), `docs/spec/contract-check.md`(.ko), `packages/ts/src/check.ts`, `packages/ts/src/generate/`, `packages/ts/tests/`, `CHANGELOG.md`(.ko) | `make test-ts`; json을 의존으로 둔 template의 `make e2e`, 그 기록이 `evidence: true` | [~] |
