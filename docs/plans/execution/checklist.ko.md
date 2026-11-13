<!-- doc-id: checklist-execution -->
<!-- source-sha256: 476a00c9b35ef98874bf100a956f235296d0bcfe551fe1c7e47fbbf8c4594978 -->
# 실행 체크리스트

## Wave 1 — polyspec 저장소의 문서 구조

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check`가 설치된 kit의 문서 검사를 `config/documents.json`이 고른 문서, changelog, `config/checklist.json`이 선언한 체크리스트에 돌리고, `make documents-stamp`가 검토한 한국어 짝에 개정 표시를 쓴다 | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | 계획과 이 체크리스트와 그 한국어 짝, 그리고 `AGENTS.md`의 체크리스트 규칙 | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [o] |
| B1.3 | 한국어 짝마다 영어 원문과 같은 것을 말하고 그 `source-sha256`을 가진다 | `config/documents.json`의 한국어 짝 | `make documents-stamp`가 원문이 바뀐 짝을 하나도 적지 않는다 | [o] |
| B1.4 | 추적 파일은 GitHub action의 commit 고정과 lock 말고는 Git commit을 이름하지 않는다. 규칙은 `AGENTS.md`에 있고, 시험이 추적 파일 안의 commit 이름을 실패시킨다 | `AGENTS.md`(.ko), `packages/ts/tests/tracked-commits.test.ts`, `CHANGELOG.md`(.ko) | `packages/ts`의 `npm test` | [o] |

## Wave 2 — state machine이 있는 member의 함수 parameter와 passthrough 결과

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B2.86 | `machine`이 있는 member는 다섯 target에서 method이고, 함수 타입의 parameter를 받고, `passthrough`를 돌려주며, sample의 end-to-end 검사는 함수를 받는 method, 함수, static member를 target마다 돌린다(GN-6ae). 다섯 target이 그것을 생성한다 | `packages/ts/src/generate/`, `packages/core/rust`, `tests/e2e/sample`, `docs/spec/generator.md`(.ko), `docs/spec/contract-check.md`(.ko), `CHANGELOG.md`(.ko) | `make e2e REPO=tests/e2e/sample WORK=<directory>` | [~] |
| B2.86-1 | 다른 library의 오류의 helper는 GN-4c의 두 계열인 `error_of_<library>`와 `failure_of_<library>`다. 그래서 library `core`, `binding`, `failure`, `library`를 이름하는 계약의 crate는 어떤 함수도 두 번 정의하지 않는다. 전에는 library `core`의 `<library>_error`가 helper `core_error`였다 | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `packages/ts`의 `npm test` | [v] |
| B2.86-2 | 다른 레포의 unit의 변환과 자기 unit의 변환은 같은 이름을 쓰지 않는다. 다른 레포의 unit의 변환은 module `library_<library>`의 함수 `in_<name>`, `out_<name>`, `make_<name>`이고 경로로 부른다. 그래서 library `<c>`의 unit `<a>_<b>`, library `<c>_<a>`의 unit `<b>`, 자기 unit `<c>_<a>_<b>`는 세 함수다. WASM crate의 class의 member의 진입은 module `class_<unit>`의 `member_<member>`이고, class의 해제는 `free_<unit>`과 export `__free_<Class>`다. 그래서 두 class와 member `free`는 같은 이름을 쓰지 않는다(GN-4c) | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `packages/ts`의 `npm test` | [v] |
| B2.86-3 | Go crate의 class의 member의 C 심볼 `polyspec_<library>_<unit>_<member>`와 package `binding`의 그 함수는 두 가지로 읽힌다. class `tag`의 member `new_x`와 class `tag_new`의 member `x`가 둘 다 `polyspec_sample_tag_new_x`와 `TagNewX`여서 두 정의가 된다. 심볼에는 class와 member를 서로로 읽을 수 없는 꼴이 필요하다(GN-4c, B-8) | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `packages/ts`의 `npm test` | [ ] |
