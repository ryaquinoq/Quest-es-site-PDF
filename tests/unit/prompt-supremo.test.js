import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PROMPT_SUPREMO } from "../../js/prompt-supremo.js";
import { importQuiz } from "../../js/import/pipeline.js";
test("short prompt and download stay synchronized", async () => {
 const doc = await readFile(new URL("../../PROMPT-SUPREMO-MEDUP.md", import.meta.url), "utf8");
 assert.ok(doc.includes(PROMPT_SUPREMO));
 assert.ok(PROMPT_SUPREMO.length < 3000);
});
test("original split answer format keeps all feedback and source", () => {
 const result = importQuiz(`Temas: Cardiologia
Questão 1 — Tema | Clínica
Qual alternativa responde ao caso?
A) Primeira
B) Segunda
C) Terceira
D) Quarta
GABARITO E FEEDBACK DETALHADO:
Questão 1 — Resposta correta: B
Por que B está correta:
Fundamento correto.
Por que as demais estão incorretas:
A) Erro A.
C) Erro C.
D) Erro D.
Ponto-chave para revisão:
Regra essencial.
Take home message:
Aprendizado.
Fonte no material:
Aula, seção 2.`);
 const question = result.quiz.questions[0];
 assert.notEqual(result.diagnostics[0].status, "blocked");
 assert.equal(question.correctOption, "B");
 assert.equal(question.feedback.A, "Erro A.");
 assert.equal(question.feedback.B, "Fundamento correto.");
 assert.equal(question.feedback.C, "Erro C.");
 assert.equal(question.feedback.D, "Erro D.");
 assert.equal(question.takeHome, "Aprendizado.");
 assert.equal(question.sourceReference, "Aula, seção 2.");
});
test("NotebookLM bold Markdown and PDF page boundaries import with feedback", () => {
 const text = "## **Questão 1**\nQual alternativa?\n- **A)** Primeira\n- **B)** Segunda\n<<< MEDUP_PAGE_BREAK:1 >>>\n**Resposta correta:** B\n**Justificativa A:** Errada\n**Justificativa B:** Certa\nFonte: Aula\nTake home message: Revisar";
 const result = importQuiz(text);
 assert.equal(result.quiz.questions.length, 1);
 assert.notEqual(result.diagnostics[0].status, "blocked");
 assert.equal(result.quiz.questions[0].correctOption, "B");
 assert.equal(result.quiz.questions[0].feedback.A, "Errada");
});
test("compact paragraphs retain answers and four explanations", () => {
 const result = importQuiz('Questão 1 Qual a resposta? A) Um B) Dois C) Três D) Quatro Resposta correta: B Justificativa A: Erro A. Justificativa B: Correta. Justificativa C: Erro C. Justificativa D: Erro D. Fonte: Aula. Take home message: Resumo.');
 assert.equal(result.quiz.questions.length, 1);
 assert.equal(result.quiz.questions[0].options.length, 4);
 assert.equal(result.quiz.questions[0].correctOption, 'B');
 assert.equal(result.quiz.questions[0].feedback.D, 'Erro D.');
 assert.notEqual(result.diagnostics[0].status, 'blocked');
});
