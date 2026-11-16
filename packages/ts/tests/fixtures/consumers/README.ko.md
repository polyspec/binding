<!-- doc-id: fixture-consumers -->
<!-- source-sha256: de2134f85bbcfc513adfeff7b3894e8b77b65b4b7dd225898a31d35be2678c33 -->
# Consumer 계약

[English](README.md)

consumer repository 두 곳의 계약을 복사한 것이다. B2.418의 unit test는 각 계약의 모든 target을 생성하고 그 `use`
선언을 검사한다(GN-4e). unit test는 다른 checkout을 읽지 않으므로 복사본을 여기에 둔다.

- `json/interface.json`은 json v0.0.32의 packages/rust/interface.json이다. `json/contracts/core.json`은 그
  contracts/core.json을 각 group의 첫 case만 남기고 줄인 것이다.
- `session-store/interface.json`은 개발 중인 session-store 0.0.1의 계약, packages/rust/interface.json이다.
  `session-store/contracts/sessions.json`, `file-sessions.json`, `redis-sessions.json`은 같은 이름의 case 파일을 각각
  각 group의 첫 case만 남기고 줄인 것이다. `session-store/php-serialization.json`은 php-serialization v0.0.11의
  packages/rust/interface.json이다. session-store의 계약이 php-serialization을 이름으로 쓰므로, 생성에는 그 계약이
  foreign 계약으로 필요하다.

case 파일을 줄인 이유: 모든 target의 생성된 Rust 파일은 전체 case 파일로 생성하든 줄인 case 파일로 생성하든 byte
단위로 같다. 복사본을 가져올 때 두 계약 모두에서 한 번 확인했다. case 파일이 바꾸는 것은 각 언어의 생성된 test뿐이고,
unit test는 그것을 읽지 않는다.
