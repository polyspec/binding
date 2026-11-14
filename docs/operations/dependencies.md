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
