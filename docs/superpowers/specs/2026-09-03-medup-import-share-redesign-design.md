# MedUp Import, Sharing, and Visual Redesign

Date: 2026-09-03
Status: Approved for implementation planning

## Purpose

Transform MedUp from a rigid PDF-to-quiz parser into a reliable, beginner-friendly medical question workspace that remains static, private, and usable without a backend. The redesign must preserve the current prompt format while adding a canonical format that works well in NotebookLM, Google Docs, and printed PDFs.

## Product Goals

- Import questions from PDF, pasted text, Markdown, and MedUp JSON.
- Keep accepting the user's current NotebookLM prompt output.
- Add a human-readable canonical format designed for Google Docs and PDF export.
- Explain import problems precisely and allow partial recovery.
- Provide a local library of quizzes without accounts or cloud storage.
- Share a quiz as a standalone HTML file or, when small enough, a compressed URL.
- Replace the current interface with the approved Academic Performance visual direction.
- Provide a copy-ready "Prompt Supremo de Questões" in the application and as a repository document.

## Non-Goals

- No login, backend, database, analytics, or cloud synchronization.
- No AI API calls from the application.
- No OCR for image-only PDFs in this version.
- No permanent short URLs for large quizzes.
- No replacement of NotebookLM or automatic generation of questions inside MedUp.

## Technical Direction

Keep the application as static HTML, CSS, and modular JavaScript. This preserves inexpensive Vercel hosting, direct file use, privacy, and offline operation. Avoid a framework migration for this release.

Split responsibilities into modules instead of extending the current monolithic `app.js`:

- `js/core/quiz-schema.js`: canonical quiz model, defaults, and schema migration.
- `js/import/normalizer.js`: Unicode, whitespace, PDF line, heading, and marker normalization.
- `js/import/detector.js`: input format identification and confidence scoring.
- `js/import/parsers/medup-docs.js`: canonical Google Docs format.
- `js/import/parsers/legacy.js`: backward-compatible parser for the current prompt.
- `js/import/parsers/generic.js`: tolerant parser for common Markdown and plain-text questions.
- `js/import/parsers/json.js`: MedUp JSON and fenced JSON extraction.
- `js/import/validator.js`: structural validation, safe repairs, and diagnostics.
- `js/storage/library.js`: local quiz library and schema-versioned persistence.
- `js/share/share.js`: standalone HTML export and compressed URL encoding/decoding.
- `js/ui/*`: import review, library, study, editor, and sharing views.

The browser-facing entry point coordinates these modules and owns navigation only.

## Canonical Quiz Model

Each quiz contains:

- schema version, identifier, creation/update timestamps, source name, title, introduction, themes, and distribution;
- an ordered list of questions;
- for each question: stable identifier, number, topic, type, difficulty, prompt, options, correct option, per-option feedback, take-home message, key point, and optional source reference.

Correct-answer feedback is also represented per option. This removes the current special case where the correct explanation and incorrect explanations use incompatible structures.

## Canonical Google Docs Format

The Prompt Supremo produces a normal, readable document. Each question is delimited by explicit markers:

```text
=== INICIO DA QUESTAO ===
Numero: 1
Tema: Hipertensao arterial
Tipo: Clinica
Dificuldade: Intermediaria

Enunciado:
...

Alternativa A: ...
Alternativa B: ...
Alternativa C: ...
Alternativa D: ...

Resposta correta: C
Justificativa A: ...
Justificativa B: ...
Justificativa C: ...
Justificativa D: ...
Take home message: ...
Ponto-chave: ...
Fonte no material: ...
=== FIM DA QUESTAO ===
```

Parsing is accent-insensitive and accepts typography substitutions made by Google Docs or PDF extraction. The displayed prompt may use Portuguese accents; the ASCII example above defines the most transport-safe markers.

## Import Pipeline

1. Read the selected PDF or text input locally.
2. Preserve page boundaries for useful diagnostics.
3. Normalize non-breaking spaces, smart quotes, bullets, dashes, repeated whitespace, wrapped labels, and common PDF line fragmentation.
4. Detect canonical Docs format, JSON, legacy MedUp format, or generic question text.
5. Parse through the matching adapter into the canonical model.
6. Apply safe repairs such as option-label normalization and sequential numbering.
7. Validate required fields and produce question-level diagnostics.
8. Show an import review before committing data to the active quiz or local library.

Format detection never silently falls back after a high-confidence parser reports corruption. The review identifies the detected format and any fallback used.

## Import Review And Error Handling

The review screen lists every detected question with one status:

- Ready: all required fields are present.
- Attention: usable, but one or more optional fields are missing or were repaired.
- Blocked: missing required information such as prompt, enough alternatives, or a valid correct answer.

Diagnostics use plain Portuguese and point to the question and field. Users can edit an item, exclude blocked items, or return to the source text. Valid questions may be imported even when another question is blocked.

The application must not discard the source text after a parsing error. Unexpected failures show a recoverable error state rather than an alert-only dead end.

## Local Library

Quizzes are saved in browser storage with an explicit schema version. The library supports:

- title, source, question count, last update, and study progress;
- open, rename, duplicate, export, and delete actions;
- automatic saving after import and editing;
- migration of existing local quiz data when the schema changes.

Deletion requires confirmation. Storage failures explain how to export the quiz before continuing.

## Sharing Without A Backend

Every quiz can be exported as a standalone HTML player containing its data and required styles/scripts. It opens without MedUp and does not expose editing tools.

The "Copy link" action compresses the canonical quiz payload into the URL fragment. Fragment data is not sent to the hosting server. On opening such a URL, MedUp decodes, validates, and launches the shared quiz in read-only study mode.

A conservative URL-size threshold prevents unreliable links. If exceeded, the interface explains that the quiz is too large for a dependable link and recommends sharing the generated HTML file. The user never receives a link that the application already knows is unsafe.

## Offline Behavior

Runtime dependencies needed for PDF parsing and URL compression are stored in the repository rather than loaded only from a CDN. Imported documents, quiz content, progress, and exports remain local to the browser.

The interface labels this accurately as local/private operation and does not claim OCR support.

## Visual And Interaction Design

Use the approved "MedUp Academic Performance" direction:

- institutional visual authority inspired by medical education environments;
- restrained evergreen, academic crimson, warm paper, ink, and gold accents;
- editorial serif for key headings and a highly readable sans-serif for controls and body text;
- desktop sidebar with library, import, study, review, editor, and sharing destinations;
- mobile navigation adapted to the available width;
- selectively rounded surfaces for the application frame, question stage, active navigation, options, progress map, and primary actions;
- straighter dividers and compact metrics to preserve academic precision;
- no decorative gradients, floating color blobs, nested-card clutter, or excessive pill controls.

The first screen is the usable workspace, not a marketing landing page. Empty states guide the next action without lengthy feature explanations.

## Study And Editing Behavior

Preserve the current immediate-feedback study flow. Users answer one question at a time, may clear an answer, navigate through the question map, finalize, and review all feedback.

The editor supports all canonical fields and validates changes before saving. A question may be added, duplicated, reordered, or removed. Unsaved changes are persisted locally before navigation.

## Prompt Supremo Deliverable

Create `PROMPT-SUPREMO-MEDUP.md` with a copy-ready NotebookLM prompt. Also expose the same prompt in the import experience with a copy button.

The prompt must:

- generate a configurable number of questions;
- remain grounded exclusively in the supplied material;
- prioritize clinical reasoning and realistic vignettes;
- balance correct-option positions without a predictable sequence;
- produce one unequivocally correct answer and plausible distractors;
- explain every option individually;
- identify themes and clinical/conceptual distribution;
- include difficulty, take-home message, key point, and source reference;
- use the canonical Google Docs markers exactly;
- forbid invented facts when the source material is insufficient;
- keep the result readable when pasted into Google Docs and printed to PDF.

## Testing Strategy

Add automated unit tests for normalization, detection, every parser adapter, validation, schema migration, URL round trips, and size fallback. Fixtures include:

- the existing repository sample;
- output shaped like the user's current prompt;
- canonical Google Docs text;
- PDF-style removed line breaks and non-breaking spaces;
- option variants such as `A)`, `A.`, `A -`, and `Alternativa A:`;
- missing, duplicated, and five-option cases;
- accented and unaccented field labels;
- malformed JSON surrounded by NotebookLM prose;
- long quizzes that must fall back from URL to HTML.

Run browser-level tests for import review, answering, editing, local persistence, standalone HTML export, shared-link opening, keyboard navigation, and responsive layouts. Verify desktop and mobile screenshots for overlap, clipping, and readable text.

## Acceptance Criteria

- Existing sample content imports with all questions, correct answers, and option feedback intact.
- Output following the user's current prompt remains supported.
- Canonical Docs content survives paste and representative PDF extraction changes.
- A malformed question does not prevent valid questions from being recovered.
- No imported content is transmitted to a backend.
- Small quizzes create working share links; oversized quizzes clearly fall back to HTML.
- Standalone HTML works without the editor and without network access.
- Local library data survives reload and supports schema migration.
- The interface matches the approved fluid Academic Performance direction on desktop and mobile.
- The final handoff includes the copy-ready Prompt Supremo.

## Delivery Order

1. Establish tests and the canonical schema.
2. Implement normalization, detection, parser adapters, validation, and import review.
3. Add the local library and editor improvements.
4. Add compressed-link and standalone HTML sharing.
5. Apply the approved visual system across the application and export player.
6. Add the Prompt Supremo in the repository and application.
7. Complete automated, responsive, offline, and regression verification.
