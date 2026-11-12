//! The name conversion of design N-2, public so that code which generates names at run time or in another generator
//! (such as entity code) writes the same names as binding. The vectors of `packages/core/rust/tests/vectors/naming.json`
//! are shared with binding's TypeScript conversion, so the two cannot differ unnoticed.

/// One word of a name (N-1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Word<'a> {
    /// A plain lower-case word.
    Plain(&'a str),
    /// An acronym, written by the convention of each language (N-2).
    Acronym(&'a str),
}

/// A language of a name (N-2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    /// PHP.
    Php,
    /// Python.
    Python,
    /// Node and WASM, which share one JavaScript API.
    Js,
    /// Go.
    Go,
    /// Rust.
    Rust,
}

/// What the name names (N-2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// A class, an interface, an enum, an error or a record.
    Class,
    /// A function, a method or a property.
    Callable,
    /// A parameter or a record field.
    Variable,
    /// A constant.
    Constant,
}

fn text(word: Word<'_>) -> &str {
    match word {
        Word::Plain(text) | Word::Acronym(text) => text,
    }
}

fn capital(word: &str, out: &mut String) {
    let mut chars = word.chars();
    if let Some(first) = chars.next() {
        out.extend(first.to_uppercase());
        out.push_str(chars.as_str());
    }
}

fn pascal(name: &[Word<'_>], acronyms_in_capitals: bool) -> String {
    let mut out = String::new();
    for word in name {
        match word {
            Word::Acronym(text) if acronyms_in_capitals => out.push_str(&text.to_uppercase()),
            Word::Acronym(text) | Word::Plain(text) => capital(text, &mut out),
        }
    }
    out
}

fn camel(name: &[Word<'_>]) -> String {
    let mut out = String::new();
    for (index, word) in name.iter().enumerate() {
        if index == 0 {
            out.push_str(text(*word));
        } else {
            capital(text(*word), &mut out);
        }
    }
    out
}

fn snake(name: &[Word<'_>]) -> String {
    name.iter().map(|word| text(*word)).collect::<Vec<_>>().join("_")
}

/// The name of a symbol in a language (N-2): PHP and JavaScript camelCase and PascalCase classes with an acronym as
/// one capitalised word; Python snake_case and PascalCase classes with acronyms in capitals (PEP 8); Go PascalCase
/// with acronyms in capitals; Rust snake_case and PascalCase types. A constant is UPPER_SNAKE_CASE (PSR-1, PEP 8) and
/// PascalCase in Go.
#[must_use]
pub fn convert(name: &[Word<'_>], lang: Lang, role: Role) -> String {
    match (lang, role) {
        (Lang::Go, Role::Constant) => pascal(name, true),
        (Lang::Php | Lang::Python | Lang::Js | Lang::Rust, Role::Constant) => snake(name).to_uppercase(),
        (Lang::Go, Role::Class | Role::Callable | Role::Variable) => pascal(name, true),
        (Lang::Python, Role::Class) => pascal(name, true),
        (Lang::Python | Lang::Rust, Role::Callable | Role::Variable) => snake(name),
        (Lang::Rust, Role::Class) => pascal(name, false),
        (Lang::Php | Lang::Js, Role::Class) => pascal(name, false),
        (Lang::Php | Lang::Js, Role::Callable | Role::Variable) => camel(name),
    }
}

#[cfg(test)]
mod tests {
    use super::{convert, Lang, Role, Word};

    // The shared vectors: [[words], lang, role, expected], a word being "plain" or {"acronym": "x"}.
    const VECTORS: &str = include_str!("../tests/vectors/naming.json");

    // A word written "!x" in the vectors is an acronym.
    fn words(text: &str) -> Vec<Word<'_>> {
        text.split(' ')
            .map(|word| match word.strip_prefix('!') {
                Some(acronym) => Word::Acronym(acronym),
                None => Word::Plain(word),
            })
            .collect()
    }

    #[test]
    fn the_shared_vectors_convert_alike() -> Result<(), String> {
        let vectors: Vec<[String; 4]> = serde_json::from_str(VECTORS).map_err(|error| error.to_string())?;
        assert!(vectors.len() >= 10, "only {} vectors", vectors.len());
        for [name, lang, role, expected] in &vectors {
            let lang = match lang.as_str() {
                "php" => Lang::Php,
                "python" => Lang::Python,
                "node" | "wasm" => Lang::Js,
                "go" => Lang::Go,
                "rust" => Lang::Rust,
                other => return Err(format!("unknown language {other}")),
            };
            let role = match role.as_str() {
                "class" => Role::Class,
                "callable" => Role::Callable,
                "variable" => Role::Variable,
                "constant" => Role::Constant,
                other => return Err(format!("unknown role {other}")),
            };
            assert_eq!(&convert(&words(name), lang, role), expected, "{name} {lang:?} {role:?}");
        }
        Ok(())
    }
}
