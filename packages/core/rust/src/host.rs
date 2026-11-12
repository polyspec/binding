//! The questions of a core about the children of a language value (design B-1, U-7 (f)).

use crate::raised::Raised;
use crate::value::{Handle, HostValue};

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

#[cfg(test)]
mod tests {
    use super::HostValues;
    use crate::raised::Raised;
    use crate::value::{Handle, HostValue};

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
}
