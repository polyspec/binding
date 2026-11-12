//! Cleanup marker (design U-1 `cleanup`, plan B-10).

/// Marks a core type that holds a resource with a cleanup call.
///
/// A unit whose contract names a `cleanup` member wraps a core type that implements `Cleanup`, and a unit without
/// `cleanup` wraps a core type that does not. The generated crate asserts both at compile time, so a resource whose
/// cleanup call the contract leaves out does not compile (U-1). The trait has no method: the cleanup call is the member
/// that the contract names, and the generated destructor warns when that member was not called (B-10).
///
/// The trait has no blanket implementation, so a type is a resource only by its own declaration:
///
/// ```
/// struct File;
/// impl binding_core::Cleanup for File {}
/// fn assert_cleanup<T: binding_core::Cleanup>() {}
/// assert_cleanup::<File>();
/// ```
///
/// ```compile_fail
/// struct Parser;
/// fn assert_cleanup<T: binding_core::Cleanup>() {}
/// assert_cleanup::<Parser>(); // Parser does not declare Cleanup
/// ```
pub trait Cleanup {}
