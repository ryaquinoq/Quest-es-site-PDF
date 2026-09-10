import test from "node:test";
import assert from "node:assert/strict";
import { importQuiz } from "../../js/import/pipeline.js";
import { expandCompactQuestions } from "../../js/import/normalizer.js";

const prompt = "Na avaliação (ABCDE), a via aérea (A) é examinada. Qual etapa vem depois?";
const key = `GABARITO E FEEDBACK DETALHADO:
Questão 1 — Resposta correta: B
Por que B está correta:
Motivo B.
Por que as demais estão incorretas:
A) Motivo A.
C) Motivo C.
D) Motivo D.`;

for (const separator of ["\n", " "]) {
  test(`parenthetical letters remain in the prompt with ${JSON.stringify(separator)} options`, () => {
    const source = `Questão 1 — Tema | Conceito\n${prompt}\n${["A) Primeiro (A) e outro detalhe.", "B) Segundo (B) e outro detalhe.", "C) Terceiro", "D) Quarto"].join(separator)}\n${key}`;
    const result = importQuiz(source);
    assert.equal(result.quiz.questions.length, 1);
    const q = result.quiz.questions[0];
    assert.equal(q.prompt, prompt);
    assert.deepEqual(q.options.map(o => o.label), ["A", "B", "C", "D"]);
    assert.equal(q.options[0].text, "Primeiro (A) e outro detalhe.");
    assert.equal(q.correctOption, "B");
    assert.notEqual(result.diagnostics[0].status, "blocked");
  });
}
test("compact normalization preserves parenthetical prose", () => {
  assert.equal(expandCompactQuestions(prompt), prompt);
});
test("parenthesized option labels at line starts remain supported", () => {
  const result = importQuiz(`Questão 1 — Tema | Conceito\n${prompt}\n(A) Primeiro\n(B) Segundo\n(C) Terceiro\n(D) Quarto\n${key}`);
  assert.equal(result.quiz.questions[0].prompt, prompt);
  assert.equal(result.quiz.questions[0].options.length, 4);
});
