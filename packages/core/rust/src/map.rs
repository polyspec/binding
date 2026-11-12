//! The boundary type of the contract type `map<T>` (design T-2).

use indexmap::IndexMap;

/// An insertion-ordered map with text keys, the Rust type of the contract type `map<T>` at the core boundary (T-2).
///
/// It is the boundary crate's own type, so that a library exchanging maps does not depend on the JSON crate (C-1).
/// Keys are unique; an insertion with a key already present replaces the value in place and returns the old value,
/// so the caller decides what a repeated key means. There is no `FromIterator`, because collecting would drop a
/// repeated key without telling anyone (P-4). Two maps are equal when they hold the same entries in the same order.
#[derive(Debug, Clone)]
pub struct OrderedMap<T> {
    entries: IndexMap<String, T>,
}

impl<T> OrderedMap<T> {
    /// An empty map.
    #[must_use]
    pub fn new() -> Self {
        Self {
            entries: IndexMap::new(),
        }
    }

    /// An empty map with room for `capacity` entries.
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            entries: IndexMap::with_capacity(capacity),
        }
    }

    /// Appends an entry, or replaces the value of a key already present without moving it and returns the old value.
    pub fn insert(&mut self, key: String, value: T) -> Option<T> {
        self.entries.insert(key, value)
    }

    /// The value of a key.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&T> {
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
    pub fn iter(&self) -> impl Iterator<Item = (&str, &T)> {
        self.entries.iter().map(|(key, value)| (key.as_str(), value))
    }
}

impl<T> Default for OrderedMap<T> {
    /// The empty map, the same as [`OrderedMap::new`].
    fn default() -> Self {
        Self::new()
    }
}

impl<T> IntoIterator for OrderedMap<T> {
    type Item = (String, T);
    type IntoIter = indexmap::map::IntoIter<String, T>;

    /// The entries in insertion order.
    fn into_iter(self) -> Self::IntoIter {
        self.entries.into_iter()
    }
}

impl<T: PartialEq> PartialEq for OrderedMap<T> {
    fn eq(&self, other: &Self) -> bool {
        self.len() == other.len() && self.iter().zip(other.iter()).all(|(a, b)| a == b)
    }
}

#[cfg(test)]
mod tests {
    use super::OrderedMap;

    fn map(entries: &[(&str, i64)]) -> OrderedMap<i64> {
        let mut map = OrderedMap::new();
        for (key, value) in entries {
            assert_eq!(map.insert((*key).to_owned(), *value), None);
        }
        map
    }

    #[test]
    fn entries_keep_their_insertion_order() {
        let ordered = map(&[("b", 1), ("a", 2), ("c", 3)]);
        let keys: Vec<&str> = ordered.iter().map(|(key, _)| key).collect();
        assert_eq!(keys, ["b", "a", "c"]);
        let owned: Vec<(String, i64)> = map(&[("z", 1), ("y", 2)]).into_iter().collect();
        assert_eq!(owned, [(String::from("z"), 1), (String::from("y"), 2)]);
    }

    #[test]
    fn a_repeated_key_replaces_in_place_and_returns_the_old_value() {
        let mut map = map(&[("a", 1), ("b", 2)]);
        assert_eq!(map.insert(String::from("a"), 9), Some(1));
        let entries: Vec<(&str, &i64)> = map.iter().collect();
        assert_eq!(entries, [("a", &9), ("b", &2)]);
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn equality_depends_on_order() {
        assert_eq!(map(&[("a", 1), ("b", 2)]), map(&[("a", 1), ("b", 2)]));
        assert_ne!(map(&[("a", 1), ("b", 2)]), map(&[("b", 2), ("a", 1)]));
    }

    #[test]
    fn get_finds_a_key_and_misses_another() {
        let map = map(&[("a", 1)]);
        assert_eq!(map.get("a"), Some(&1));
        assert_eq!(map.get("b"), None);
        assert!(!map.is_empty());
        assert!(OrderedMap::<i64>::new().is_empty());
    }
}
