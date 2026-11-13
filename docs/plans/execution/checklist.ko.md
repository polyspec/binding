<!-- doc-id: checklist-execution -->
# 실행 체크리스트

## Wave 1 — polyspec 저장소의 문서 구조

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check`가 설치된 kit의 문서 검사를 `config/documents.json`이 고른 문서, changelog, `config/checklist.json`이 선언한 체크리스트에 돌리고, `make documents-stamp`가 검토한 한국어 짝에 개정 표시를 쓴다 | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | 계획과 이 체크리스트와 그 한국어 짝, 그리고 `AGENTS.md`의 체크리스트 규칙 | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [~] |
| B1.3 | 한국어 짝마다 영어 원문과 같은 것을 말하고 그 `source-sha256`을 가진다 | `config/documents.json`의 한국어 짝 | `make documents-stamp`가 원문이 바뀐 짝을 하나도 적지 않는다 | [ ] |
