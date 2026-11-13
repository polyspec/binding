<!-- doc-id: plan-execution -->
# Execution plan

[한국어](plan.ko.md)

## Context

- binding generates the bindings of every polyspec repository from its interface contract (`docs/spec/`). Its tasks
  are rows of [checklist.md](checklist.md), each with its deliverables, its verification command and its state, as
  `config/checklist.json` declares them; `make docs-check` reads the checklist with the documents.
- A task ID has the form `B<wave>.<number>`, and a sub-task adds `-<number>`. A wave starts when the waves that it names
  as dependencies are done.

## Wave 1 — The document structure of a polyspec repository

Dependencies: none.

Every polyspec repository keeps the same structure of documents: `config/documents.json`, `config/checklist.json`, a
plan and a checklist under `docs/plans/<plan>/` with their Korean twins, and `make docs-check`, which runs the document
check of the installed `@polyspec/kit`. binding had none of them, so a broken link, a missing twin or a checklist row
of a wrong form went unnoticed. The wave adds the check and the plan, and fixes what its first run and the review of
the Korean twins find, so that each twin carries the `source-sha256` of its English source.
