//! A sample library for the end-to-end check of binding: the shapes of values. A source (T-1), bytes (T-7), a
//! parameter and a record field that the caller may leave out (U-2, T-4), and kinds that are thrown as the classes of
//! error units (E-2).

use binding_core::Kinds;
use std::fmt;

/// The count of a length, which widens: usize is at most 64 bits wide on every target of the workspace.
#[allow(clippy::as_conversions, reason = "usize is at most 64 bits wide on every target of the workspace, so the conversion is lossless")]
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
        Err(error) => Err(Error::NotUtf8 { offset: error.valid_up_to() }),
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
    Ok((0..times).map(|_index| text).collect::<Vec<_>>().join(separator))
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
    let body = if upper { text.to_uppercase() } else { text.to_owned() };
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
    Measure { length: widen(text.chars().count()), empty: text.is_empty() }
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
    widths.iter().fold(0, |sum, width| sum.saturating_add(*width))
}

/// The largest of the values, 0 for none (GN-6ad: a list parameter that the core borrows as a slice of u32).
#[must_use]
pub fn largest(values: &[u32]) -> u32 {
    values.iter().copied().fold(0, u32::max)
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
        Self { bytes: start.to_vec() }
    }

    /// The last `count` bytes, or all of them when there are fewer (the member `from_end`, a method whose name the
    /// lints of the generated code take as any name).
    #[must_use]
    pub fn last(&self, count: u64) -> Vec<u8> {
        let keep = usize::try_from(count).map_or(self.bytes.len(), |count| count.min(self.bytes.len()));
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

#[cfg(test)]
mod tests {
    use super::{checksum, frame, length, repeat, reversed, total, wrap, Buffer, Error, FrameOptions, WrapOptions};

    #[test]
    fn none_is_the_default() {
        assert_eq!(repeat("a", None, None), repeat("a", Some(super::DEFAULT_TIMES), Some(super::DEFAULT_SEPARATOR)));
        assert_eq!(repeat("a", Some(2), Some("-")), Ok(String::from("a-a")));
        assert_eq!(repeat("a", Some(1001), None), Err(Error::TooMany { times: 1001 }));
        let plain = FrameOptions { prefix: String::from(">"), upper: None, width: None };
        assert_eq!(frame("a", &plain), ">a");
        assert_eq!(frame("a", &FrameOptions { upper: Some(super::DEFAULT_UPPER), ..plain.clone() }), ">a");
        assert_eq!(frame("a", &FrameOptions { upper: Some(true), width: Some(3), ..plain }), ">A  ");
        assert_eq!(total(None), total(Some(&[])));
        assert_eq!(wrap("a", &WrapOptions::default()), "[a]");
        assert_eq!(wrap("a", &WrapOptions { left: Some(String::from("<")), right: None }), "<a]");
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
