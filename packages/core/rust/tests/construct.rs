//! Design I-2 (4): only generated code makes a wait token. A crate that depends on bindgen_core without the feature
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
         [dependencies]\nbindgen_core = {{ package = \"polyspec-bindgen-core\", path = {core:?}{features} }}\n\n\
         [workspace]\n"
    );
    std::fs::write(root.join("Cargo.toml"), manifest).map_err(|error| format!("write manifest: {error}"))?;
    std::fs::write(src.join("lib.rs"), body).map_err(|error| format!("write lib.rs: {error}"))?;
    Ok(root)
}

fn check(root: &Path) -> Result<(bool, String), String> {
    let output = Command::new(env!("CARGO"))
        .args(["check", "--offline", "--quiet", "--manifest-path"])
        .arg(root.join("Cargo.toml"))
        .env("CARGO_TARGET_DIR", root.join("target"))
        .output()
        .map_err(|error| format!("run cargo: {error}"))?;
    Ok((
        output.status.success(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

const MAKES_TOKENS: &str = "pub fn make() -> (bindgen_core::Io, bindgen_core::ProcessWait) {\n    \
    (bindgen_core::Io::for_generated_call(), bindgen_core::ProcessWait::for_generated_call())\n}\n";

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
fn a_crate_with_the_feature_makes_tokens() -> Result<(), String> {
    let root = write_crate("generated_binding", ", features = [\"construct\"]", MAKES_TOKENS)?;
    let (success, stderr) = check(&root)?;
    assert!(success, "the generated crate did not compile:\n{stderr}");
    Ok(())
}
