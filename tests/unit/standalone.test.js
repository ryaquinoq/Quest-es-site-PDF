import test from "node:test";
import assert from "node:assert/strict";

import { createQuiz } from "../../js/core/quiz-schema.js";
import { generateStandaloneHtml } from "../../js/share/standalone.js";

function standaloneQuiz(overrides = {}) {
  return createQuiz({
    id: "standalone-quiz",
    createdAt: "2026-09-03T12:00:00.000Z",
    updatedAt: "2026-09-03T12:00:00.000Z",
    title: "Emergências clínicas",
    introduction: "Responda e revise.",
    questions: [{
      prompt: "Qual é a conduta inicial?",
      options: { A: "Ação imediata", B: "Observação" },
      correctOption: "A",
      feedback: { A: "Conduta correta.", B: "Não é suficiente." },
      takeHome: "Priorize a estabilização."
    }],
    ...overrides
  });
}

test("standalone HTML embeds a complete offline study player", () => {
  const html = generateStandaloneHtml(standaloneQuiz());

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /Emergências clínicas/);
  assert.match(html, /data-schema-version="2"/);
  assert.match(html, /Qual é a conduta inicial\?/);
  assert.match(html, /Finalizar simulado/);
  assert.match(html, /Recomeçar/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:/i);
  assert.doesNotMatch(html, /editor-form|Editar Questões|contenteditable/i);
});

test("standalone HTML prevents embedded quiz data from closing its script", () => {
  const html = generateStandaloneHtml(standaloneQuiz({
    title: "Segurança </script><script>globalThis.compromised = true</script>"
  }));

  assert.match(html, /\\u003c\/script>/);
  assert.doesNotMatch(html, /<script>globalThis\.compromised/);
});
