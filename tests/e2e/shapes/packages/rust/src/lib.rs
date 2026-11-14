//! A sample library for the end-to-end check of binding: the shapes of values. A source (T-1), bytes (T-7), a
//! parameter and a record field that the caller may leave out (U-2, T-4), also of an optional type and of an enum, and kinds that are thrown as the classes of
//! error units (E-2).

use binding_core::{Key, KeyedMap, Kinds, OrderedMap};
use std::fmt;
use std::path::{Path, PathBuf};

/// The count of a length, which widens: usize is at most 64 bits wide on every target of the workspace.
#[allow(
    clippy::as_conversions,
    reason = "usize is at most 64 bits wide on every target of the workspace, so the conversion is lossless"
)]
const fn widen(length: usize) -> u64 {
    length as u64
}

/// How often `repeat` repeats a text when the caller gives no number (U-2: a `{const}` default).
pub const DEFAULT_TIMES: u64 = 1;

/// What `repeat` puts between the texts when the caller gives no separator (U-2: a `{literal}` default).
pub const DEFAULT_SEPARATOR: &str = ",";

/// Whether `frame` makes the text upper case when the caller does not say (T-4: a `{literal}` field default).
pub const DEFAULT_UPPER: bool = false;

/// What `wrap` puts before the text when the caller does not say (U-2: a field of a record that may be left out).
pub const DEFAULT_LEFT: &str = "[";

/// What `wrap` puts after the text when the caller does not say.
pub const DEFAULT_RIGHT: &str = "]";

/// The side of the text that `pad` fills when the caller does not say (U-2: a `{literal}` default of an enum).
pub const DEFAULT_SIDE: Side = Side::Left;

/// The most texts that `repeat` joins.
const MOST_TIMES: u64 = 1000;

/// The errors of the sample.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A source or bytes without a byte.
    Empty,
    /// A source whose bytes are no UTF-8.
    NotUtf8 {
        /// The offset of the first byte that is no UTF-8.
        offset: usize,
    },
    /// More repetitions than the sample makes.
    TooMany {
        /// The number that was asked for.
        times: u64,
    },
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Empty => "empty",
            Self::NotUtf8 { .. } => "not_utf8",
            Self::TooMany { .. } => "too_many",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(f, "no byte"),
            Self::NotUtf8 { offset } => write!(f, "the byte at {offset} is no UTF-8"),
            Self::TooMany { times } => write!(f, "{times} is more than {MOST_TIMES}"),
        }
    }
}

impl std::error::Error for Error {}

impl Kinds for Error {
    fn kind(&self) -> &'static str {
        Error::kind(self)
    }

    fn status(&self) -> Option<u16> {
        None
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}

/// The number of the characters of a source (T-1: a text original, given as a text or as its bytes).
///
/// # Errors
///
/// Kind `empty` for a source without a byte and kind `not_utf8` for bytes that are no UTF-8.
pub fn length(source: &[u8]) -> Result<u64, Error> {
    if source.is_empty() {
        return Err(Error::Empty);
    }
    match std::str::from_utf8(source) {
        Ok(text) => Ok(widen(text.chars().count())),
        Err(error) => Err(Error::NotUtf8 {
            offset: error.valid_up_to(),
        }),
    }
}

/// The text `times` times, with the separator between (U-2: `None` is the default of the core).
///
/// # Errors
///
/// Kind `too_many` for more than 1000 times.
pub fn repeat(text: &str, times: Option<u64>, separator: Option<&str>) -> Result<String, Error> {
    let times = match times {
        Some(times) => times,
        None => DEFAULT_TIMES,
    };
    if times > MOST_TIMES {
        return Err(Error::TooMany { times });
    }
    let separator = match separator {
        Some(separator) => separator,
        None => DEFAULT_SEPARATOR,
    };
    Ok((0..times)
        .map(|_index| text)
        .collect::<Vec<_>>()
        .join(separator))
}

/// The options of `frame` (T-4: a record whose fields the caller may leave out).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrameOptions {
    /// What comes before the text.
    pub prefix: String,
    /// Whether the text is made upper case; `None` is `DEFAULT_UPPER`.
    pub upper: Option<bool>,
    /// The least width of the text, filled with spaces; `None` is the width of the text (SH-1: a computed default).
    pub width: Option<u64>,
}

/// The text after its prefix, in upper case and filled to its width as the options say.
#[must_use]
pub fn frame(text: &str, options: &FrameOptions) -> String {
    let upper = match options.upper {
        Some(upper) => upper,
        None => DEFAULT_UPPER,
    };
    let body = if upper {
        text.to_uppercase()
    } else {
        text.to_owned()
    };
    let mut count = widen(body.chars().count());
    let width = match options.width {
        Some(width) => width,
        None => count,
    };
    let mut framed = format!("{}{body}", options.prefix);
    while count < width {
        framed.push(' ');
        count += 1;
    }
    framed
}

/// The options of `wrap` (U-2 `{empty: "object"}`: a record whose every field the caller may leave out, so the caller
/// may leave out the record).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WrapOptions {
    /// What comes before the text; `None` is `DEFAULT_LEFT`.
    pub left: Option<String>,
    /// What comes after the text; `None` is `DEFAULT_RIGHT`.
    pub right: Option<String>,
}

/// The text between the left and the right of the options.
#[must_use]
pub fn wrap(text: &str, options: &WrapOptions) -> String {
    let left = match &options.left {
        Some(left) => left.as_str(),
        None => DEFAULT_LEFT,
    };
    let right = match &options.right {
        Some(right) => right.as_str(),
        None => DEFAULT_RIGHT,
    };
    format!("{left}{text}{right}")
}

/// The side of a text that `pad` fills.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// Before the text.
    Left,
    /// After the text.
    Right,
}

/// The options of `pad` (U-2: fields of an enum and of optional types that the caller may leave out).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PadOptions {
    /// The side that is filled; `None` is `DEFAULT_SIDE`.
    pub side: Option<Side>,
    /// The least width of the text; `None` is the width of the text (SH-2: a computed default).
    pub width: Option<u64>,
    /// What comes after the filled text; `None` is nothing (SH-3: a `{literal: null}` default).
    pub end: Option<String>,
}

/// The text filled to the width of the options on their side, with the fill or a space, and the end after it.
#[must_use]
pub fn pad(text: &str, fill: Option<&str>, options: &PadOptions) -> String {
    let fill = fill.unwrap_or(" ");
    let side = match options.side {
        Some(side) => side,
        None => DEFAULT_SIDE,
    };
    let mut count = widen(text.chars().count());
    let width = match options.width {
        Some(width) => width,
        None => count,
    };
    let mut filling = String::new();
    while count < width {
        filling.push_str(fill);
        count += 1;
    }
    let end = match &options.end {
        Some(end) => end.as_str(),
        None => "",
    };
    match side {
        Side::Left => format!("{filling}{text}{end}"),
        Side::Right => format!("{text}{filling}{end}"),
    }
}

/// The path of the name inside the directory (T-1 `path`; SH-4: WASM has no OS path).
#[must_use]
pub fn joined(dir: &Path, name: &str) -> PathBuf {
    dir.join(name)
}

/// The directory of a path, or no value for a path without one (T-1 `optional<path>`).
#[must_use]
pub fn parent_of(path: &Path) -> Option<PathBuf> {
    path.parent().map(Path::to_path_buf)
}

/// The length and the emptiness of a text (T-4: a record with a bool field as a return).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Measure {
    /// The number of the characters.
    pub length: u64,
    /// Whether the text has no character.
    pub empty: bool,
}

/// The measure of a text.
#[must_use]
pub fn measure(text: &str) -> Measure {
    Measure {
        length: widen(text.chars().count()),
        empty: text.is_empty(),
    }
}

/// The length of a span of a start and an end, none when the end is before the start (GN-6t: a tuple parameter).
#[must_use]
pub fn span_length(span: &(u64, u64)) -> u64 {
    span.1.saturating_sub(span.0)
}

/// The lengths of the spans together (GN-6t: a list of a tuple).
#[must_use]
pub fn spans_total(spans: &[(u64, u64)]) -> u64 {
    spans.iter().map(span_length).sum()
}

/// A text and a count as one text (GN-6t: a tuple of different part types).
#[must_use]
pub fn labelled(pair: &(String, u64)) -> String {
    format!("{}×{}", pair.0, pair.1)
}

/// The width of a span of a start and an end, none when the end is before the start (GN-6ac: a tuple parameter that
/// the core holds as an array of usize).
#[must_use]
pub const fn span_width(span: &[usize; 2]) -> usize {
    span[1].saturating_sub(span[0])
}

/// The span of a start and a length (GN-6ac: parameters of u32 and a tuple result that the core holds as an array).
#[must_use]
pub const fn span_at(start: u32, length: u32) -> [u32; 2] {
    [start, start.saturating_add(length)]
}

/// The sum of the widths, the largest width when it does not fit (GN-6ad: a list parameter that the core borrows as a
/// slice of usize).
#[must_use]
pub fn width_sum(widths: &[usize]) -> usize {
    widths
        .iter()
        .fold(0, |sum, width| sum.saturating_add(*width))
}

/// The largest of the values, 0 for none (GN-6ad: a list parameter that the core borrows as a slice of u32).
#[must_use]
pub fn largest(values: &[u32]) -> u32 {
    values.iter().copied().fold(0, u32::max)
}

/// A span and the step that walks it (GN-6ac: a record whose fields the core holds as [usize; 2] and u32).
pub struct Stride {
    /// The start and the end.
    pub ends: [usize; 2],
    /// The width of a step; none of 0.
    pub step: u32,
}

/// The number of whole steps in the span of a stride, 0 for a step of 0 (GN-6ac: a record parameter).
#[must_use]
pub fn stride_count(stride: &Stride) -> usize {
    let width = stride.ends[1].saturating_sub(stride.ends[0]);
    let Ok(step) = usize::try_from(stride.step) else {
        return 0;
    };
    width.checked_div(step).unwrap_or(0)
}

/// The offset from a start to an end, negative when the end is before the start (GN-6ac: parameters of u8 and an
/// isize result).
#[must_use]
pub fn offset(start: u8, end: u8) -> isize {
    isize::from(end) - isize::from(start)
}

/// The negation of an int64, the whole range of which crosses the boundary (T-1); the negation of the least value is
/// the largest.
#[must_use]
pub const fn negate(value: i64) -> i64 {
    value.saturating_neg()
}

/// The sum of the bytes (T-7: bytes as a parameter).
///
/// # Errors
///
/// Kind `empty` for no byte.
pub fn checksum(data: &[u8]) -> Result<u64, Error> {
    if data.is_empty() {
        return Err(Error::Empty);
    }
    Ok(data.iter().map(|byte| u64::from(*byte)).sum())
}

/// The bytes in the reverse order (T-7: bytes as a return).
#[must_use]
pub fn reversed(data: &[u8]) -> Vec<u8> {
    data.iter().rev().copied().collect()
}

/// The sum of the numbers (U-2: an `{empty}` default; `None` is no number).
#[must_use]
pub fn total(numbers: Option<&[u64]>) -> u64 {
    match numbers {
        Some(numbers) => numbers.iter().sum(),
        None => 0,
    }
}

/// The bytes that were appended, which a member changes (U-2: a receiver `&mut self` together with a `source` and a
/// parameter that the caller may leave out).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Buffer {
    bytes: Vec<u8>,
}

impl Buffer {
    /// A buffer that starts with the bytes of a source.
    #[must_use]
    pub fn new(start: &[u8]) -> Self {
        Self {
            bytes: start.to_vec(),
        }
    }

    /// The last `count` bytes, or all of them when there are fewer (the member `from_end`, a method whose name the
    /// lints of the generated code take as any name).
    #[must_use]
    pub fn last(&self, count: u64) -> Vec<u8> {
        let keep =
            usize::try_from(count).map_or(self.bytes.len(), |count| count.min(self.bytes.len()));
        self.bytes[self.bytes.len() - keep..].to_vec()
    }

    /// The number of the bytes.
    #[must_use]
    pub fn size(&self) -> u64 {
        widen(self.bytes.len())
    }

    /// Appends the bytes of a source `times` times and gives the new size (U-2: `None` is the default of the core).
    pub fn append(&mut self, source: &[u8], times: Option<u64>) -> u64 {
        let times = match times {
            Some(times) => times,
            None => DEFAULT_TIMES,
        };
        for _index in 0..times {
            self.bytes.extend_from_slice(source);
        }
        self.size()
    }
}

/// The counts of words and their labels (GN-12: a record that holds a map and a keyed map).
pub struct Tally {
    /// How often each word occurs, in the order of its first occurrence.
    pub counts: OrderedMap<u64>,
    /// Each word by the number of its first occurrence, and the first word by the key `first`.
    pub labels: KeyedMap<String>,
    /// A note of the tally, which a caller may leave out (SH-3: a field of the result form left out is null).
    pub note: Option<String>,
}

/// The sums of the counts of each key, in the order of its first occurrence.
fn summed<'a>(entries: impl Iterator<Item = (&'a str, u64)>) -> OrderedMap<u64> {
    let mut sums = OrderedMap::new();
    for (key, count) in entries {
        let sum = match sums.get(key) {
            Some(held) => u64::saturating_add(*held, count),
            None => count,
        };
        let _replaced: Option<u64> = sums.insert(key.to_owned(), sum);
    }
    sums
}

/// The tally of words (GN-12: a map and a keyed map that leave in a record).
#[must_use]
pub fn tally_of(words: &[String]) -> Tally {
    let counts = summed(words.iter().map(|word| (word.as_str(), 1)));
    let mut labels = KeyedMap::new();
    let mut number: i64 = 0;
    for (word, _count) in counts.iter() {
        let _replaced: Option<String> = labels.insert(Key::Int(number), word.to_owned());
        number = number.saturating_add(1);
    }
    if let Some(first) = words.first() {
        let _replaced: Option<String> =
            labels.insert(Key::Text(String::from("first")), first.clone());
    }
    Tally {
        counts,
        labels,
        note: None,
    }
}

/// The counts of a tally together with the number of its labels and one for its note (GN-12: a map and a keyed map
/// that enter in a record; SH-3: a note that a caller left out is `None`).
#[must_use]
pub fn tally_total(tally: &Tally) -> u64 {
    let noted = u64::from(tally.note.is_some());
    tally
        .counts
        .iter()
        .map(|(_word, count)| *count)
        .fold(widen(tally.labels.len()), u64::saturating_add)
        .saturating_add(noted)
}

/// The maps of a list as one, the counts of a key added (GN-12: a map that enters in a list).
#[must_use]
pub fn merged(maps: &[OrderedMap<u64>]) -> OrderedMap<u64> {
    summed(
        maps.iter()
            .flat_map(|map| map.iter().map(|(key, count)| (key, *count))),
    )
}

/// A map of each entry of a map (GN-12: a map that leaves in a list).
#[must_use]
pub fn split_counts(counts: &OrderedMap<u64>) -> Vec<OrderedMap<u64>> {
    counts
        .iter()
        .map(|(key, count)| summed(std::iter::once((key, *count))))
        .collect()
}

/// The maps of a map with each count twice (GN-12: a map in a map, both ways).
#[must_use]
pub fn doubled(groups: &OrderedMap<OrderedMap<u64>>) -> OrderedMap<OrderedMap<u64>> {
    let mut twice = OrderedMap::new();
    for (name, group) in groups.iter() {
        let group = summed(
            group
                .iter()
                .map(|(key, count)| (key, count.saturating_mul(2))),
        );
        let _replaced: Option<OrderedMap<u64>> = twice.insert(name.to_owned(), group);
    }
    twice
}

/// The keyed maps of a list and its absences in the opposite order (GN-12: a keyed map in an optional in a list, both
/// ways).
#[must_use]
pub fn present(maps: &[Option<KeyedMap<String>>]) -> Vec<Option<KeyedMap<String>>> {
    maps.iter().rev().cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::{
        checksum, frame, joined, length, pad, parent_of, repeat, reversed, total, wrap, Buffer,
        Error, FrameOptions, PadOptions, Side, WrapOptions,
    };
    use std::path::{Path, PathBuf};

    #[test]
    fn none_is_the_default() {
        assert_eq!(
            repeat("a", None, None),
            repeat(
                "a",
                Some(super::DEFAULT_TIMES),
                Some(super::DEFAULT_SEPARATOR)
            )
        );
        assert_eq!(repeat("a", Some(2), Some("-")), Ok(String::from("a-a")));
        assert_eq!(
            repeat("a", Some(1001), None),
            Err(Error::TooMany { times: 1001 })
        );
        let plain = FrameOptions {
            prefix: String::from(">"),
            upper: None,
            width: None,
        };
        assert_eq!(frame("a", &plain), ">a");
        assert_eq!(
            frame(
                "a",
                &FrameOptions {
                    upper: Some(super::DEFAULT_UPPER),
                    ..plain.clone()
                }
            ),
            ">a"
        );
        assert_eq!(
            frame(
                "a",
                &FrameOptions {
                    upper: Some(true),
                    width: Some(3),
                    ..plain
                }
            ),
            ">A  "
        );
        assert_eq!(total(None), total(Some(&[])));
        assert_eq!(wrap("a", &WrapOptions::default()), "[a]");
        assert_eq!(
            wrap(
                "a",
                &WrapOptions {
                    left: Some(String::from("<")),
                    right: None
                }
            ),
            "<a]"
        );
        assert_eq!(pad("ab", None, &PadOptions::default()), "ab");
        assert_eq!(joined(Path::new("a"), "b"), PathBuf::from("a/b"));
        assert_eq!(parent_of(Path::new("a/b")), Some(PathBuf::from("a")));
        assert_eq!(parent_of(Path::new("")), None);
        assert_eq!(
            pad(
                "ab",
                None,
                &PadOptions {
                    width: Some(4),
                    ..PadOptions::default()
                }
            ),
            "  ab"
        );
        assert_eq!(
            pad(
                "ab",
                Some("."),
                &PadOptions {
                    side: Some(Side::Right),
                    width: Some(4),
                    end: Some(String::from("!"))
                }
            ),
            "ab..!"
        );
    }

    #[test]
    fn a_source_and_bytes() {
        assert_eq!(length("a\u{e9}".as_bytes()), Ok(2));
        assert_eq!(length(b""), Err(Error::Empty));
        assert_eq!(length(b"a\xff"), Err(Error::NotUtf8 { offset: 1 }));
        assert_eq!(checksum(&[1, 2]), Ok(3));
        assert_eq!(checksum(&[]), Err(Error::Empty));
        assert_eq!(reversed(&[1, 2]), vec![2, 1]);
    }

    #[test]
    fn a_buffer_appends() {
        let mut buffer = Buffer::new(b"ab");
        assert_eq!(buffer.append(b"c", None), 3);
        assert_eq!(buffer.append(b"c\xff", Some(2)), 7);
        assert_eq!(buffer.size(), 7);
    }
}
