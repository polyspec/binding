//! The values of errno symbols on the target (G-5, GN-8a).
//!
//! A case names an errno by its symbol (`ENOSPC`), and its value differs between targets. The arming of a fault reads
//! the value here, and so does the PHP test of a case that expects an errno, through `Internal\errnoOf` of the PHP
//! extension, because PHP has no table of the errno symbols of its machine. The table needs no feature, so the PHP
//! test of a contract without fault injection points reads it too.

/// The value of an errno symbol on the target, or none for a symbol that the target does not have; a target without
/// errno has none.
#[cfg(unix)]
#[must_use]
pub fn value(symbol: &str) -> Option<i32> {
    macro_rules! table {
        ($($name:ident)*) => {
            match symbol {
                $(stringify!($name) => Some(libc::$name),)*
                _ => None,
            }
        };
    }
    table!(
        E2BIG EACCES EADDRINUSE EADDRNOTAVAIL EAGAIN EALREADY EBADF EBUSY ECANCELED ECHILD ECONNABORTED ECONNREFUSED
        ECONNRESET EDEADLK EDQUOT EEXIST EFAULT EFBIG EHOSTUNREACH EINTR EINVAL EIO EISDIR ELOOP EMFILE EMLINK
        EMSGSIZE ENAMETOOLONG ENETDOWN ENETUNREACH ENFILE ENOBUFS ENODEV ENOENT ENOEXEC ENOLCK ENOMEM ENOSPC ENOSYS
        ENOTCONN ENOTDIR ENOTEMPTY ENOTSOCK ENOTSUP ENOTTY ENXIO EPERM EPIPE ERANGE EROFS ESPIPE ESRCH ESTALE
        ETIMEDOUT ETXTBSY EXDEV
    )
}

/// The value of an errno symbol on a target without errno: none.
#[cfg(not(unix))]
#[must_use]
pub fn value(_symbol: &str) -> Option<i32> {
    None
}
