<!-- doc-id: fixture-consumers -->
<!-- source-sha256: 568ea8a3334689781ecf4e995d0434f02771e9d3697e227dc5d067621a0e8464 -->
# Consumer 계약

[English](README.md)

consumer repository들의 계약을 복사한 것이다. unit test는 다른 checkout을 읽지 않으므로 복사본을 여기에 둔다.
복사본은 두 종류다.

## 줄인 복사본

B2.418의 unit test는 각 계약의 모든 target을 생성하고 그 `use` 선언을 검사한다(GN-4e).

- `json/interface.json`은 json v0.0.32의 packages/rust/interface.json이다. `json/contracts/core.json`은 그
  contracts/core.json을 각 group의 첫 case만 남기고 줄인 것이다.
- `session-store/interface.json`은 개발 중인 session-store 0.0.1의 계약, packages/rust/interface.json이다.
  `session-store/contracts/sessions.json`, `file-sessions.json`, `redis-sessions.json`은 같은 이름의 case 파일을 각각
  각 group의 첫 case만 남기고 줄인 것이다. `session-store/php-serialization.json`은 php-serialization v0.0.11의
  packages/rust/interface.json이다. session-store의 계약이 php-serialization을 이름으로 쓰므로, 생성에는 그 계약이
  foreign 계약으로 필요하다.

case 파일을 줄인 이유: 모든 target의 생성된 Rust 파일은 전체 case 파일로 생성하든 줄인 case 파일로 생성하든 byte
단위로 같다. 복사본을 가져올 때 두 계약 모두에서 한 번 확인했다. case 파일이 바꾸는 것은 각 언어의 생성된 test뿐이고,
unit test는 그것을 읽지 않는다. 검사는 줄인 복사본을 거부한다. CK-22가 member가 raise하는 kind마다 그 case를 읽기
때문이다. 그래서 이 두 복사본에는 어떤 test도 검사를 실행하지 않는다.

## 전체 복사본

B2.363의 unit test는 전체 복사본마다 이 tree의 검사를 실행하고 그 target을 각각 생성한다. B2.418의 test도 그 `use`
선언을 읽는다. 복사본의 디렉터리는 그 repository의 root를 대신한다. `interface.json`이 계약이고, 계약이 이름으로 쓰는
case 파일은 각각 그 root에서의 경로에 있다. 모든 파일은 원본 파일과 byte 단위로 같고, 빠진 case는 없다. 검사가 모든
case를 읽기 때문이다.

| 복사본 | 원본 | 원본에서의 계약 |
|---|---|---|
| `php-serialization/` | php-serialization v0.0.15 | packages/rust/interface.json |
| `http-media-type/` | http-media-type v0.0.8 | packages/rust/interface.json |
| `http-cookie/` | http-cookie v0.0.8 | packages/rust/interface.json |
| `http-negotiation/` | http-negotiation v0.0.5 | packages/rust/interface.json |
| `http-form/` | http-form v0.0.1 | packages/rust/interface.json |
| `fsm/` | fsm v0.0.16 | packages/rust/interface.json |
| `template/` | template v0.0.28 | packages/rust/interface.json |
| `orm/` | orm, 2026-11-17의 branch models/declare-in-core | packages/rust/interface.json |
| `crud-ui-validator/` | crud-ui, 2026-11-17의 branch lane/cases | packages/validator/rust/interface.json |
| `crud-ui-generator/` | crud-ui, 2026-11-17의 branch lane/cases | packages/generator/rust/interface.json |
| `hyper/` | hyper, 2026-11-17의 branch lane/d2-http-form | packages/rust/interface.json |

orm, crud-ui, hyper에는 binding의 계약을 담은 release tag가 없다(orm v0.0.33, crud-ui v0.0.20, hyper v0.0.40에는
없다). 그래서 각 복사본은 그날 계약을 담고 있던 branch의 가장 새 commit에서 가져왔다. 계약을 담은 첫 release tag가
나오면 그 tag에서 다시 가져온다.

hyper는 case 파일 가운데 `packages/rust/tests/cases/faults.json`만 추적한다. `hyper/var/binding-cases/`의 다섯 파일은
hyper의 `scripts/binding-cases.mts`가 같은 commit의 `config/binding-cases.json`과 `contracts/`에서 쓰는
파일이다(hyper의 target `make binding-cases`). hyper의 checkout 밖에서 실행했다.

다른 library를 이름으로 쓰는 계약은 그 library의 계약을 이 디렉터리의 복사본에서 받는다.

| 복사본 | 읽는 계약 |
|---|---|
| `http-negotiation/` | `http-media-type/` |
| `template/`, `orm/`, `crud-ui-validator/` | `json/` |
| `crud-ui-generator/` | `json/`, `crud-ui-validator/` |
| `hyper/` | `template/`, `json/`, `http-negotiation/`, `http-media-type/`, `http-cookie/`, `session-store/`, `php-serialization/` |

복사본 `json/`은 json v0.0.32이고, template, orm, crud-ui, hyper는 json v0.0.34에 의존한다. hyper는 session-store
v0.0.4와 template의 branch v1/rust-core에 의존하는데, 복사본은 session-store 0.0.1과 template v0.0.28이다.

`findings.json`은 이 tree의 검사가 전체 복사본에서 내는 finding을 그 이유, 그리고 그것이 끝나는 조건과 함께 기록한다.
그런 finding은 복사본의 repository가 할 일이다. test는 `findings.json`이 기록하지 않은 finding이 나오면 실패하고,
finding이 사라진 항목이 남아 있어도 실패한다.
