import test from "node:test";
import assert from "node:assert/strict";

import { importQuiz } from "../../js/import/pipeline.js";

test("returns a blocked empty quiz for an unknown format", () => {
  const source = "Resumo livre sem questões estruturadas.";
  const result = importQuiz(source);

  assert.equal(result.detectedFormat, "unknown");
  assert.equal(result.quiz.questions.length, 0);
  assert.equal(result.sourceText, source);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].status, "blocked");
  assert.match(result.diagnostics[0].messages[0], /reconhecer o formato/i);
});

test("honors a manual format override and preserves the original source", () => {
  const source = "1) Pergunta?\r\nA) Sim\r\nB) Não\r\nResposta: A";
  const result = importQuiz(source, { format: "generic" });

  assert.equal(result.detectedFormat, "generic");
  assert.equal(result.confidence, 1);
  assert.equal(result.sourceText, source);
  assert.equal(result.quiz.questions[0].correctOption, "A");
});

test("keeps the QuizParser facade synchronous", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    await import(`../../parser.js?facade-test=${Date.now()}`);
    const quiz = globalThis.window.QuizParser.parse(
      "1. Pergunta?\nA) Sim\nB) Não\nResposta: A"
    );

    assert.equal(quiz.questions.length, 1);
    assert.equal(quiz.questions[0].correctOption, "A");
    assert.equal(typeof globalThis.window.QuizParser.extractTextFromPDF, "function");
  } finally {
    globalThis.window = previousWindow;
  }
});
