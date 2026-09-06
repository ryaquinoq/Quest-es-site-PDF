import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PROMPT_SUPREMO } from "../../js/prompt-supremo.js";
import { importQuiz } from "../../js/import/pipeline.js";
test("short prompt and download stay synchronized", async () => {
 const doc = await readFile(new URL("../../PROMPT-SUPREMO-MEDUP.md", import.meta.url), "utf8");
 assert.ok(doc.includes(PROMPT_SUPREMO));
 assert.ok(PROMPT_SUPREMO.length < 2000);
});
test("NotebookLM bold Markdown and PDF page boundaries import with feedback", () => {
 const text = "## **Questão 1**\nQual alternativa?\n- **A)** Primeira\n- **B)** Segunda\n<<< MEDUP_PAGE_BREAK:1 >>>\n**Resposta correta:** B\n**Justificativa A:** Errada\n**Justificativa B:** Certa\nFonte: Aula\nTake home message: Revisar";
 const result = importQuiz(text);
 assert.equal(result.quiz.questions.length, 1);
 assert.notEqual(result.diagnostics[0].status, "blocked");
 assert.equal(result.quiz.questions[0].correctOption, "B");
 assert.equal(result.quiz.questions[0].feedback.A, "Errada");
});
