//! A sample library for the end-to-end check of binding: a variant whose cases hold the variant again (T-9, GN-6v),
//! and a class that implements a callback interface, so that an instance stands for a callback (GN-6w).

use binding_core::{Failure, Kinds};
use std::fmt;

/// The count of a length, which widens: usize is at most 64 bits wide on every target of the workspace.
#[allow(clippy::as_conversions, reason = "usize is at most 64 bits wide on every target of the workspace, so the conversion is lossless")]
const fn widen(length: usize) -> u64 {
    length as u64
}

/// The errors of the sample.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A tail without a byte.
    Empty,
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Empty => "empty",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(f, "no byte"),
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

/// A figure (T-9: a variant). Its cases are a unit variant and struct variants, and a group holds figures itself: in a
/// list, in a `Box` and in an `Option<Box>` (GN-6v). T-9: a label may have no position, and a group no figure behind.
#[derive(Debug, Clone, PartialEq)]
pub enum Figure {
    /// A point without a size.
    Dot,
    /// A circle.
    Circle {
        /// The radius.
        radius: f64,
    },
    /// A text at a position, or at none.
    Label {
        /// The text.
        text: String,
        /// The position, or `None`.
        at: Option<u64>,
    },
    /// Figures inside a frame, with a figure behind them or none.
    Group {
        /// The figures of the group.
        items: Vec<Figure>,
        /// The frame around them.
        frame: Box<Figure>,
        /// The figure behind them, or `None`.
        back: Option<Box<Figure>>,
    },
}

/// The number of the figures, each figure of a group counted with the group (T-9: a list of a variant as a parameter).
#[must_use]
pub fn tally(figures: &[Figure]) -> u64 {
    figures.iter().map(tally_one).sum()
}

fn tally_one(figure: &Figure) -> u64 {
    match figure {
        Figure::Dot | Figure::Circle { .. } | Figure::Label { .. } => 1,
        Figure::Group { items, frame, back } => {
            let behind = match back {
                Some(back) => tally_one(back),
                None => 0,
            };
            1 + tally(items) + tally_one(frame) + behind
        }
    }
}

/// The figure with each radius doubled and each text in upper case (T-9: a variant as a parameter and as a return).
#[must_use]
pub fn grown(figure: &Figure) -> Figure {
    match figure {
        Figure::Dot => Figure::Dot,
        Figure::Circle { radius } => Figure::Circle { radius: radius * 2.0 },
        Figure::Label { text, at } => Figure::Label { text: text.to_uppercase(), at: *at },
        Figure::Group { items, frame, back } => Figure::Group {
            items: items.iter().map(grown).collect(),
            frame: Box::new(grown(frame)),
            back: back.as_deref().map(|back| Box::new(grown(back))),
        },
    }
}

/// The last bytes of something, which language code implements (U-3) and a `Ribbon` implements too (GN-6w).
pub trait Tail {
    /// The last `count` bytes, or all of them when there are fewer.
    ///
    /// # Errors
    ///
    /// The failure of the implementation.
    fn last(&self, count: u64) -> Result<Vec<u8>, Failure<Error>>;
}

/// Bytes that a ribbon starts with (T-5: a class).
#[derive(Debug)]
pub struct Ribbon {
    bytes: Vec<u8>,
}

impl Ribbon {
    /// A ribbon that starts with the bytes of a source.
    #[must_use]
    pub fn new(start: &[u8]) -> Self {
        Self { bytes: start.to_vec() }
    }

    /// The number of the bytes.
    #[must_use]
    pub fn size(&self) -> u64 {
        widen(self.bytes.len())
    }
}

impl Tail for Ribbon {
    fn last(&self, count: u64) -> Result<Vec<u8>, Failure<Error>> {
        let keep = usize::try_from(count).map_or(self.bytes.len(), |count| count.min(self.bytes.len()));
        Ok(self.bytes[self.bytes.len() - keep..].to_vec())
    }
}

/// The last `count` bytes of a tail (U-3: a callback, for which an instance of `Ribbon` stands too).
///
/// # Errors
///
/// The failure of the tail.
pub fn tail_of(tail: &mut dyn Tail, count: u64) -> Result<Vec<u8>, Failure<Error>> {
    tail.last(count)
}

#[cfg(test)]
mod tests {
    use super::{grown, tail_of, tally, Figure, Ribbon};

    #[test]
    fn a_group_counts_and_grows_its_figures() {
        let group = Figure::Group {
            items: vec![Figure::Circle { radius: 1.5 }],
            frame: Box::new(Figure::Label { text: String::from("a"), at: None }),
            back: Some(Box::new(Figure::Dot)),
        };
        assert_eq!(tally(&[Figure::Dot, group.clone()]), 5);
        let grew = Figure::Group {
            items: vec![Figure::Circle { radius: 3.0 }],
            frame: Box::new(Figure::Label { text: String::from("A"), at: None }),
            back: Some(Box::new(Figure::Dot)),
        };
        assert_eq!(grown(&group), grew);
    }

    #[test]
    fn a_ribbon_is_a_tail() {
        let mut ribbon = Ribbon::new(b"abc");
        assert_eq!(ribbon.size(), 3);
        assert!(matches!(tail_of(&mut ribbon, 2), Ok(bytes) if bytes == b"bc"));
    }
}
