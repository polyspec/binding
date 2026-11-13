//! The bytes of an OS path (design T-1 `path`, plan B-3): every target gives a path to the core as bytes, and takes the
//! bytes of a path that leaves, so one function judges them for every language.

use crate::BindingError;
use std::path::{Path, PathBuf};

/// The path of OS bytes. A NUL byte, which no OS path holds, is `InvalidPath`; where the OS path is no bytes
/// (Windows), bytes that are not UTF-8 are `InvalidPath` too.
///
/// # Errors
///
/// `BindingError::InvalidPath` with the subject, the parameter or field of the path.
pub fn path_from_bytes(bytes: Vec<u8>, subject: &str) -> Result<PathBuf, BindingError> {
    let invalid = || BindingError::InvalidPath { subject: subject.to_owned() };
    if bytes.contains(&0) {
        return Err(invalid());
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Ok(PathBuf::from(std::ffi::OsString::from_vec(bytes)))
    }
    #[cfg(not(unix))]
    {
        String::from_utf8(bytes).map(PathBuf::from).map_err(|_not_utf8| invalid())
    }
}

/// The bytes of a path that leave to a language: the OS bytes, or the encoded bytes of `OsStr` where the OS path is no
/// bytes.
#[must_use]
pub fn path_bytes(path: &Path) -> &[u8] {
    path.as_os_str().as_encoded_bytes()
}

#[cfg(test)]
mod tests {
    use super::{path_bytes, path_from_bytes};
    use crate::{BindingError, Kinds};
    use std::path::Path;

    #[test]
    fn a_path_is_its_bytes() {
        assert_eq!(path_from_bytes(b"a/b".to_vec(), "p"), Ok(Path::new("a/b").to_path_buf()));
        assert_eq!(path_bytes(Path::new("a/b")), b"a/b");
    }

    #[test]
    fn a_nul_byte_is_invalid_path() {
        let error = path_from_bytes(b"a\0b".to_vec(), "p");
        assert_eq!(error, Err(BindingError::InvalidPath { subject: String::from("p") }));
        assert_eq!(error.map_err(|error| error.kind()), Err("invalid_path"));
    }

    #[cfg(unix)]
    #[test]
    fn bytes_that_are_no_utf8_are_a_unix_path() {
        let path = path_from_bytes(vec![b'a', 0xff], "p");
        assert_eq!(path.as_deref().map(path_bytes), Ok(&[b'a', 0xff][..]));
    }
}
