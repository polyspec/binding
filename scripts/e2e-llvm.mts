// GN-14a: the LLVM of the PHP target. The bindgen of ext-php-rs loads a libclang through clang-sys, which takes the
// libclang of the highest release that it finds on the machine, and asks a clang executable for the directories of the
// headers that it includes, which is the clang of PATH. On a machine with several LLVM releases the two differ: the
// ubuntu-26.04 runners hold LLVM 20, 21 and 22 with clang 21 as /usr/bin/clang, so libclang 22 parsed the x86 headers
// of clang 21, whose builtins LLVM 22 no longer has, and failed. A run therefore gives the libclang and the clang of
// the one LLVM that config/toolchain.json pins by its major release.

export interface Llvm {
  // The directory of the libclang shared library (LIBCLANG_PATH of clang-sys).
  libclang: string;
  // The clang executable whose headers bindgen includes (CLANG_PATH of clang-sys).
  clang: string;
}

// The installation of LLVM <major> by the package manager of the platform: the packages of Ubuntu and Debian install it
// under /usr/lib/llvm-<major>, and Homebrew on macOS (arm64, the deployment target) as the formula llvm@<major>.
export function llvmOf(platform: NodeJS.Platform, major: string): Llvm | undefined {
  const prefix = platform === 'linux' ? `/usr/lib/llvm-${major}` : platform === 'darwin' ? `/opt/homebrew/opt/llvm@${major}` : undefined;
  return prefix === undefined ? undefined : { libclang: `${prefix}/lib`, clang: `${prefix}/bin/clang` };
}

// The variables of the environment with which clang-sys and bindgen choose another libclang, clang or header: a run
// sets the first two itself, and one given by hand makes the run a diagnosis (GN-14b).
export const LLVM_BY_HAND = ['LIBCLANG_PATH', 'CLANG_PATH', 'LLVM_CONFIG_PATH', 'BINDGEN_EXTRA_CLANG_ARGS'] as const;
