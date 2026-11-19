// GN-15f, B2.552: the refusal of a failed cargo metadata. It gives the error that Cargo wrote first, and names the
// install target that fetches the crates of Cargo.lock only when that error says that a crate is missing offline:
// Cargo then names --offline ("attempting to make an HTTP request, but --offline was specified", "As a reminder,
// you're using offline mode (--offline)") or the offline mode of a Git checkout ("you are in the offline mode").
// Any other failure, such as a workspace member whose Cargo.toml does not exist, is not fixed by a fetch.
export function cargoMetadataFailure(status: number | null, stderr: string): string {
  const error = stderr.trim();
  const head = `cargo metadata failed with status ${String(status)}${error === '' ? '' : `:\n${error}`}`;
  const missingOffline = /--offline\b|offline mode/.test(error);
  return missingOffline
    ? `${head}\nrun the install target of the repository that fetches the crates of its Cargo.lock (cargo fetch --locked), then run the command again`
    : head;
}
