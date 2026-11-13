//! A sample library for the end-to-end check of binding: its record `Point` is taken and given by another repository,
//! tests/e2e/plot (T-3, GN-15f).

use binding_core::Kinds;
use std::fmt;

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A shift by a negative amount.
    Backward {
        /// The amount.
        by: i64,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Backward { by } => write!(f, "a shift backward by {by}"),
        }
    }
}

impl std::error::Error for Error {}

impl Kinds for Error {
    fn kind(&self) -> &'static str {
        match self {
            Self::Backward { .. } => "backward",
        }
    }

    fn status(&self) -> Option<u16> {
        None
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}

/// A point of the plane.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Point {
    /// The horizontal place.
    pub x: i64,
    /// The vertical place.
    pub y: i64,
}

/// The point moved by the amount on both axes.
///
/// # Errors
///
/// Kind `backward` when the amount is negative.
pub fn shift(by: i64, point: &Point) -> Result<Point, Error> {
    if by < 0 {
        return Err(Error::Backward { by });
    }
    Ok(Point {
        x: point.x.saturating_add(by),
        y: point.y.saturating_add(by),
    })
}

#[cfg(test)]
mod tests {
    use super::{shift, Error, Point};

    #[test]
    fn a_point_moves_forward_only() {
        assert_eq!(shift(3, &Point { x: 1, y: 2 }), Ok(Point { x: 4, y: 5 }));
        assert_eq!(
            shift(-1, &Point { x: 1, y: 2 }),
            Err(Error::Backward { by: -1 })
        );
    }
}
