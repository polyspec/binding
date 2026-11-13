<!-- doc-id: checklist-execution -->
<!-- source-sha256: 610a00c6fc3cadfc10c7d95ac353391c88e629ad4cccfee458c9345ed89d41e4 -->
# 실행 체크리스트

## Wave 1 — polyspec 저장소의 문서 구조

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check`가 설치된 kit의 문서 검사를 `config/documents.json`이 고른 문서, changelog, `config/checklist.json`이 선언한 체크리스트에 돌리고, `make documents-stamp`가 검토한 한국어 짝에 개정 표시를 쓴다 | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | 계획과 이 체크리스트와 그 한국어 짝, 그리고 `AGENTS.md`의 체크리스트 규칙 | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [o] |
| B1.3 | 한국어 짝마다 영어 원문과 같은 것을 말하고 그 `source-sha256`을 가진다 | `config/documents.json`의 한국어 짝 | `make documents-stamp`가 원문이 바뀐 짝을 하나도 적지 않는다 | [o] |
| B1.4 | 추적 파일은 GitHub action의 commit 고정과 lock 말고는 Git commit을 이름하지 않는다. 규칙은 `AGENTS.md`에 있고, 시험이 추적 파일 안의 commit 이름을 실패시킨다 | `AGENTS.md`(.ko), `packages/ts/tests/tracked-commits.test.ts`, `CHANGELOG.md`(.ko) | `packages/ts`의 `npm test` | [o] |

## Wave 2 — 생성기의 결함

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B2.96 | release가 라이브러리의 Go 모듈을 싣는다(GN-15g, GN-14f, CK-19). 생성된 Go 파일과 정적 라이브러리는 추적 파일이 아니고 생성 코드는 라이브러리의 디렉터리를 가리키지 않아서, 어떤 소비자도 Go 모듈을 받을 수 없었다. `binding generate`는 모듈 안의 각 플랫폼 라이브러리 디렉터리를 가리키고, 명세는 release의 commit과 tag `packages/go/vX.Y.Z`, CK-19가 비교하는 파일을 적으며, end-to-end 검사는 모듈을 tag로 require하는 소비자를 시험한다. 열린 것: Linux에서 여러 정적 라이브러리를 한 프로그램에 링크하는 것, 라이브러리의 크기 | `docs/spec/generator.md`(.ko), `docs/spec/contract-check.md`(.ko), `packages/ts/src/generate/go.ts`, `scripts/e2e.mts`, `scripts/go-release.mts`, `packages/ts/tests/`, `CHANGELOG.md`(.ko) | `make test-ts`; `tests/e2e/sample`의 `make e2e`, 그리고 `tests/e2e/points`와 함께 돌린 `tests/e2e/plot`의 `make e2e`. 기록이 `evidence: true`다 | [~] |
| B2.97 | Go 모듈이 musl에서 링크된다(GN-15g). Go의 빌드 제약은 C library를 구분하지 않으므로, musl의 소비자는 자기 `<GOOS>_<GOARCH>`의 파일을 컴파일하고 GNU C library용 라이브러리의 링크에 실패한다. 기대 동작은 둘 다에서 링크되는 라이브러리이거나 이름을 적은 거절이다 | `docs/spec/generator.md`(.ko), `packages/ts/src/generate/go.ts`, `packages/ts/tests/generate.test.ts`, `CHANGELOG.md`(.ko) | `make test-ts`; musl의 Linux에서 `tests/e2e/sample`의 `make e2e` | [ ] |
| B2.98 | `tests/e2e/points`와 함께 돌리는 `tests/e2e/plot`의 end-to-end 검사가 CI에서 실행되어, Go 모듈의 release 형태(GN-14f)를 Linux에서 시험한다. `.github/workflows/ci.yml`은 end-to-end 검사를 실행하지 않았으므로, 두 Go 모듈의 정적 라이브러리를 한 프로그램에 링크하는 것은 `darwin_arm64`에서만 시험되었고, `tests/e2e`의 모든 레포의 다섯 target도 그랬다. job `e2e`가 그 각각을 실행한다. 그 항목 plot은 plot의 target php, python, wasm이 통과할 때까지 실패한다 | `.github/workflows/ci.yml`, `Makefile`, `packages/ts/tests/`, `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make test-ts`; push의 실행에 대한 `make ci-passed`. 그 실행은 아직 없어서 job은 CI에서 확인되지 않았다 | [~] |
