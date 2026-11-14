#!/bin/sh
# GN-14f, GN-15g: the consumer of the released form of a Go module on musl.
#
#   make go-musl-check WORK=<work directory of a run of make e2e on Linux>
#
# which runs sh scripts/go-musl.sh <work> <mise.lock> <config/toolchain.json>. A run of make e2e on Linux keeps the repositories
# that stand for the remotes, the consumer of its released form and a module proxy of its downloads in
# <work>/go-release, and the commit of each Go module carries the library of musl of the arch of the run
# (internal/ffi/lib/linux_<arch>_musl). This script runs, on the machine of the Docker of DOCKER_HOST, a container of
# the Alpine image of config/toolchain.json with the work directory mounted at /work, and in it go test -tags musl of the
# consumer and of every package of the fetched modules, so that a C compiler of musl links each program and a musl
# machine runs it. The Go is the one of mise.lock for the arch of that machine, checked by its sha256; the C compiler
# is gcc and musl-dev of Alpine at the exact versions of config/toolchain.json (goMusl). The modules come from the
# module proxy that the run kept in <work>/go-release/proxy, the downloads that go.sum of the consumer pins, so no Git
# takes part. It fails unless a test ran and none failed. The container has a
# name that starts with polyspec- and is removed when it ends (docker run --rm), also on SIGINT and SIGTERM (HR-87).
set -eu

if [ "$#" -ne 3 ] || [ -z "$1" ] || [ ! -f "$2" ] || [ ! -f "$3" ]; then
  echo 'usage: make go-musl-check WORK=<work directory of a run of make e2e on Linux>' >&2
  exit 2
fi
work=$1
lock=$2
toolchain=$3
# The image and the packages of Alpine, from goMusl of config/toolchain.json: one value on each line of its own.
value() { awk -v k="\"$1\":" '$1 == k { v = $2; gsub(/[",]/, "", v); print v }' "$toolchain"; }
image=$(value image)
packages="gcc=$(value gcc) musl-dev=$(value musl-dev)"
case "$image $packages" in
  *'= '* | ' '* | *'=') echo "go-musl-check: $toolchain names no image, gcc or musl-dev of goMusl" >&2; exit 2 ;;
esac

case "$(docker info --format '{{.Architecture}}')" in
  aarch64 | arm64) platform=linux-arm64 ;;
  x86_64 | amd64) platform=linux-x64 ;;
  *) echo "go-musl-check: the Docker of DOCKER_HOST runs on $(docker info --format '{{.Architecture}}'), no arch of a Go module (GN-15g)" >&2; exit 2 ;;
esac
# The url and the checksum of the Go of mise.toml for that platform, from its table in mise.lock.
section="[tools.go.\"platforms.$platform\"]"
url=$(awk -v s="$section" '$0 == s { on = 1; next } /^\[/ { on = 0 } on && $1 == "url" { gsub(/"/, "", $3); print $3 }' "$lock")
sum=$(awk -v s="$section" '$0 == s { on = 1; next } /^\[/ { on = 0 } on && $1 == "checksum" { gsub(/"|sha256:/, "", $3); print $3 }' "$lock")
if [ -z "$url" ] || [ -z "$sum" ]; then
  echo "go-musl-check: $lock has no url or checksum of the Go of $platform" >&2
  exit 2
fi

name="polyspec-go-musl-$$"
trap 'docker rm --force "$name" >/dev/null 2>&1 || true; exit 130' INT
trap 'docker rm --force "$name" >/dev/null 2>&1 || true; exit 143' TERM

# The commands in the container. go test -json gives an event for each test, so the counts are those of the events.
inner='set -eu
apk add --no-cache $PACKAGES >/dev/null
wget -q -O /tmp/go.tar.gz "$GO_URL"
echo "$GO_SUM  /tmp/go.tar.gz" | sha256sum -c -
tar -C /usr/local -xzf /tmp/go.tar.gz
export PATH=/usr/local/go/bin:$PATH
cd "/work/go-release/consumer"
export GOENV=off GOTOOLCHAIN=local GOPROXY="file:///work/go-release/proxy" GOSUMDB=off GOMODCACHE=/tmp/modcache GOCACHE=/tmp/gocache
export GOFLAGS=-tags=musl CGO_ENABLED=1 CGO_LDFLAGS= CC=gcc
modules=$(go list -m -f "{{if not .Main}}{{.Path}}/...{{end}}" all)
echo "\$ go test -tags musl -json -count=1 . $modules"
status=0
go test -json -count=1 . $modules > /tmp/events.json || status=$?
grep -v "\"Action\":\"output\"" /tmp/events.json | grep "\"Test\":" | grep -E "\"Action\":\"(pass|fail|skip)\"" | sed -E "s/.*\"Action\":\"([a-z]+)\".*\"Package\":\"([^\"]+)\".*\"Test\":\"([^\"]+)\".*/\\1 \\2 \\3/" || true
grep "\"Action\":\"output\"" /tmp/events.json | grep -E "FAIL|panic|undefined|cannot|error" | sed -E "s/.*\"Output\":\"(.*)\".*/\\1/" || true
passed=$(grep -c "\"Action\":\"pass\",\"Package\":\"[^\"]*\",\"Test\"" /tmp/events.json || true)
failed=$(grep -c "\"Action\":\"fail\",\"Package\":\"[^\"]*\",\"Test\"" /tmp/events.json || true)
echo "go test -tags musl on $(cat /etc/alpine-release) (musl): $passed passed, $failed failed, exit $status"
[ "$status" -eq 0 ] && [ "$failed" -eq 0 ] && [ "$passed" -gt 0 ]'

docker run --rm --name "$name" -v "$work:/work" -e "PACKAGES=$packages" -e "GO_URL=$url" -e "GO_SUM=$sum" "$image" sh -c "$inner"
