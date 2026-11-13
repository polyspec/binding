//! The questions of a core about the children of a language value (design B-1, U-7 (f)).

use crate::raised::Raised;
use crate::value::{Handle, HostValue, OutValue};

/// The side of the binding in the walk of a language value (B-1). The binding describes a value one level at a time as
/// a [`HostValue`]; a container gives only its handle and length, and the core asks for each child through this trait,
/// so the order of the walk, the depth limit and cycles are the core's rules. Generated code implements it for the
/// handles it put into the values it gave. A question may run language code (a getter, an iterator, `jsonSerialize`),
/// so its failure is the exception of that code, which goes back to the caller unchanged (U-3).
pub trait HostValues {
    /// The item at `index` of a list (`HostValue::List`).
    ///
    /// # Errors
    ///
    /// The exception that the language raised.
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, Raised>;

    /// The key and the value of the entry at `index` of a map, a PHP array, a plain object or a `stdClass`
    /// (`HostValue::Map`, `HostValue::PhpArray`, `HostValue::PlainObject`, `HostValue::StdClass`), in the order of the
    /// language.
    ///
    /// # Errors
    ///
    /// The exception that the language raised.
    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), Raised>;

    /// The content of an instance of a class of a value table (`HostValue::Value`), which the `read` member of its `in`
    /// case gives (U-1).
    ///
    /// # Errors
    ///
    /// The exception that the language raised.
    fn read(&mut self, value: Handle) -> Result<HostValue, Raised>;
}

/// The side of the core in the making of a language value (B-1, U-7 (d)): the core gives a value one level at a time as
/// an [`OutValue`], whose containers give only a handle and a length, and the generated code asks for each child
/// through this trait. The same handle is the same language object, and a container is made before its children, so
/// sharing and cycles come out as they are. The core already holds the whole value, so a question cannot fail.
pub trait OutValues {
    /// The item at `index` of a list (`OutValue::List`).
    fn item(&mut self, list: Handle, index: u64) -> OutValue;

    /// The key and the value of the entry at `index` of a map or an object (`OutValue::Map`, `OutValue::Object`), in
    /// order; a key is a text, or an integer or bytes for a map with mixed keys (U-7 (c)).
    fn entry(&mut self, map: Handle, index: u64) -> (OutValue, OutValue);
}

#[cfg(test)]
mod tests {
    use super::{HostValues, OutValues};
    use crate::raised::Raised;
    use crate::value::{Handle, HostValue, OutValue};

    /// A list `[1, [2]]` of a language with one number type, as a binding would describe it.
    struct Lists;

    impl HostValues for Lists {
        fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, Raised> {
            Ok(match (list.raw(), index) {
                (1, 0) => HostValue::UntypedNumber(1.0),
                (1, 1) => HostValue::List {
                    handle: Handle::new(2),
                    len: 1,
                },
                _ => HostValue::UntypedNumber(2.0),
            })
        }

        fn entry(&mut self, _map: Handle, _index: u64) -> Result<(HostValue, HostValue), Raised> {
            Ok((HostValue::Null, HostValue::Null))
        }

        fn read(&mut self, _value: Handle) -> Result<HostValue, Raised> {
            Ok(HostValue::Null)
        }
    }

    /// A core's walk: it asks for each child and decides what a number is.
    fn sum(host: &mut dyn HostValues, value: HostValue) -> Result<f64, Raised> {
        match value {
            HostValue::UntypedNumber(number) | HostValue::Float(number) => Ok(number),
            HostValue::List { handle, len } => {
                let mut total = 0.0;
                for index in 0..len {
                    let child = host.item(handle, index)?;
                    total += sum(host, child)?;
                }
                Ok(total)
            }
            _ => Ok(0.0),
        }
    }

    #[test]
    fn the_core_walks_the_children_through_the_handles() {
        let total = sum(
            &mut Lists,
            HostValue::List {
                handle: Handle::new(1),
                len: 2,
            },
        );
        assert!(matches!(total, Ok(value) if value == 3.0), "the walk gave {total:?}");
    }

    /// The list `[true, [false]]` as a core gives it.
    struct Nested;

    impl OutValues for Nested {
        fn item(&mut self, list: Handle, index: u64) -> OutValue {
            match (list.raw(), index) {
                (1, 0) => OutValue::Bool(true),
                (1, _) => OutValue::List {
                    handle: Handle::new(2),
                    len: 1,
                },
                _ => OutValue::Bool(false),
            }
        }

        fn entry(&mut self, _map: Handle, _index: u64) -> (OutValue, OutValue) {
            (OutValue::Null, OutValue::Null)
        }
    }

    /// A binding's making of a value: it asks for each child.
    fn count_true(core: &mut dyn OutValues, value: OutValue) -> u64 {
        match value {
            OutValue::Bool(true) => 1,
            OutValue::List { handle, len } => (0..len)
                .map(|index| {
                    let child = core.item(handle, index);
                    count_true(core, child)
                })
                .sum(),
            _ => 0,
        }
    }

    #[test]
    fn the_binding_makes_the_children_through_the_handles() {
        assert_eq!(
            count_true(
                &mut Nested,
                OutValue::List {
                    handle: Handle::new(1),
                    len: 2
                }
            ),
            1
        );
    }
}
