<!-- doc-id: plan-execution -->
<!-- source-sha256: c304b754ba7fceb583f2be321f742ec987fd632b8a4559ac9c51c44827c2a504 -->
# 실행 계획

[English](plan.md)

## 맥락

- binding은 polyspec 저장소마다 그 interface contract에서 바인딩을 생성한다(`docs/spec/`). 작업은
  [checklist.ko.md](checklist.ko.md)의 행이며, 행마다 산출물, 검증 명령, 상태를 `config/checklist.json`이 선언한 대로 가진다.
  `make docs-check`가 문서와 함께 체크리스트를 읽는다.
- 작업 ID는 `B<wave>.<number>` 꼴이고, 하위 작업은 `-<number>`를 붙인다. wave는 의존으로 적은 wave가 끝나면 시작한다.

## Wave 1 — polyspec 저장소의 문서 구조

의존: 없음.

polyspec 저장소는 모두 같은 문서 구조를 가진다: `config/documents.json`, `config/checklist.json`, `docs/plans/<plan>/`
아래의 계획과 체크리스트와 그 한국어 짝, 그리고 설치된 `@polyspec/kit`의 문서 검사를 돌리는 `make docs-check`. binding에는
이 가운데 아무것도 없어서, 깨진 link, 빠진 짝, 꼴이 틀린 체크리스트 행이 드러나지 않았다. 이 wave는 검사와 계획을 더하고,
검사의 첫 실행과 한국어 짝의 검토가 찾은 것을 고쳐서, 짝마다 영어 원문의 `source-sha256`을 가지게 한다.

## Wave 2 — 생성기의 결함

의존: Wave 1.

생성기의 결함은 명세가 생성 방법을 정하는데도 생성기가 거절하거나 잘못 생성하는 입력 계약, 또는 명세에 빠진 문장이다.
결함마다 발견할 때 정한 번호가 있고 그 행은 `B2.<번호>`다. 그래서 여러 갈래가 동시에 더한 행의 ID가 겹치지 않는다. 행은
입력, 동작, 기대 동작을 적고, 그 unit test와 행이 적은 저장소의 end-to-end 검사가 통과하면 끝난다.
