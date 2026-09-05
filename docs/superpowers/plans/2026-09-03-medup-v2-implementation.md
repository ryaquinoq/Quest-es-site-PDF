# MedUp V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, static medical-question workspace with resilient Google Docs/PDF import, backward compatibility, local library, no-backend sharing, and the approved fluid Academic Performance interface.

**Architecture:** Keep the production application framework-free and split behavior into browser ES modules with a canonical quiz schema. All input adapters feed one validation pipeline, and all study, editing, storage, and sharing features consume the same normalized model.

**Tech Stack:** HTML5, CSS, browser ES modules, PDF.js 6.3.289 vendored locally, native CompressionStream/DecompressionStream, IndexedDB, Node.js 22.13+ test runner, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-09-03-medup-import-share-redesign-design.md`

## Global Constraints

- The production application remains static and requires no backend, login, database, analytics, or AI API.
- Imported documents and quiz data never leave the browser.
- The current NotebookLM prompt output remains supported.
- The canonical format remains readable in Google Docs and survives representative PDF line changes.
- Runtime assets do not depend on a CDN.
- The first screen is the usable product workspace, not a marketing landing page.
- The approved interface uses evergreen, academic crimson, warm paper, ink, and gold with selectively rounded interactive surfaces.
- Small quizzes may use compressed URL fragments; large quizzes must fall back clearly to standalone HTML.
- The final delivery includes `PROMPT-SUPREMO-MEDUP.md` and the same prompt inside the import experience.

---

## File Structure

### Core And Import

- `js/core/quiz-schema.js`: canonical model constructors, version checks, and migrations.
- `js/import/normalizer.js`: source cleanup without interpreting question meaning.
- `js/import/detector.js`: format selection and confidence reporting.
- `js/import/parsers/medup-docs.js`: canonical Docs markers.
- `js/import/parsers/legacy.js`: current MedUp prompt compatibility.
- `js/import/parsers/generic.js`: common Markdown and plain-text variants.
- `js/import/parsers/json.js`: raw/fenced MedUp JSON.
- `js/import/validator.js`: repairs and question-level diagnostics.
- `js/import/pipeline.js`: public import orchestration interface.
- `js/import/pdf.js`: local PDF.js loading and page-aware extraction.

### Product Features

- `js/storage/library.js`: IndexedDB repository and migrations.
- `js/share/codec.js`: compressed fragment round trips and size policy.
- `js/share/standalone.js`: offline HTML quiz generation.
- `js/ui/state.js`: application state and subscriptions.
- `js/ui/render.js`: semantic rendering and delegated interactions.
- `js/ui/views/import-view.js`: source entry and import review.
- `js/ui/views/library-view.js`: locally saved quiz management.
- `js/ui/views/study-view.js`: answering, progress, and final review.
- `js/ui/views/editor-view.js`: canonical-field editing and question operations.
- `js/ui/views/share-view.js`: link/HTML/JSON sharing actions.
- `js/prompt-supremo.js`: prompt text exported for in-app copying.
- `app.js`: application composition and startup only.

### Presentation And Tooling

- `style.css`: CSS entry file.
- `styles/tokens.css`: color, typography, spacing, radius, and elevation tokens.
- `styles/layout.css`: responsive application shell and view layouts.
- `styles/components.css`: controls, status, question, editor, and feedback styling.
- `vendor/pdfjs/pdf.min.mjs`: vendored PDF.js runtime.
- `vendor/pdfjs/pdf.worker.min.mjs`: vendored PDF.js worker.
- `scripts/vendor-pdfjs.mjs`: repeatable vendor-copy script.
- `scripts/serve.mjs`: local static test server.
- `tests/fixtures/*`: legacy, canonical, generic, malformed, and long-quiz samples.
- `tests/unit/*.test.js`: pure-module tests.
- `tests/e2e/medup.test.mjs`: complete browser workflow tests.
- `PROMPT-SUPREMO-MEDUP.md`: copy-ready NotebookLM prompt.

---

### Task 1: Establish The Test Harness And Versioned PDF Runtime

**Files:**
- Create: `package.json`
- Create: `scripts/serve.mjs`
- Create: `scripts/vendor-pdfjs.mjs`
- Create: `tests/unit/harness.test.js`
- Create: `tests/fixtures/legacy-current-prompt.txt`
- Create: `tests/fixtures/medup-docs.txt`
- Create: `tests/fixtures/generic-markdown.txt`
- Create: `tests/fixtures/malformed.txt`
- Create: `tests/fixtures/current-sample.json`
- Create: `vendor/pdfjs/pdf.min.mjs`
- Create: `vendor/pdfjs/pdf.worker.min.mjs`

**Interfaces:**
- Consumes: existing repository sample and the approved design spec.
- Produces: `npm test`, `npm run serve`, `npm run vendor:pdfjs`, and stable fixtures for later tasks.

- [ ] **Step 1: Add the package manifest and harness smoke test**

```json
{
  "name": "medup",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.13.0" },
  "scripts": {
    "test": "node --test tests/unit/*.test.js",
    "test:e2e": "node --test tests/e2e/*.test.mjs",
    "serve": "node scripts/serve.mjs",
    "vendor:pdfjs": "node scripts/vendor-pdfjs.mjs"
  },
  "devDependencies": {
    "pdfjs-dist": "6.3.289",
    "playwright": "1.62.1"
  }
}
```

```js
// tests/unit/harness.test.js
import test from "node:test";
import assert from "node:assert/strict";

test("test harness loads ES modules", () => {
  assert.equal(typeof structuredClone, "function");
});
```

- [ ] **Step 2: Run the harness test**

Run: `npm test`

Expected: one passing test and exit code 0.

- [ ] **Step 3: Add the deterministic static server**

```js
// scripts/serve.mjs
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const target = resolve(root, requestedPath);
  const relativeTarget = relative(root, target);
  if (relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, "index.html") : target;
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`MedUp http://127.0.0.1:${port}`));
```

- [ ] **Step 4: Add fixture contents and the PDF vendor script**

The canonical fixture contains two complete questions using `=== INICIO DA QUESTAO ===` and `=== FIM DA QUESTAO ===`. The legacy fixture follows the user's existing prompt with `Questão N`, `A)`, `Take home message`, and the separate commented answer key. The malformed fixture has one valid question and one question without a correct answer.

```js
// scripts/vendor-pdfjs.mjs
import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const runtime = fileURLToPath(import.meta.resolve("pdfjs-dist/build/pdf.min.mjs"));
const worker = fileURLToPath(import.meta.resolve("pdfjs-dist/build/pdf.worker.min.mjs"));
await mkdir("vendor/pdfjs", { recursive: true });
await copyFile(runtime, "vendor/pdfjs/pdf.min.mjs");
await copyFile(worker, "vendor/pdfjs/pdf.worker.min.mjs");
```

- [ ] **Step 5: Install dependencies, vendor PDF.js, and rerun tests**

Run: `npm install && npm run vendor:pdfjs && npm test`

Expected: lockfile and both PDF assets exist; unit tests pass.

- [ ] **Step 6: Commit the harness**

```bash
git add package.json package-lock.json scripts vendor tests/fixtures tests/unit/harness.test.js
git commit -m "test: establish MedUp module harness and fixtures"
```

---

### Task 2: Define The Canonical Quiz Schema And Validator

**Files:**
- Create: `js/core/quiz-schema.js`
- Create: `js/import/validator.js`
- Create: `tests/unit/quiz-schema.test.js`
- Create: `tests/unit/validator.test.js`

**Interfaces:**
- Consumes: plain parsed objects from import adapters.
- Produces: `createQuiz(input)`, `createQuestion(input, index)`, `migrateQuiz(input)`, and `validateQuiz(input)` returning `{ quiz, status, diagnostics }`.

- [ ] **Step 1: Write failing schema tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createQuiz, migrateQuiz } from "../../js/core/quiz-schema.js";

test("createQuiz assigns stable canonical defaults", () => {
  const quiz = createQuiz({ title: "Cardiologia", questions: [{ prompt: "Caso", options: { A: "Um", B: "Dois" }, correctOption: "B" }] });
  assert.equal(quiz.schemaVersion, 2);
  assert.equal(quiz.title, "Cardiologia");
  assert.equal(quiz.questions[0].options[1].label, "B");
  assert.equal(quiz.questions[0].feedback.B, "");
});

test("migrateQuiz converts legacy feedback", () => {
  const legacy = { metadata: { title: "Teste" }, questions: [{ id: "q-1", number: 1, prompt: "Caso", options: [{ label: "A", text: "Um" }, { label: "B", text: "Dois" }], feedback: { correctOption: "B", correctReason: "Certa", optionFeedback: { A: "Errada" } } }] };
  const quiz = migrateQuiz(legacy);
  assert.deepEqual(quiz.questions[0].feedback, { A: "Errada", B: "Certa" });
});
```

- [ ] **Step 2: Run schema tests and confirm missing-module failure**

Run: `node --test tests/unit/quiz-schema.test.js`

Expected: FAIL because `quiz-schema.js` does not exist.

- [ ] **Step 3: Implement schema constructors and migration**

```js
export const SCHEMA_VERSION = 2;
const labels = ["A", "B", "C", "D", "E"];

export function createQuestion(input = {}, index = 0) {
  const rawOptions = Array.isArray(input.options)
    ? input.options
    : Object.entries(input.options || {}).map(([label, text]) => ({ label, text }));
  const options = rawOptions.map((option, optionIndex) => ({
    label: String(option.label || labels[optionIndex]).toUpperCase(),
    text: String(option.text || "").trim()
  }));
  const number = Number(input.number || index + 1);
  const correctOption = String(input.correctOption || input.feedback?.correctOption || "").toUpperCase();
  return {
    id: String(input.id || `q-${number}`), number,
    topic: String(input.topic || "Sem tema").trim(),
    type: String(input.type || "Clínica").trim(),
    difficulty: String(input.difficulty || "Não informada").trim(),
    prompt: String(input.prompt || "").trim(), options,
    correctOption,
    feedback: Object.fromEntries(options.map(({ label }) => [label, String(
      input.feedback?.[label] ||
      input.feedback?.optionFeedback?.[label] ||
      (label === correctOption ? input.feedback?.correctReason : "") ||
      ""
    ).trim()])),
    takeHome: String(input.takeHome || "").trim(),
    keyPoint: String(input.keyPoint || input.feedback?.keyPoint || "").trim(),
    sourceReference: String(input.sourceReference || "").trim()
  };
}

export function createQuiz(input = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: String(input.id || crypto.randomUUID()),
    createdAt: input.createdAt || now, updatedAt: input.updatedAt || now,
    sourceName: String(input.sourceName || ""),
    title: String(input.title || input.metadata?.title || "Simulado sem título").trim(),
    introduction: String(input.introduction || input.metadata?.intro || "").trim(),
    themes: [...(input.themes || input.metadata?.themes || [])],
    distribution: [...(input.distribution || input.metadata?.distribution || [])],
    questions: (input.questions || []).map(createQuestion)
  };
}

export function migrateQuiz(input) { return createQuiz(input); }
```

- [ ] **Step 4: Write failing validator tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateQuiz } from "../../js/import/validator.js";

test("validator repairs labels and numbers but blocks a missing answer", () => {
  const result = validateQuiz({ title: "Teste", questions: [
    { number: 9, prompt: "Caso", options: [{ label: "a", text: "Um" }, { label: "b", text: "Dois" }], correctOption: "b" },
    { prompt: "Sem resposta", options: { A: "Um", B: "Dois" } }
  ]});
  assert.equal(result.quiz.questions[0].number, 1);
  assert.equal(result.diagnostics[0].status, "attention");
  assert.equal(result.diagnostics[1].status, "blocked");
  assert.match(result.diagnostics[1].messages[0], /resposta correta/i);
});
```

- [ ] **Step 5: Implement validation and run focused tests**

`validateQuiz` must call `createQuiz`, renumber sequentially, uppercase labels, reject duplicate labels, require a non-empty prompt, require 2-5 non-empty options, and require `correctOption` to match an existing label. Missing topic, difficulty, take-home, feedback, key point, or source reference produces `attention`, not `blocked`.

Run: `node --test tests/unit/quiz-schema.test.js tests/unit/validator.test.js`

Expected: all schema and validation tests pass.

- [ ] **Step 6: Commit schema and validation**

```bash
git add js/core/quiz-schema.js js/import/validator.js tests/unit/quiz-schema.test.js tests/unit/validator.test.js
git commit -m "feat: add canonical quiz schema and diagnostics"
```

---

### Task 3: Normalize Sources And Detect Formats

**Files:**
- Create: `js/import/normalizer.js`
- Create: `js/import/detector.js`
- Create: `tests/unit/normalizer.test.js`
- Create: `tests/unit/detector.test.js`

**Interfaces:**
- Consumes: source string plus optional `{ pageBreakToken }`.
- Produces: `normalizeSource(text) -> string` and `detectFormat(text) -> { format, confidence, reasons }`.

- [ ] **Step 1: Write failing normalization tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSource } from "../../js/import/normalizer.js";

test("normalizes Google Docs and PDF typography", () => {
  const input = "Questão\u00a01\r\nA .\u00a0 Opção\nResposta   correta :  a";
  const output = normalizeSource(input);
  assert.match(output, /Questão 1\nA\. Opção\nResposta correta: a/);
});

test("keeps paragraph boundaries while joining wrapped field labels", () => {
  const output = normalizeSource("Alternativa\nA: Conduta\n\nEnunciado:\nCaso clínico");
  assert.match(output, /Alternativa A: Conduta\n\nEnunciado:/);
});
```

- [ ] **Step 2: Run normalization tests and confirm failure**

Run: `node --test tests/unit/normalizer.test.js`

Expected: FAIL because the normalizer does not exist.

- [ ] **Step 3: Implement conservative source normalization**

Normalize CRLF, Unicode spaces, curly quotes, ellipses, option labels, spaced colons, repeated horizontal whitespace, and more than two blank lines. Join only recognized field labels split directly before their value marker; never join arbitrary prose lines.

- [ ] **Step 4: Write failing detector tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { detectFormat } from "../../js/import/detector.js";

test("prefers canonical markers over surrounding prose", () => {
  const result = detectFormat("Resumo do NotebookLM\n=== INICIO DA QUESTAO ===\nNumero: 1\n=== FIM DA QUESTAO ===");
  assert.equal(result.format, "medup-docs");
  assert.ok(result.confidence >= 0.9);
});

test("recognizes the legacy split answer key", () => {
  const result = detectFormat("Questão 1 — Tema | Clínica\nA) Um\nB) Dois\nGABARITO E FEEDBACK DETALHADO\nQuestão 1 — Resposta correta: B");
  assert.equal(result.format, "legacy");
});
```

- [ ] **Step 5: Implement scored detection and run tests**

Detection priority is canonical markers, JSON shape/fence, legacy answer-key headings, then generic numbered questions. Return `unknown` below confidence 0.45.

Run: `node --test tests/unit/normalizer.test.js tests/unit/detector.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit normalization and detection**

```bash
git add js/import/normalizer.js js/import/detector.js tests/unit/normalizer.test.js tests/unit/detector.test.js
git commit -m "feat: normalize document text and detect quiz formats"
```

---

### Task 4: Implement Parser Adapters And The Import Pipeline

**Files:**
- Create: `js/import/parsers/medup-docs.js`
- Create: `js/import/parsers/legacy.js`
- Create: `js/import/parsers/generic.js`
- Create: `js/import/parsers/json.js`
- Create: `js/import/pipeline.js`
- Modify: `parser.js`
- Create: `tests/unit/parsers.test.js`
- Create: `tests/unit/pipeline.test.js`

**Interfaces:**
- Consumes: normalized strings.
- Produces: each adapter exposes `parse(text) -> partialQuiz`; `importQuiz(text, options) -> { quiz, detectedFormat, confidence, diagnostics, sourceText }`.

- [ ] **Step 1: Write failing canonical and legacy parser tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importQuiz } from "../../js/import/pipeline.js";

test("imports canonical Google Docs questions", async () => {
  const source = await readFile("tests/fixtures/medup-docs.txt", "utf8");
  const result = importQuiz(source);
  assert.equal(result.detectedFormat, "medup-docs");
  assert.equal(result.quiz.questions.length, 2);
  assert.equal(result.quiz.questions[0].feedback.C.length > 0, true);
});

test("keeps current prompt compatibility and all option feedback", async () => {
  const source = await readFile("tests/fixtures/legacy-current-prompt.txt", "utf8");
  const result = importQuiz(source);
  assert.equal(result.detectedFormat, "legacy");
  assert.deepEqual(Object.keys(result.quiz.questions[0].feedback), ["A", "B", "C", "D"]);
  assert.equal(result.diagnostics.some(item => item.status === "blocked"), false);
});
```

- [ ] **Step 2: Run parser tests and confirm failure**

Run: `node --test tests/unit/parsers.test.js`

Expected: FAIL because `pipeline.js` does not exist.

- [ ] **Step 3: Implement the canonical adapter**

Split on accent-insensitive start/end markers. Within each block, locate labels at line starts while allowing wrapped values. Required labels are number, prompt, at least two alternatives, and correct answer. Map `Justificativa X` directly into `feedback[X]`.

- [ ] **Step 4: Implement the legacy adapter**

Reuse the current semantic sections but replace whitespace-sensitive regular expressions with line-anchored tokenization. Accept `Questão`/`Questao`, 2-5 options, optional emojis, alternate dash characters, and answer-key blocks where option feedback may appear without reliable newlines.

- [ ] **Step 5: Implement JSON and generic adapters**

The JSON adapter extracts either the entire trimmed input or the first fenced `json` block, parses it, and passes the result to `migrateQuiz`. The generic adapter accepts `Questão 1`, `1.`, `1)`, Markdown headings, and option labels `A)`, `A.`, `A -`, and `Alternativa A:`; answers may appear inline or in a final answer-key section.

- [ ] **Step 6: Implement pipeline orchestration**

```js
export function importQuiz(rawText, options = {}) {
  const sourceText = String(rawText || "");
  const normalized = normalizeSource(sourceText);
  const detection = options.format ? { format: options.format, confidence: 1, reasons: ["manual"] } : detectFormat(normalized);
  const adapter = adapters[detection.format];
  if (!adapter) return { quiz: createQuiz(), detectedFormat: "unknown", confidence: detection.confidence, diagnostics: [{ questionNumber: null, status: "blocked", messages: ["Não foi possível reconhecer o formato das questões."] }], sourceText };
  const parsed = adapter.parse(normalized);
  return { ...validateQuiz(parsed), detectedFormat: detection.format, confidence: detection.confidence, sourceText };
}
```

- [ ] **Step 7: Turn `parser.js` into a compatibility facade**

Expose `window.QuizParser.parse(rawText)` as a call to `importQuiz(rawText).quiz` during migration, and preserve `extractTextFromPDF` until Task 5 replaces it with `js/import/pdf.js`.

- [ ] **Step 8: Run all parser tests**

Run: `node --test tests/unit/parsers.test.js tests/unit/pipeline.test.js tests/unit/validator.test.js`

Expected: canonical, legacy, JSON, generic, malformed-partial-recovery, and current-sample tests pass.

- [ ] **Step 9: Commit parser adapters**

```bash
git add js/import parser.js tests/unit/parsers.test.js tests/unit/pipeline.test.js
git commit -m "feat: add resilient multi-format import pipeline"
```

---

### Task 5: Add Local PDF Extraction And Import Review

**Files:**
- Create: `js/import/pdf.js`
- Create: `js/ui/state.js`
- Create: `js/ui/views/import-view.js`
- Modify: `index.html`
- Modify: `app.js`
- Create: `tests/unit/pdf-lines.test.js`
- Create: `tests/e2e/import-review.test.mjs`

**Interfaces:**
- Consumes: `importQuiz`, PDF `File`, pasted text, and DOM events.
- Produces: `extractPdf(file, onProgress) -> { text, pages }`, `createStore(initialState)`, and `renderImportView(container, store)`.

- [ ] **Step 1: Write a failing page-line reconstruction test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { reconstructPageText } from "../../js/import/pdf.js";

test("reconstructPageText preserves option boundaries", () => {
  const items = [
    { str: "A)", transform: [1,0,0,1,40,700] },
    { str: "Conduta inicial", transform: [1,0,0,1,65,700] },
    { str: "B)", transform: [1,0,0,1,40,680] },
    { str: "Observação", transform: [1,0,0,1,65,680] }
  ];
  assert.equal(reconstructPageText(items), "A) Conduta inicial\nB) Observação");
});
```

- [ ] **Step 2: Run the PDF text test and confirm failure**

Run: `node --test tests/unit/pdf-lines.test.js`

Expected: FAIL because `pdf.js` does not exist.

- [ ] **Step 3: Implement local PDF extraction**

Load `../../vendor/pdfjs/pdf.min.mjs`, set the worker URL with `new URL`, group text items by Y tolerance, sort each line by X, add a space only when the geometric gap warrants it, and separate pages with `\n\n<<< MEDUP_PAGE_BREAK:N >>>\n\n`.

- [ ] **Step 4: Write the failing import-review browser test**

The test starts `scripts/serve.mjs`, opens `/`, pastes `tests/fixtures/malformed.txt`, clicks `Analisar questões`, and asserts that one row is Ready and one is Blocked. It then excludes the blocked row, confirms import, and verifies one study question is loaded.

- [ ] **Step 5: Build the store and import review view**

State includes `{ route, activeQuiz, importDraft, importResult, selectedQuestion, answers, finalized, notice }`. The import view accepts `.pdf`, `.txt`, `.md`, and `.json`, retains source text after errors, displays detected format/confidence, and renders one diagnostic row per question with Ready/Attention/Blocked status.

- [ ] **Step 6: Integrate the new module entry**

Replace classic script startup with `<script type="module" src="app.js"></script>`. `app.js` imports the store and views, hydrates shared-link state before local library state, and renders the workspace route.

- [ ] **Step 7: Run unit and focused browser tests**

Run: `npm test && node --test tests/e2e/import-review.test.mjs`

Expected: all unit tests pass; the import review recovers the valid question.

- [ ] **Step 8: Commit PDF import and review**

```bash
git add index.html app.js js/import/pdf.js js/ui/state.js js/ui/views/import-view.js tests/unit/pdf-lines.test.js tests/e2e/import-review.test.mjs
git commit -m "feat: add local PDF import review workflow"
```

---

### Task 6: Build The Local Library And Canonical Editor

**Files:**
- Create: `js/storage/library.js`
- Create: `js/ui/views/library-view.js`
- Create: `js/ui/views/editor-view.js`
- Create: `tests/unit/library.test.js`
- Create: `tests/e2e/library-editor.test.mjs`

**Interfaces:**
- Consumes: canonical quiz objects and `validateQuiz`.
- Produces: `quizLibrary` with `list`, `get`, `put`, `rename`, `duplicate`, `remove`, `importLegacy`; library/editor render functions.

- [ ] **Step 1: Write failing library repository tests**

Use an injected storage adapter so unit tests run without browser IndexedDB:

```js
const repository = createQuizLibrary(memoryAdapter());
await repository.put(createQuiz({ id: "quiz-1", title: "Cardio", questions: [] }));
assert.equal((await repository.list())[0].title, "Cardio");
const copy = await repository.duplicate("quiz-1");
assert.notEqual(copy.id, "quiz-1");
assert.match(copy.title, /cópia/i);
```

- [ ] **Step 2: Run library tests and confirm failure**

Run: `node --test tests/unit/library.test.js`

Expected: FAIL because `library.js` does not exist.

- [ ] **Step 3: Implement schema-versioned IndexedDB storage**

Create database `medup`, version 2, with `quizzes` keyed by `id`. Store `updatedAt` indexes and migrate the previous single active quiz from localStorage key `medup.quiz` once. Surface quota/private-mode errors with `{ code, message, recoverable }`.

- [ ] **Step 4: Build the library view**

Render title, source, question count, progress, and update time in a scan-friendly list. Provide open, rename, duplicate, export, and delete actions. Delete opens a confirmation dialog naming the quiz.

- [ ] **Step 5: Build the canonical editor**

Support quiz metadata and all question fields, per-option feedback, add, duplicate, move up/down, and delete. Validate on save, keep the form open when blocked, and autosave valid changes before route or question changes.

- [ ] **Step 6: Add and run the browser workflow test**

Import a canonical fixture, reload, assert the quiz remains in the library, edit question 1, duplicate it, move the copy, delete it with confirmation, reload again, and assert the edited value persists.

Run: `npm test && node --test tests/e2e/library-editor.test.mjs`

Expected: storage and editor workflows pass.

- [ ] **Step 7: Commit library and editor**

```bash
git add js/storage/library.js js/ui/views/library-view.js js/ui/views/editor-view.js tests/unit/library.test.js tests/e2e/library-editor.test.mjs
git commit -m "feat: add local quiz library and canonical editor"
```

---

### Task 7: Implement Link And Standalone HTML Sharing

**Files:**
- Create: `js/share/codec.js`
- Create: `js/share/standalone.js`
- Create: `js/ui/views/share-view.js`
- Create: `tests/unit/share-codec.test.js`
- Create: `tests/unit/standalone.test.js`
- Create: `tests/fixtures/long-quiz.json`
- Create: `tests/e2e/sharing.test.mjs`

**Interfaces:**
- Consumes: validated canonical quiz.
- Produces: `encodeQuizFragment(quiz)`, `decodeQuizFragment(fragment)`, `getShareDecision(quiz, baseUrl)`, `generateStandaloneHtml(quiz)`, and `renderShareView`.

- [ ] **Step 1: Write failing codec round-trip and size-policy tests**

```js
test("compressed fragment round trips Unicode quiz data", async () => {
  const quiz = createQuiz({ title: "Emergências", questions: [{ prompt: "Dor torácica", options: { A: "Ação", B: "Observação" }, correctOption: "A" }] });
  const fragment = await encodeQuizFragment(quiz);
  assert.deepEqual(await decodeQuizFragment(fragment), quiz);
});

test("oversized quizzes fall back to HTML", async () => {
  const quiz = JSON.parse(await readFile("tests/fixtures/long-quiz.json", "utf8"));
  const decision = await getShareDecision(quiz, "https://medup.example/");
  assert.equal(decision.mode, "html");
  assert.match(decision.message, /grande demais/i);
});
```

- [ ] **Step 2: Run codec tests and confirm failure**

Run: `node --test tests/unit/share-codec.test.js`

Expected: FAIL because sharing modules do not exist.

- [ ] **Step 3: Implement native compression and URL policy**

Serialize canonical JSON with `TextEncoder`, compress using `CompressionStream("deflate-raw")`, convert bytes to base64url, and prefix the fragment with `#quiz=v2.`. Reverse the steps with `DecompressionStream`. Use a conservative complete-URL threshold of 12,000 characters; if compression APIs are unavailable or the result exceeds the threshold, return HTML mode.

- [ ] **Step 4: Write failing standalone HTML tests**

Assert the output contains the quiz title, embedded schema version, no editor controls, no remote `http` asset URLs, and escapes `</script>` as `\u003c/script>`.

- [ ] **Step 5: Implement the standalone player generator**

Generate one HTML string with embedded CSS, canonical data, study navigation, immediate feedback, final review, reset, print styles, and no network dependencies. Reuse pure rendering helpers shared with `study-view.js` rather than copying the current 600-line template literal.

- [ ] **Step 6: Build the sharing view**

Offer `Copiar link`, `Baixar HTML`, and `Baixar JSON`. Disable `Copiar link` with the exact size-policy explanation when HTML fallback is required. Use the Web Share API for the generated HTML file when supported and keep download as the universal path.

- [ ] **Step 7: Test browser sharing flows**

Create a small quiz, copy/open its fragment URL in a new page, answer it, and verify read-only study mode. Create a long quiz, assert the link action is disabled, download HTML, open it without the server, and complete one question.

Run: `npm test && node --test tests/e2e/sharing.test.mjs`

Expected: all share round trips and fallback paths pass.

- [ ] **Step 8: Commit sharing**

```bash
git add js/share js/ui/views/share-view.js tests/unit/share-codec.test.js tests/unit/standalone.test.js tests/fixtures/long-quiz.json tests/e2e/sharing.test.mjs
git commit -m "feat: share quizzes by compressed link or offline HTML"
```

---

### Task 8: Apply The Approved Academic Performance Interface

**Files:**
- Create: `styles/tokens.css`
- Create: `styles/layout.css`
- Create: `styles/components.css`
- Modify: `style.css`
- Create: `js/ui/render.js`
- Create: `js/ui/views/study-view.js`
- Modify: `js/ui/views/import-view.js`
- Modify: `js/ui/views/library-view.js`
- Modify: `js/ui/views/editor-view.js`
- Modify: `js/ui/views/share-view.js`
- Modify: `index.html`
- Create: `tests/e2e/visual-accessibility.test.mjs`

**Interfaces:**
- Consumes: application state and canonical quiz data.
- Produces: `renderApp(root, state, actions)` and responsive semantic views.

- [ ] **Step 1: Write the failing accessibility/layout assertions**

The test checks one `main`, labelled primary navigation, visible focus, unique headings, answer buttons with option labels, dialog focus return, keyboard answer/navigation, and no horizontal document overflow at 390x844, 768x1024, and 1440x1000.

- [ ] **Step 2: Run the test against the existing interface**

Run: `node --test tests/e2e/visual-accessibility.test.mjs`

Expected: FAIL on the new landmark, focus, and responsive assertions.

- [ ] **Step 3: Add design tokens and CSS boundaries**

```css
:root {
  --color-ink:#17231e; --color-primary:#086448; --color-primary-deep:#064b37;
  --color-academic:#a51c30; --color-gold:#c39a4b; --color-paper:#f2f4ef;
  --color-surface:#ffffff; --color-line:#d9dfda; --color-muted:#6a766f;
  --font-editorial:Georgia,"Times New Roman",serif;
  --font-ui:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --radius-control:10px; --radius-option:12px; --radius-panel:18px; --radius-shell:24px;
  --shadow-panel:0 12px 32px rgba(28,45,36,.08);
}
```

`style.css` imports tokens, layout, then components. No negative letter spacing, viewport-scaled type, decorative gradients, nested cards, or floating color blobs.

- [ ] **Step 4: Build the responsive product shell**

Implement the institutional ribbon, MedUp lockup, desktop sidebar, mobile navigation, route heading, notices, and stable action region. Use text with familiar controls and accessible labels; icon-only controls require a tooltip and screen-reader label.

- [ ] **Step 5: Build the study and review experience**

Use the approved question paper, rounded alternatives, continuous metrics strip, progress map, immediate feedback, previous/next actions, finalization, overall review, and reset. Keep dimensions stable so answer and feedback states do not shift surrounding navigation.

- [ ] **Step 6: Apply the system to import, library, editor, and sharing**

Use full-width work areas and compact rows. Reserve framed panels for the question stage, repeated quiz items, dialogs, and import diagnostics. Keep editor density professional and avoid card-inside-card composition.

- [ ] **Step 7: Run accessibility and visual verification**

Run: `node --test tests/e2e/visual-accessibility.test.mjs`

Expected: landmarks, keyboard paths, focus, and viewport overflow checks pass. Save screenshots for the four major routes at desktop and mobile widths and inspect for overlap or clipping.

- [ ] **Step 8: Commit the redesign**

```bash
git add index.html style.css styles js/ui tests/e2e/visual-accessibility.test.mjs
git commit -m "feat: apply fluid Academic Performance interface"
```

---

### Task 9: Deliver The Prompt Supremo In The Repository And App

**Files:**
- Create: `PROMPT-SUPREMO-MEDUP.md`
- Create: `js/prompt-supremo.js`
- Modify: `js/ui/views/import-view.js`
- Create: `tests/unit/prompt-supremo.test.js`
- Create: `tests/e2e/prompt-copy.test.mjs`

**Interfaces:**
- Consumes: the approved canonical Docs format.
- Produces: `PROMPT_SUPREMO` string and a copy/download workflow.

- [ ] **Step 1: Write failing prompt contract tests**

```js
test("Prompt Supremo contains every canonical contract marker", async () => {
  const prompt = await readFile("PROMPT-SUPREMO-MEDUP.md", "utf8");
  for (const marker of ["[N]", "=== INICIO DA QUESTAO ===", "Alternativa A:", "Resposta correta:", "Justificativa D:", "Fonte no material:", "=== FIM DA QUESTAO ==="]) {
    assert.ok(prompt.includes(marker), `missing ${marker}`);
  }
  assert.match(prompt, /exclusivamente.*materiais/i);
  assert.match(prompt, /não invente|nao invente/i);
});
```

- [ ] **Step 2: Run the prompt contract test and confirm failure**

Run: `node --test tests/unit/prompt-supremo.test.js`

Expected: FAIL because the prompt file does not exist.

- [ ] **Step 3: Write the copy-ready Prompt Supremo**

Include role, exclusive grounding, configurable count, 70-80% clinical vignettes, 20-30% applied concepts, topic analysis, balanced answer positions without a visible sequence, plausible distractors, individual feedback, difficulty, take-home, key point, source reference, insufficiency handling, and the exact canonical template. Instruct NotebookLM to emit no tables and no content outside the requested introductory summary and question blocks.

- [ ] **Step 4: Export the exact prompt string for the UI**

`js/prompt-supremo.js` exports `PROMPT_SUPREMO` with byte-for-byte equivalent content. Add a test that strips Markdown title fencing from the document and compares the remaining prompt with the exported string.

- [ ] **Step 5: Add copy and download actions**

The import view opens the prompt in a readable dialog with `Copiar prompt` and `Baixar .md`. Clipboard success uses an inline notice and returns focus to the trigger after closing.

- [ ] **Step 6: Run unit and browser prompt tests**

Run: `npm test && node --test tests/e2e/prompt-copy.test.mjs`

Expected: contract/equivalence tests pass and the clipboard receives the exact prompt.

- [ ] **Step 7: Commit the Prompt Supremo**

```bash
git add PROMPT-SUPREMO-MEDUP.md js/prompt-supremo.js js/ui/views/import-view.js tests/unit/prompt-supremo.test.js tests/e2e/prompt-copy.test.mjs
git commit -m "docs: add MedUp Prompt Supremo workflow"
```

---

### Task 10: Complete Regression, Offline, And Responsive Verification

**Files:**
- Create: `tests/e2e/medup.test.mjs`
- Create: `tests/e2e/offline.test.mjs`
- Create: `README.md`
- Create: `.gitignore`
- Remove: obsolete sample-only generated export if it no longer matches schema: `documento-sem-titulo-52-site.html`

**Interfaces:**
- Consumes: the complete MedUp V2 application.
- Produces: a documented, tested, deployable static site and final user handoff.

- [ ] **Step 1: Add the end-to-end regression suite**

Cover canonical paste, legacy paste, PDF upload, import review, local save/reload, study answer/clear/finalize/reset, editing, JSON export, small-link open, long-link fallback, standalone HTML, and Prompt Supremo copy.

- [ ] **Step 2: Add offline runtime verification**

Load the app once, block all requests whose host is not `127.0.0.1`, reload, import a text fixture, load a PDF fixture, complete one question, and generate standalone HTML. Assert zero failed external-runtime requests and no console errors.

- [ ] **Step 3: Run the complete verification suite**

Run: `npm test && npm run test:e2e`

Expected: all unit and browser tests pass with zero unexpected console errors.

- [ ] **Step 4: Inspect responsive screenshots**

Capture import, review, library, study, editor, sharing, and final-review views at 390x844 and 1440x1000. Check each screenshot for blank regions, clipped controls, horizontal overflow, text overlap, inconsistent radii, and illegible contrast. Correct any failure and rerun the relevant screenshot.

- [ ] **Step 5: Update repository documentation**

Document local serving, supported import formats, privacy, Google Docs workflow, link-size fallback, standalone HTML, tests, and deployment. Add `.superpowers/`, `node_modules/`, and test artifacts to `.gitignore`.

- [ ] **Step 6: Remove obsolete generated artifacts only after parity verification**

Compare the generated V2 standalone HTML with the existing sample export. Remove `documento-sem-titulo-52-site.html` only when the current sample can be regenerated and passes the standalone tests; otherwise migrate and retain it as a fixture.

- [ ] **Step 7: Run final repository checks**

Run: `npm test && npm run test:e2e && git status --short && git diff --check`

Expected: tests pass, no whitespace errors, and status lists only intentional implementation files.

- [ ] **Step 8: Commit the verified release**

```bash
git add README.md .gitignore tests index.html app.js parser.js style.css styles js vendor package.json package-lock.json PROMPT-SUPREMO-MEDUP.md
git add -u
git commit -m "feat: complete MedUp V2 offline question workspace"
```
