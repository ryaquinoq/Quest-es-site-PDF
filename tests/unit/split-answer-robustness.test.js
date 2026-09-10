import test from "node:test";
import assert from "node:assert/strict";
import { importQuiz } from "../../js/import/pipeline.js";

const question = `Questão 1 — Interpretação | Clínica
Qual opção corresponde a 2,5 mg/dL e CD4+ < 200/mm³?
A) Primeira opção B) Segunda opção C) Terceira opção D) Quarta opção`;
const answer = `RESPOSTA 1
Correta: B
Justificativa A: Motivo A.
Justificativa B: Motivo B.
Justificativa C: Motivo C.
Justificativa D: Motivo D.
Ponto-chave: Regra essencial.
Take home message: Síntese.
Fonte: Documento, página 2.`;

for (const heading of ["GABARITO E FEEDBACK DETALHADO:", "Gabarito comentado", "Respostas e justificativas:", "Gabarito com justificativas:"]) {
  test(`preserves options and all comments with ${heading}`, () => {
    const result = importQuiz(`${question}\n\n## **${heading}**\n${answer}`);
    const q = result.quiz.questions[0];
    assert.equal(result.detectedFormat, "legacy");
    assert.equal(result.quiz.questions.length, 1);
    assert.equal(q.correctOption, "B");
    assert.deepEqual(q.options.map(o => o.text), ["Primeira opção", "Segunda opção", "Terceira opção", "Quarta opção"]);
    for (const label of ["A", "B", "C", "D"]) assert.equal(q.feedback[label], `Motivo ${label}.`);
    assert.match(q.prompt, /2,5 mg\/dL e CD4\+ < 200\/mm³/);
    assert.equal(q.keyPoint, "Regra essencial.");
    assert.equal(q.sourceReference, "Documento, página 2.");
  });
}
test("bare question heading does not consume the first prompt line", () => {
  const result = importQuiz(`${question.replace("Questão 1 — Interpretação | Clínica", "QUESTÃO 1")}\nGABARITO\n${answer}`);
  assert.match(result.quiz.questions[0].prompt, /^Qual opção/);
});
test("duplicate answer blocks cannot silently overwrite the correct answer", () => {
  const result = importQuiz(`${question}\nGABARITO\n${answer}\nRESPOSTA 1\nCorreta: C`);
  assert.equal(result.diagnostics[0].status, "blocked");
  assert.equal(result.quiz.questions[0].correctOption, "");
  assert.match(result.diagnostics[0].messages.join(" "), /Mais de um gabarito/);
});
test("truncated question remains blocked instead of using feedback as an option", () => {
  const result = importQuiz(`${question.replace(" D) Quarta opção", "")}\nGABARITO\n${answer}`);
  assert.equal(result.quiz.questions[0].options.length, 3);
  assert.equal(result.diagnostics[0].status, "blocked");
});
test("conflicting correct-reason letter is blocked", () => {
  const result = importQuiz(`${question}\nGABARITO\nQuestão 1 — Resposta correta: B\nPor que C está correta: Motivo.`);
  assert.equal(result.diagnostics[0].status, "blocked");
  assert.equal(result.quiz.questions[0].correctOption, "");
});
test("repeated question numbers require review", () => {
  const result = importQuiz(`${question}\n${question}\nGABARITO\n${answer}`);
  assert.equal(result.quiz.questions.length, 2);
  assert.ok(result.diagnostics.every(d => d.status === "blocked"));
});
