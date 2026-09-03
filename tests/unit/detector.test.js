import test from "node:test";
import assert from "node:assert/strict";
import { detectFormat } from "../../js/import/detector.js";

test("prefers canonical markers over surrounding prose", () => {
  const result = detectFormat("Resumo do NotebookLM\n=== INICIO DA QUESTAO ===\nNumero: 1\n=== FIM DA QUESTAO ===");

  assert.equal(result.format, "medup-docs");
  assert.ok(result.confidence >= 0.9);
  assert.ok(result.reasons.some((reason) => reason.includes("marcadores canônicos")));
});

test("recognizes raw and fenced JSON quiz shapes", () => {
  const raw = detectFormat('{"version":2,"questions":[]}');
  const fenced = detectFormat("Texto introdutório\n```json\n{\"questions\": [}\n```");

  assert.equal(raw.format, "json");
  assert.ok(raw.confidence >= 0.9);
  assert.equal(fenced.format, "json");
  assert.ok(fenced.reasons.some((reason) => reason.includes("bloco JSON")));
});

test("recognizes the legacy split answer key", () => {
  const result = detectFormat("Questão 1 — Tema | Clínica\nA) Um\nB) Dois\nGABARITO E FEEDBACK DETALHADO\nQuestão 1 — Resposta correta: B");

  assert.equal(result.format, "legacy");
  assert.ok(result.confidence >= 0.8);
});

test("recognizes generic numbered questions after stronger formats", () => {
  const result = detectFormat("## Questão 1\nEnunciado\nA. Um\nB. Dois\nResposta: A");

  assert.equal(result.format, "generic");
  assert.ok(result.confidence >= 0.45);
});

test("recognizes a generic numbered question with inline prompt text", () => {
  const result = detectFormat("1. Qual é a conduta?\nA) Uma\nB) Outra\nResposta: A");

  assert.equal(result.format, "generic");
});

test("returns unknown below the confidence threshold", () => {
  const result = detectFormat("Resumo livre sem questões estruturadas.");

  assert.equal(result.format, "unknown");
  assert.ok(result.confidence < 0.45);
  assert.ok(Array.isArray(result.reasons));
});
