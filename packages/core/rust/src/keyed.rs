//! The boundary type of the contract type `keyed_map<T>{key}` (design T-2, U-7 (c)).

use indexmap::IndexMap;

/// A key of a [`KeyedMap`]: one of the kinds that the contract type lists (U-7 (c)), as a PHP array, a Python `dict` or
/// a JavaScript `Map` mixes them.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Key {
    /// An integer key.
    Int(i64),
    /// A byte string key, such as a PHP string that is not UTF-8.
    Bytes(Vec<u8>),
    /// A text key.
    Text(String),
}

/// An insertion-ordered map whose keys mix integers, byte strings and texts, the Rust type of `keyed_map<T>{key}` at the
/// core boundary (T-2). The generated code accepts only the key kinds that the contract lists; the map itself holds any.
///
/// As [`crate::OrderedMap`]: an insertion with a key already present replaces the value in place and returns the old one,
/// there is no `FromIterator`, and equality depends on order. `Int(1)` and `Text("1")` are different keys; whether a
/// language makes them one is the rule of the language's binding (a PHP array does).
#[derive(Debug, Clone)]
pub struct KeyedMap<T> {
    entries: IndexMap<Key, T>,
}

impl<T> KeyedMap<T> {
    /// An empty map.
    #[must_use]
    pub fn new() -> Self {
        Self {
            entries: IndexMap::new(),
        }
    }

    /// Appends an entry, or replaces the value of a key already present without moving it and returns the old value.
    pub fn insert(&mut self, key: Key, value: T) -> Option<T> {
        self.entries.insert(key, value)
    }

    /// The value of a key.
    #[must_use]
    pub fn get(&self, key: &Key) -> Option<&T> {
        self.entries.get(key)
    }

    /// The number of entries.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the map has no entry.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// The entries in insertion order.
    pub fn iter(&self) -> impl Iterator<Item = (&Key, &T)> {
        self.entries.iter()
    }
}

impl<T> Default for KeyedMap<T> {
    /// The empty map, the same as [`KeyedMap::new`].
    fn default() -> Self {
        Self::new()
    }
}

impl<T> IntoIterator for KeyedMap<T> {
    type Item = (Key, T);
    type IntoIter = indexmap::map::IntoIter<Key, T>;

    /// The entries in insertion order.
    fn into_iter(self) -> Self::IntoIter {
        self.entries.into_iter()
    }
}

impl<T: PartialEq> PartialEq for KeyedMap<T> {
    fn eq(&self, other: &Self) -> bool {
        self.len() == other.len() && self.iter().zip(other.iter()).all(|(a, b)| a == b)
    }
}

#[cfg(test)]
mod tests {
    use super::{Key, KeyedMap};

    #[test]
    fn mixed_keys_keep_their_order_and_their_kinds() {
        let mut map = KeyedMap::new();
        assert_eq!(map.insert(Key::Text(String::from("1")), 'a'), None);
        assert_eq!(map.insert(Key::Int(1), 'b'), None);
        assert_eq!(map.insert(Key::Bytes(vec![0xff]), 'c'), None);
        assert_eq!(map.len(), 3);
        let keys: Vec<&Key> = map.iter().map(|(key, _)| key).collect();
        assert_eq!(
            keys,
            [&Key::Text(String::from("1")), &Key::Int(1), &Key::Bytes(vec![0xff])]
        );
        assert_eq!(map.insert(Key::Int(1), 'd'), Some('b'));
        assert_eq!(map.get(&Key::Int(1)), Some(&'d'));
    }

    #[test]
    fn equality_depends_on_order() {
        let mut a = KeyedMap::new();
        let mut b = KeyedMap::new();
        assert_eq!(a.insert(Key::Int(1), 1), None);
        assert_eq!(a.insert(Key::Int(2), 2), None);
        assert_eq!(b.insert(Key::Int(2), 2), None);
        assert_eq!(b.insert(Key::Int(1), 1), None);
        assert_ne!(a, b);
        assert!(KeyedMap::<u8>::new().is_empty());
    }
}
