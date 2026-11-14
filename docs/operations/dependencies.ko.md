<!-- doc-id: operations-dependencies -->
<!-- source-sha256: 449feeb6c8db0cd3308ad03932629537c1b96737046c6bcebfc86776f971c89c -->
# 의존성

[English](dependencies.md)

패키지 관리자의 lock이 담지 않는, 레포 밖에서 오는 입력의 정확한 고정 각각과 그 이유, 그리고 그것을 끝내는 조건.

## `make go-musl-check`의 musl C 컴파일러

`config/toolchain.json`의 `goMusl`은 이미지 `alpine:3.22`를 그 index의 digest로, Alpine 패키지 `gcc`
(`14.2.0-r6`)와 `musl-dev`(`1.2.5-r13`)를 고정한다. `scripts/go-musl.sh`는 Go 모듈의 release 형태의
소비자를 musl에서 링크하고 실행하는 컨테이너에서 `apk add --no-cache gcc=<version> musl-dev=<version>`으로 그것들을
설치한다(GN-14f, GN-15g). 그 컨테이너의 Go는 sha256으로 확인한 `mise.lock`의 Go다.

- 이유: 검사의 결과는 프로그램을 링크하는 C 컴파일러와 C library에 달려 있으므로, 그것들은 검사의 입력이며 레포 밖에서
  오는 다른 입력처럼 정확한 버전으로 적는다. 이미지는 기본 시스템을 고정하고, 두 패키지의 버전은 이미지가 담지 않는 C
  컴파일러와 musl의 header와 정적 부분을 고정한다. Git은 설치하지 않는다. 모듈은 end-to-end 실행이 자기 download로
  남긴 module proxy에서 오며, 소비자의 `go.sum`이 그것을 고정한다.
- 고정이 바뀌는 때: Alpine branch는 패키지의 버전을 하나만 두므로, branch가 `gcc`나 `musl-dev`의 수정판을 내면 이름을 적은
  버전의 `apk add`가 실패한다. 그러면 검사는 빌드 전에 그 패키지를 말하며 실패하고, 고정은 여기의 기록과 함께 한
  변경에서 branch의 버전으로 옮긴다. Alpine 3.22의 main repository는
  2027년 5월까지 지원된다. 그 지원이 끝나면 고정은 여기의 기록과 함께 한 변경에서 지원되는 branch로 옮긴다.
