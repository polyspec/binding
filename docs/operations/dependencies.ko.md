<!-- doc-id: operations-dependencies -->
<!-- source-sha256: b98af316fa0c3bee50acfef3ceaa58a9d422215041f27b3578c464ad315ad717 -->
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

## `make e2e`의 PHP 대상의 LLVM

`config/toolchain.json`의 `llvm`은 LLVM 21을 major 릴리스로 고정한다. `make e2e`는 그 LLVM의 libclang과 clang
(Ubuntu와 Debian에서는 `/usr/lib/llvm-21`, macOS에서는 Homebrew formula `llvm@21`, `scripts/e2e-llvm.mts`)을
ext-php-rs의 빌드에 `LIBCLANG_PATH`와 `CLANG_PATH`로 주고, 둘 중 하나가 없거나 clang이 다른 major 릴리스이면 첫 단계
전에 PHP 대상을 말하며 실패한다(GN-14a).

- 이유: ext-php-rs 0.16.4의 build script는 bindgen 0.73.2로 PHP header의 binding을 생성한다. bindgen은 clang-sys
  1.9.1로 libclang을 읽고, 포함하는 header의 디렉터리를 clang 실행 파일에서 받는다. `LIBCLANG_PATH`가 없으면 clang-sys는
  기계의 디렉터리에서 찾은 가장 높은 릴리스의 libclang을 읽고, `CLANG_PATH`가 없으면 bindgen은 `PATH`의 clang을 쓴다.
  ubuntu-26.04 runner 이미지는 LLVM 20, 21, 22를 설치하고 clang 21을 `/usr/bin/clang`으로 두므로, libclang 22가 clang
  21의 x86 header를 읽었다. 그 header는 `__builtin_ia32_sqrtss`, `__builtin_ia32_sqrtps`, `__builtin_ia32_sqrtsd`,
  `__builtin_ia32_sqrtpd`를 부르는데, LLVM 22는 이것들을 `__builtin_elementwise_sqrt`로 바꾸었다. 그래서 libclang 22는
  이것들을 `int`를 돌려주는 함수로 선언하고 `xmmintrin.h:245`, `:262`, `emmintrin.h:253`, `:269`를 거부했으며, job
  `e2e-amd64`의 PHP 대상이 실패했다. arm64 job은 PHP header가 그 x86 header를 x86_64에서만 포함하므로 통과했다.
  ext-php-rs 0.16.4, bindgen 0.73.2, clang-sys 1.9.1은 최신 릴리스이고, 어느 것도 libclang과 clang을 한 설치에서 받지
  않으므로 더 새 릴리스가 이 불일치를 없애지 않는다. LLVM 21은 두 runner 이미지의 기본 clang이고, 그 릴리스가 실행이
  확인하는 binding을 정하므로 고정한다.
- 고정이 바뀌는 때: runner 이미지가 다른 릴리스를 기본 clang으로 하면, 고정은 여기의 기록과 함께 한 변경에서 그것으로
  옮긴다. 그때까지 검사는 없는 LLVM을 말한다. clang-sys나 bindgen이 libclang과 clang을 스스로 한 LLVM 설치에서 받으면
  고정은 끝난다.
