//! Design G-5, GN-5: a fault injection point is live only in a crate that has its own feature `fault-test`. Cargo
//! unifies the features of a dependency, so when one core turns on `polyspec-binding-core/fault-test`, every core
//! that depends on binding_core is built with it; a point that binding_core judged by its own feature would then be
//! live in a core whose feature `fault-test` nobody turned on, and a binding that leaves a core out of its feature
//! `fault-test` would still pass the cases that arm that core's points. The test builds two cores and a binding crate
//! of its own in the temporary directory of the test: the binding turns on the feature of core_a only, and its test
//! arms a point of each core.

use std::path::{Path, PathBuf};
use std::process::Command;

/// How a core writes its point; the test runs the same form that the documentation names.
const POINT: &str = "binding_core::fault::point!";

fn write(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("create {}: {error}", parent.display()))?;
    }
    std::fs::write(path, text).map_err(|error| format!("write {}: {error}", path.display()))
}

fn core_crate(root: &Path, name: &str, binding_core: &str) -> Result<(), String> {
    write(
        &root.join(name).join("Cargo.toml"),
        &format!(
            "[package]\nname = \"{name}\"\nversion = \"0.0.0\"\nedition = \"2021\"\npublish = false\n\n\
             [features]\nfault-test = [\"binding_core/fault-test\"]\n\n\
             [dependencies]\nbinding_core = {{ package = \"polyspec-binding-core\", path = {binding_core:?} }}\n"
        ),
    )?;
    write(
        &root.join(name).join("src/lib.rs"),
        &format!("pub fn visit() -> bool {{\n    {POINT}(\"{name}.read\").is_some()\n}}\n"),
    )
}

fn workspace() -> Result<PathBuf, String> {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join("point_of_its_own_crate");
    let binding_core = Path::new(env!("CARGO_MANIFEST_DIR")).display().to_string();
    core_crate(&root, "core_a", &binding_core)?;
    core_crate(&root, "core_b", &binding_core)?;
    write(
        &root.join("Cargo.toml"),
        "[workspace]\nmembers = [\"core_a\", \"core_b\", \"binding\"]\nresolver = \"2\"\n",
    )?;
    write(
        &root.join("binding/Cargo.toml"),
        &format!(
            "[package]\nname = \"binding\"\nversion = \"0.0.0\"\nedition = \"2021\"\npublish = false\n\n\
             [dependencies]\ncore_a = {{ path = \"../core_a\", features = [\"fault-test\"] }}\n\
             core_b = {{ path = \"../core_b\" }}\n\
             binding_core = {{ package = \"polyspec-binding-core\", path = {binding_core:?}, features = [\"fault-test\"] }}\n"
        ),
    )?;
    write(
        &root.join("binding/src/lib.rs"),
        "#[test]\nfn only_the_point_of_the_core_with_the_feature_fires() {\n    \
         let faults = r#\"[{\"point\": \"core_a.read\", \"kind\": \"broken\"}, {\"point\": \"core_b.read\", \"kind\": \"broken\"}]\"#;\n    \
         let id = binding_core::fault::arm(\"a.member\", faults).unwrap();\n    \
         let seen = binding_core::fault::take(\"a.member\").run(|| (core_a::visit(), core_b::visit()));\n    \
         assert_eq!(seen, (true, false), \"the points of core_a and core_b\");\n    \
         assert_eq!(binding_core::fault::left(id).unwrap(), vec![String::from(\"core_b.read\")]);\n}\n",
    )?;
    Ok(root)
}

#[test]
fn a_point_is_live_only_in_the_crate_with_its_own_feature() -> Result<(), String> {
    let root = workspace()?;
    let output = Command::new(env!("CARGO"))
        // The toolchain that builds this test builds the crates under test (see tests/construct.rs).
        .args([
            "test",
            "--offline",
            "--quiet",
            "--ignore-rust-version",
            "-p",
            "binding",
            "--manifest-path",
        ])
        .arg(root.join("Cargo.toml"))
        .env("CARGO_TARGET_DIR", root.join("target"))
        .output()
        .map_err(|error| format!("run cargo: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "the test of the binding crate failed:\n{stdout}\n{stderr}"
    );
    assert!(
        stdout.contains("1 passed"),
        "the test of the binding crate did not run:\n{stdout}"
    );
    Ok(())
}
