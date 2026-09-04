import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { importQuiz } from "../../js/import/pipeline.js";
import { parse as parseGeneric } from "../../js/import/parsers/generic.js";
import { parse as parseJson } from "../../js/import/parsers/json.js";

test("imports canonical Google Docs questions", async () => {
  const source = await readFile("tests/fixtures/medup-docs.txt", "utf8");
  const result = importQuiz(source);

  assert.equal(result.detectedFormat, "medup-docs");
  assert.equal(result.quiz.questions.length, 2);
  assert.equal(result.quiz.questions[0].correctOption, "B");
  assert.equal(result.quiz.questions[0].feedback.C.length > 0, true);
});

test("keeps current prompt compatibility and all option feedback", async () => {
  const source = await readFile("tests/fixtures/legacy-current-prompt.txt", "utf8");
  const result = importQuiz(source);

  assert.equal(result.detectedFormat, "legacy");
  assert.equal(result.quiz.questions.length, 2);
  assert.deepEqual(Object.keys(result.quiz.questions[0].feedback), ["A", "B", "C", "D"]);
  assert.equal(
    Object.values(result.quiz.questions[0].feedback).every((feedback) => feedback.length > 0),
    true
  );
  assert.equal(result.diagnostics.some((item) => item.status === "blocked"), false);
});

test("imports raw and fenced JSON through schema migration", async () => {
  const source = await readFile("tests/fixtures/current-sample.json", "utf8");
  const raw = parseJson(source);
  const fenced = parseJson(`Texto antes\n\`\`\`json\n${source}\n\`\`\`\nTexto depois`);

  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.questions.length, 10);
  assert.equal(fenced.questions.length, 10);
  assert.equal(fenced.questions[0].correctOption, "B");
});

test("imports generic Markdown questions and inline answers", async () => {
  const source = await readFile("tests/fixtures/generic-markdown.txt", "utf8");
  const result = importQuiz(source);

  assert.equal(result.detectedFormat, "generic");
  assert.equal(result.quiz.questions.length, 2);
  assert.equal(result.quiz.questions[0].prompt, "Qual método registra a pressão arterial durante as atividades habituais?");
  assert.deepEqual(result.quiz.questions[0].options.map(({ label }) => label), ["A", "B", "C", "D"]);
  assert.deepEqual(result.quiz.questions.map(({ correctOption }) => correctOption), ["A", "C"]);
  assert.match(result.quiz.questions[1].feedback.C, /estado mental/i);
});

test("accepts generic heading, option, and final answer-key variants", () => {
  const parsed = parseGeneric(`
# Revisão
1) Primeira pergunta?
Alternativa A: Primeira opção
Alternativa B: Segunda opção

## 2. Segunda pergunta?
A) Opção A
B - Opção B

GABARITO
1. B
2) A
  `);

  assert.equal(parsed.questions.length, 2);
  assert.deepEqual(parsed.questions.map(({ correctOption }) => correctOption), ["B", "A"]);
  assert.deepEqual(parsed.questions[0].options, [
    { label: "A", text: "Primeira opção" },
    { label: "B", text: "Segunda opção" }
  ]);
});

test("recovers valid canonical questions while blocking malformed ones", async () => {
  const source = await readFile("tests/fixtures/malformed.txt", "utf8");
  const result = importQuiz(source);

  assert.equal(result.quiz.questions.length, 2);
  assert.deepEqual(result.diagnostics.map(({ status }) => status), ["ready", "blocked"]);
  assert.equal(result.quiz.questions[0].correctOption, "A");
  assert.equal(result.quiz.questions[1].correctOption, "");
});

test("tokenizes compressed legacy option feedback", () => {
  const result = importQuiz(`
Questao 1 – Neurologia | Conceito
Qual opção está correta?
🔹 A) Opção A
🔹 B) Opção B
🔹 C) Opção C
🔹 D) Opção D
🔹 E) Opção E

GABARITO E FEEDBACK DETALHADO
Questao 1 – Resposta correta: B
Por que B está CORRETA: Razão correta. Por que as demais estão INCORRETAS: A) Razão A. C) Razão C. D) Razão D. E) Razão E.
Ponto-chave: Revisar o conceito.
  `);

  assert.equal(result.quiz.questions[0].options.length, 5);
  assert.deepEqual(result.quiz.questions[0].feedback, {
    A: "Razão A.",
    B: "Razão correta.",
    C: "Razão C.",
    D: "Razão D.",
    E: "Razão E."
  });
});
