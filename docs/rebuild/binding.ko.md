<!-- doc-id: rebuild-binding -->
<!-- source-sha256: 6e43b887ba5507672ae3358c3634f597862ec3b4f9f3be675042a4c9b09d7298 -->
# 재구현 기록: binding

[English](binding.md)

PRINCIPLES S1과 P14는 맞는 기존 도구가 있으면 그것을 쓰라고 요구한다. 이 기록은 binding이 해야 하는 일, 그 요구에 비추어
판정한 도구와 각각의 판정, 그리고 그에 따른 구현 언어(S9)를 적는다.

## 요구

binding은 레포마다 인터페이스 계약 하나(`contracts/interface.json`, 스키마 `packages/ts/schema/interface.schema.json`)와 코어 crate를
읽고 바인딩과 그 선언을 만든다. 도구는 다음을 모두 만족할 때만 맞는다. 각 항목은 모든 레포의 바인딩이 지켜야 하는
규칙이기 때문이다(`docs/spec/`의 설계 id).

- R1 대상: 계약 하나로 PHP(ext-php-rs), Python(PyO3, abi3), Node(napi-rs), Go(C ABI 층 위의 cgo), 브라우저 WASM
  (wasm-bindgen) 바인딩과 각 선언(PHP stub, `.pyi`, `.d.ts`)을 만든다(I-1, I-4).
- R2 오류 클래스: category(`value`, `type`, `io`, `store`, `busy`, `internal`)마다 계약 표의 언어별 기반 클래스가 하나 있고,
  오류 unit은 선언한 `parent`나 그 기반 클래스를 상속하며, kind의 클래스 덮어쓰기는 같은 category의 오류 unit만 가리키고,
  모든 오류는 언어마다 한 형태로 `kind`, `status`, `errno`를 내며, Go 오류는 같은 사슬을 `As`로 따른다(E-1~E-7, B-4).
- R3 역호출: 언어 객체가 코어 trait을 구현한다. 계약은 member마다 Promise·awaitable을 돌려줄 수 있는지(`async_allowed`),
  언어 예외가 코어를 어떻게 지나는지(`propagate`, `{kind}`, `{recognize}`), 스레드 규칙(`owner`는 다른 스레드를 kind
  `wrong_thread`로 거부)을 적고, callback 객체는 받는 시점에 확인한다(U-3, B-5b).
- R4 wait 형태: `none`, `blocking_io`, `process_wait`, `async_driver`는 언어마다 서로 다른 네 형태이고(Node는 libuv 풀의
  `AsyncTask`와 `ThreadsafeFunction`을 쓰는 전용 스레드를 구별하고, Python은 `py.detach`와 생성된 `a<name>` awaitable), 코어 시그니처의 서로
  다른 토큰 타입으로 증명되며, busy 규칙 B-5c는 receiver에서 생성된다(U-2).
- R5 계약 먼저: Rust 소스가 아니라 언어 중립 계약이 공개 API의 선언이다. 이름은 언어마다 한 규칙으로 바꾸는 낱말 목록이고
  예외에는 규칙 id가 필요하다. 패키지 배치, 상속, `changes`, `cases`가 계약에 있다. binding은 Rust 소스를 파싱하지 않고,
  계약과 코어의 일치는 생성 crate의 컴파일로 판정한다(I-2, I-3, N-1~N-3).

## 판정한 도구

버전은 2026-11-12의 crates.io, npm, 또는 프로젝트 태그의 최신 릴리스다. "예"는 배포된 그대로 요구를 만족한다는 뜻이고,
"아니오"는 빠진 부분을 적는다.

| 도구와 버전 | R1 대상 | R2 오류 클래스 | R3 역호출 | R4 wait 형태 | R5 계약 먼저 | 판정 |
|---|---|---|---|---|---|---|
| uniffi 0.32.2와 uniffi-bindgen-go 0.7.1+v0.31.0, uniffi-bindgen-react-native 0.31.0-7, uniffi-bindgen-node 0.1.5 | 아니오: 내장은 Kotlin, Swift, Python(PyO3가 아닌 ctypes), Ruby. Go, WASM, Node는 제삼자이며 Node는 초기 개발 단계. PHP 없음 | 아니오: 오류 enum마다 예외 클래스 하나와 변형마다 하위 클래스. category 기반 클래스와 선언한 parent 없음 | 일부: callback interface와 foreign trait은 있음. 스레드 규칙과 recognize 없음 | 아니오: 동기 또는 `async fn`. 짧은 블로킹 I/O와 다른 프로세스 기다림의 구별, busy 규칙 없음 | 아니오: API를 Rust proc macro나 UDL에서 읽음 | 쓸 수 없음 |
| diplomat 0.17.0, diplomat-tool 0.17.0 | 아니오: C, C++, JS(WASM), Dart, Kotlin, Python(nanobind). PHP, Go, Node addon 없음 | 아니오: `Result`가 backend마다 예외 하나. 계층 없음 | 일부: 일부 backend만 trait | 아니오: 비동기 모델 없음 | 아니오: API가 `#[diplomat::bridge]` Rust 모듈 | 쓸 수 없음 |
| interoptopus 0.16.6 | 아니오: 유지되는 backend는 C#뿐. C와 Python(CPython)은 중단 | 아니오 | 일부: callback과 service | 일부: C#의 Tokio 비동기 service | 아니오: Rust 항목의 `#[ffi]` | 쓸 수 없음 |
| cbindgen 0.29.4와 언어별 손으로 쓴 래퍼 | 아니오: C 헤더만 쓴다. 언어 층을 모두 손으로 써야 하며 L-2와 G-5가 금한다 | 아니오 | 아니오 | 아니오 | 아니오: Rust 소스를 읽음 | 생성기로는 쓸 수 없음. Go C ABI 층의 C 헤더 작성기 후보(아래) |
| alef 0.129.1 | 이름으로는 예: PyO3, napi-rs, ext-php-rs 위의 PHP 확장, C FFI 층 위의 cgo, wasm-bindgen, stub과 `.d.ts` | 아니오: Rust 오류 변형마다 Python 예외 하나, 오류 enum마다 기반 하나(`create_exception!`). category 기반 표, 선언한 parent, `kind`/`status`/`errno` 형태 없음 | 일부: "trait bridge"는 있음. `owner` 스레드 규칙, member별 `async_allowed`, recognize 없음 | 아니오: 동기 래퍼는 GIL을 놓고 async 함수는 일반 래퍼를 받지만 호출은 동기 아니면 비동기뿐이다. 짧은 블로킹 I/O(libuv 풀)와 다른 프로세스 기다림(전용 스레드)의 구별, 코어 시그니처의 `Io`/`ProcessWait` 증명, busy 규칙 없음 | 아니오: `alef extract`가 Rust 소스를 `syn`으로 읽어 자체 IR로 만들고, 언어별 설정 절이 항목의 이름과 형태를 바꾼다 | 쓸 수 없음. 쓰려면 추출기, 오류 모델, wait 모델을 바꿔야 하며 그것이 생성기 전체다 |
| boltffi 0.32.1 | 아니오: Swift, Kotlin, Java, C#, WASM/TypeScript, Python, C. Go는 예정. PHP, Node addon 없음 | 아니오: 오류가 계층 없는 언어 예외 | 일부: functional interface | 일부: 비동기는 런타임 future 타입. 블로킹 구별 없음 | 아니오: Rust 항목의 `#[export]`/`#[data]` | 쓸 수 없음 |
| flapigen 0.12.3 | 아니오: Java, C++ | 아니오 | 일부 | 아니오 | 아니오: Rust의 `foreign_class!` | 쓸 수 없음 |
| safer-ffi 0.1.13 | 아니오: C ABI와 C 헤더 | 아니오 | 아니오 | 아니오 | 아니오 | 생성기로는 쓸 수 없음 |
| ext-php-rs 0.16.4 | PHP만 | 일부: 예외 클래스를 parent와 함께 등록할 수 있다. 계층은 생성해야 한다 | 일부: zval 호출 | 해당 없음 | 아니오: Rust macro | PHP 대상 런타임으로 쓴다(I-4). 생성 코드가 부르는 것 |
| PyO3 0.30.1 | Python만 | 일부: 기반을 지정한 `create_exception!` | 예: `Py<PyAny>` 호출 | 일부: `py.detach`. awaitable은 pyo3-async-runtimes | 아니오: Rust macro | Python 대상 런타임으로 쓴다(I-4) |
| napi 3.16.2, napi-derive 3.7.1 | Node만(WASI 대상은 I-4의 브라우저 wasm-bindgen 대상이 아님) | 일부: 오류에 status가 있고 클래스 계층 없음 | 예: `ThreadsafeFunction` | 예: `AsyncTask`, `async fn` | 아니오: Rust macro. `.d.ts`를 Rust 항목에서 씀 | Node 대상 런타임으로 쓴다(I-4) |
| wasm-bindgen 0.2.130 | 브라우저만 | 아니오 | 일부: JS import | 일부: wasm-bindgen-futures의 Promise | 아니오: Rust macro | WASM 대상 런타임으로 쓴다(I-4) |
| typeshare 1.0.5 | 타입만: Swift, Go, Python, Kotlin, Scala, TypeScript | 아니오 | 아니오 | 아니오 | 아니오: Rust 소스를 읽음 | 쓸 수 없음: 데이터 타입을 선언할 뿐 바인딩을 만들지 않는다 |
| specta 1.0.5, tsify 0.5.8 | 타입만: TypeScript | 아니오 | 아니오 | 아니오 | 아니오: Rust derive | 같은 이유로 쓸 수 없음 |

## 판정

조사한 도구 가운데 다섯 요구를 만족하는 것은 없다. 가장 가까운 alef는 대상을 덮지만 입력이 Rust 소스이고, 오류 모델이
Rust 변형마다 클래스이며, wait 모델이 짧은 블로킹 I/O와 다른 프로세스 기다림을 구별하지 않는다. 각각이 R2, R4, R5의
규칙이므로 alef를 쓰려면 그 부분들을 바꿔야 한다. 그래서 binding을 만들고, 언어별 프레임워크는 그대로 쓴다. 생성 코드가
ext-php-rs, PyO3, napi-rs, wasm-bindgen, cgo를 부르며 binding은 그 어느 것도 다시 구현하지 않는다(P14). Go C ABI 층의
C 헤더 작성기(cbindgen 0.29.4)는 Go 대상을 만들 때 다시 판정한다. 그 층은 계약에서 생성되므로 헤더도 함께 생성할 수 있다.

## 구현 언어

binding은 TypeScript로 쓰고 `erasableSyntaxOnly`를 켠 `tsc`로 검사하며 Node로 실행한다.

- S9는 언어를 가로지르는 조율과 검사를 TypeScript로 쓴다고 정한다. binding은 계약 하나를 읽어 다섯 언어의 코드를 쓰고,
  계약 검사는 언어를 가로지르는 규칙(상속, Go 이름, 값 왕복)을 판정하므로 언어를 가로지르는 조율이자 검사다.
- S9의 예외는 자기 언어를 유지한다. `check-host`(I-1)의 기호 추출기는 각 생태계의 도구(`tsc`, Python `inspect`, PHP
  Reflection)를 실행하고, 언어별 생성 시험은 각 표준 runner(S3)에서 실행한다.
- 생성된 Rust 코드가 링크하는 런타임 지원은 Rust crate `binding_core`(packages/core/rust)다. 생성 crate와 코어 crate의
  의존이며 조율이 아니기 때문이다.
- 스키마 검증은 binding 자체 검증기가 아니라 Ajv(JSON Schema 2020-12)로 한다(P14).
