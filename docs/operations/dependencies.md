<!-- doc-id: operations-dependencies -->
# Dependencies

[한국어](dependencies.ko.md)

Each exact pin of an input from outside the repository that no lock of a package manager holds, with its reason and
the condition that ends it.

## The C compiler of musl of `make go-musl-check`

`goMusl` of `config/toolchain.json` pins the image `alpine:3.22` by the digest of its index and the Alpine packages
`gcc` (`14.2.0-r6`) and `musl-dev` (`1.2.5-r13`), which `scripts/go-musl.sh` installs with
`apk add --no-cache gcc=<version> musl-dev=<version>` in the container that links and runs the consumer of the released
form of a Go module on musl (GN-14f, GN-15g). The Go of that container is the Go of `mise.lock`, checked by its sha256.

- Why: the result of the check depends on the C compiler and the C library that link the programs, so they are
  inputs of the check and are named by their exact versions, as every other input from outside the repository is.
  The image pins the base system; the versions of the two packages pin the C compiler and the headers and the static
  parts of musl, which the image does not hold. No Git is installed: the modules come from the module proxy that the
  end-to-end run keeps of its downloads, which `go.sum` of the consumer pins.
- When the pin changes: an Alpine branch keeps one version of a package, so `apk add` fails with the named version
  when the branch publishes a fix of `gcc` or `musl-dev`. The check then fails before it builds, naming the package,
  and the pin moves to the version of the branch in one change with its record here. The main repository of Alpine
  3.22 is supported until May 2027; when that support ends, the pin moves to a supported branch in one change with
  its record here.

## The LLVM of the PHP target of `make e2e`

`llvm` of `config/toolchain.json` pins LLVM 21 by its major release. `make e2e` gives the libclang and the clang of
that LLVM (`/usr/lib/llvm-21` on Ubuntu and Debian, the Homebrew formula `llvm@21` on macOS, `scripts/e2e-llvm.mts`)
to the build of ext-php-rs as `LIBCLANG_PATH` and `CLANG_PATH`, and fails before its first step, naming the PHP
target, when either is missing or the clang is of another major release (GN-14a).

- Why: the build script of ext-php-rs 0.16.4 generates the bindings of the PHP headers with bindgen 0.73.2, which
  loads libclang through clang-sys 1.9.1 and takes the directories of the headers that it includes from a clang
  executable. Without `LIBCLANG_PATH`, clang-sys loads the libclang of the highest release that it finds in the
  directories of the machine, and without `CLANG_PATH` bindgen takes the clang of `PATH`. The ubuntu-26.04 runner
  images install LLVM 20, 21 and 22 and make clang 21 `/usr/bin/clang`, so libclang 22 parsed the x86 headers of
  clang 21: those headers call `__builtin_ia32_sqrtss`, `__builtin_ia32_sqrtps`, `__builtin_ia32_sqrtsd` and
  `__builtin_ia32_sqrtpd`, which LLVM 22 replaced with `__builtin_elementwise_sqrt`, so libclang 22 declared them
  as functions that return `int` and refused `xmmintrin.h:245`, `:262` and `emmintrin.h:253`, `:269`, and the PHP
  target of the job `e2e-amd64` failed. The arm64 job passed because the PHP headers include those x86 headers on
  x86_64 only. ext-php-rs 0.16.4, bindgen 0.73.2 and clang-sys 1.9.1 are the latest releases, and none of them takes
  the libclang and the clang from one installation, so no newer release removes the mismatch. LLVM 21 is the default
  clang of both runner images, and its release gives the bindings that the run checks, so it is pinned.
- When the pin changes: when the runner images make another release their default clang, the pin moves to it in one
  change with its record here; the check names the missing LLVM until then. The pin ends when clang-sys or bindgen
  take the libclang and the clang of one LLVM installation themselves.
