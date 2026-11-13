//! Design I-2 (4): only generated code makes a wait token. A crate that depends on binding_core without the feature
//! `construct`, as the library of a core crate does, must not compile when it makes a token, and a crate with the
//! feature, as a generated binding crate does, must compile. Each case builds a crate of its own in the temporary
//! directory of the test.

use std::path::{Path, PathBuf};
use std::process::Command;

fn write_crate(name: &str, features: &str, body: &str) -> Result<PathBuf, String> {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let src = root.join("src");
    std::fs::create_dir_all(&src).map_err(|error| format!("create {}: {error}", src.display()))?;
    let core = Path::new(env!("CARGO_MANIFEST_DIR"));
    let manifest = format!(
        "[package]\nname = \"{name}\"\nversion = \"0.0.0\"\nedition = \"2021\"\npublish = false\n\n\
         [dependencies]\nbinding_core = {{ package = \"polyspec-binding-core\", path = {core:?}{features} }}\n\n\
         [workspace]\n"
    );
    std::fs::write(root.join("Cargo.toml"), manifest).map_err(|error| format!("write manifest: {error}"))?;
    std::fs::write(src.join("lib.rs"), body).map_err(|error| format!("write lib.rs: {error}"))?;
    Ok(root)
}

fn check(root: &Path) -> Result<(bool, String), String> {
    let output = Command::new(env!("CARGO"))
        // The toolchain that builds this test builds the crate under test; whether it meets rust-version was decided by
        // the build of this test, so the inner check does not decide it again.
        .args([
            "check",
            "--offline",
            "--quiet",
            "--ignore-rust-version",
            "--manifest-path",
        ])
        .arg(root.join("Cargo.toml"))
        .env("CARGO_TARGET_DIR", root.join("target"))
        .output()
        .map_err(|error| format!("run cargo: {error}"))?;
    Ok((
        output.status.success(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

const MAKES_TOKENS: &str = "pub fn make() -> (binding_core::Io, binding_core::ProcessWait) {\n    \
    (binding_core::Io::for_generated_call(), binding_core::ProcessWait::for_generated_call())\n}\n";

const OPENS_RAISED: &str = "pub fn open(raised: &binding_core::Raised) -> binding_core::Native {\n    \
    let _made = binding_core::Raised::from_generated(raised.native().clone());\n    raised.native().clone()\n}\n";

#[test]
fn a_crate_without_the_feature_cannot_make_a_token() -> Result<(), String> {
    let root = write_crate("core_library", "", MAKES_TOKENS)?;
    let (success, stderr) = check(&root)?;
    assert!(!success, "the crate compiled without the feature construct");
    // The intended reason: the constructor does not exist, not some other build failure.
    assert!(
        stderr.contains("error[E0599]") && stderr.contains("`for_generated_call`"),
        "the build failed for another reason:\n{stderr}"
    );
    Ok(())
}

#[test]
fn a_crate_without_the_feature_cannot_make_or_open_a_raised_exception() -> Result<(), String> {
    let root = write_crate("core_library_raised", "", OPENS_RAISED)?;
    let (success, stderr) = check(&root)?;
    assert!(!success, "the crate compiled without the feature construct");
    assert!(
        stderr.contains("`from_generated`") && stderr.contains("`native`"),
        "the build failed for another reason:\n{stderr}"
    );
    Ok(())
}

#[test]
fn a_crate_with_the_feature_makes_and_opens_a_raised_exception() -> Result<(), String> {
    let root = write_crate("generated_binding_raised", ", features = [\"construct\"]", OPENS_RAISED)?;
    let (success, stderr) = check(&root)?;
    assert!(success, "the generated crate did not compile:\n{stderr}");
    Ok(())
}

#[test]
fn a_crate_with_the_feature_makes_tokens() -> Result<(), String> {
    let root = write_crate("generated_binding", ", features = [\"construct\"]", MAKES_TOKENS)?;
    let (success, stderr) = check(&root)?;
    assert!(success, "the generated crate did not compile:\n{stderr}");
    Ok(())
}

const SENDS_PASSTHROUGH: &str =
    "fn sent<T: Send>() {}\n\npub fn send() {\n    sent::<binding_core::Passthrough>();\n}\n";

/// GN-6ae: the table of a binding is bound to its thread, so a `Passthrough` does not leave the thread that made it.
#[test]
fn a_passthrough_is_not_sent_to_another_thread() -> Result<(), String> {
    let root = write_crate("sends_passthrough", ", features = [\"construct\"]", SENDS_PASSTHROUGH)?;
    let (success, stderr) = check(&root)?;
    assert!(!success, "a crate that sends a Passthrough to another thread compiled");
    assert!(
        stderr.contains("error[E0277]") && stderr.contains("cannot be sent between threads safely"),
        "the build failed for another reason:\n{stderr}"
    );
    Ok(())
}
