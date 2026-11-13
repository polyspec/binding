//! A sample library for the end-to-end check of binding: it takes and gives the record `Point` of the library
//! tests/e2e/points (T-3, GN-6c, GN-15f).

use binding_core::Kinds;
use polyspec_points::Point;
use std::fmt;

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A point that would be below zero.
    Below {
        /// The vertical place that the point would have.
        y: i64,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Below { y } => write!(f, "a point below zero at {y}"),
        }
    }
}

impl std::error::Error for Error {}

impl Kinds for Error {
    fn kind(&self) -> &'static str {
        match self {
            Self::Below { .. } => "below",
        }
    }

    fn status(&self) -> Option<u16> {
        None
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}

/// The point with its places exchanged.
#[must_use]
pub fn mirror(point: &Point) -> Point {
    Point { x: point.y, y: point.x }
}

/// The point raised by the amount.
///
/// # Errors
///
/// Kind `below` when the point would be below zero.
pub fn rise(by: i64, point: &Point) -> Result<Point, Error> {
    let y = point.y.saturating_add(by);
    if y < 0 {
        return Err(Error::Below { y });
    }
    Ok(Point { x: point.x, y })
}

#[cfg(test)]
mod tests {
    use super::{mirror, rise, Error};
    use polyspec_points::Point;

    #[test]
    fn a_point_of_the_points_library_is_mirrored_and_raised() {
        assert_eq!(mirror(&Point { x: 1, y: 2 }), Point { x: 2, y: 1 });
        assert_eq!(rise(3, &Point { x: 1, y: 2 }), Ok(Point { x: 1, y: 5 }));
        assert_eq!(rise(-3, &Point { x: 1, y: 2 }), Err(Error::Below { y: -1 }));
    }
}
