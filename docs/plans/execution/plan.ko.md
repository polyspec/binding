<!-- doc-id: plan-execution -->
<!-- source-sha256: c02586902e5f24cfa904ecb78d6e653c83ac735cf5ac8f96d1d86e02b2e00fcb -->
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

## Wave 2 — state machine이 있는 member의 함수 parameter와 passthrough 결과

의존: Wave 1.

`machine`이 있는 member는 method일 수 있고, 함수 타입의 parameter를 받고 `passthrough`를 돌려줄 수 있다(GN-6ae). transaction의
범위에 그것이 필요하며, 다섯 target이 각각 그것을 생성한다. 그런 member의 진입은 계약에서 이름이 오는 생성된 crate의
함수이므로, 이 wave는 GN-4c의 이름도 다룬다.
생성된 crate에는 계약에서 이름이 오는 함수가 생성기의 helper 옆에 있고, 계약은 unit, 함수, library를 어떤 단어로도 이름할
수 있다. GN-4c는 계약의 이름을 가진 함수마다 어떤 helper도 시작하지 않는 계열의 접두를 준다. 이 wave는 아직 그 규칙 밖에
있는 이름을 규칙 아래로 가져온다: 다른 library의 오류의 helper, 그리고 다른 레포의 unit의 변환이다. 그 변환의 이름
`<library>_<name>`은 자기 unit도 가질 수 있다.
