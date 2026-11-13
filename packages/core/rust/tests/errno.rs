//! GN-8a: the value of an errno symbol is that of the target, from the table that arms the faults, without a feature,
//! so the PHP test of any contract reads it through `Internal\errnoOf`.
#![cfg(unix)]

use binding_core::errno;

#[test]
fn an_errno_symbol_has_the_value_of_the_target() {
    assert_eq!(errno::value("EIO"), Some(libc::EIO));
    assert_eq!(errno::value("ENOSPC"), Some(libc::ENOSPC));
    assert_eq!(errno::value("EXDEV"), Some(libc::EXDEV));
}

#[test]
fn a_symbol_that_the_target_does_not_have_has_no_value() {
    assert_eq!(errno::value("ENOTANERRNO"), None);
    assert_eq!(errno::value("eio"), None);
}
