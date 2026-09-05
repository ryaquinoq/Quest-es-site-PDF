import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PROMPT_DOCUMENT_URL = new URL("../../PROMPT-SUPREMO-MEDUP.md", import.meta.url);

async function readPromptDocument() {
  return readFile(PROMPT_DOCUMENT_URL, "utf8");
}

function extractCopyReadyPrompt(document) {
  const match = document.match(/^# Prompt Supremo MedUp\r?\n\r?\n```text\r?\n([\s\S]*?)\r?\n```\s*$/u);
  assert.ok(match, "the document must contain only its title and one copy-ready text fence");
  return match[1];
}

test("Prompt Supremo contains every canonical question marker", async () => {
  const prompt = await readPromptDocument();
  const markers = [
    "[N]",
    "=== INICIO DA QUESTAO ===",
    "Numero: [número sequencial]",
    "Tema:",
    "Tipo:",
    "Dificuldade:",
    "Enunciado:",
    "Alternativa A:",
    "Alternativa B:",
    "Alternativa C:",
    "Alternativa D:",
    "Resposta correta:",
    "Justificativa A:",
    "Justificativa B:",
    "Justificativa C:",
    "Justificativa D:",
    "Take home message:",
    "Ponto-chave:",
    "Fonte no material:",
    "=== FIM DA QUESTAO ==="
  ];

  for (const marker of markers) {
    assert.ok(prompt.includes(marker), `missing canonical marker: ${marker}`);
  }
});

test("Prompt Supremo enforces exclusive grounding and source insufficiency handling", async () => {
  const prompt = await readPromptDocument();

  assert.match(prompt, /exclusivamente nos materiais fornecidos/iu);
  assert.match(prompt, /não invente/iu);
  assert.match(prompt, /material(?: fornecido)? (?:for|é )?insuficiente/iu);
  assert.match(prompt, /não gere questões/iu);
  assert.match(prompt, /Fonte no material:[^\n]*(?:página|seção|título)/iu);
});

test("Prompt Supremo specifies the complete medical question-generation contract", async () => {
  const prompt = await readPromptDocument();

  assert.match(prompt, /quantidade[^\n]*\[N\]/iu);
  assert.match(prompt, /70% a 80%[^\n]*vinhetas clínicas/iu);
  assert.match(prompt, /20% a 30%[^\n]*conceitos aplicados/iu);
  assert.match(prompt, /analise[^\n]*temas/iu);
  assert.match(prompt, /posições[^\n]*A, B, C e D[^\n]*equilibrada/iu);
  assert.match(prompt, /sem sequência visível|sem padrão previsível/iu);
  assert.match(prompt, /uma única alternativa[^\n]*inequivocamente correta/iu);
  assert.match(prompt, /distratores[^\n]*plausíveis/iu);
  assert.match(prompt, /justificativa individual/iu);
  assert.match(prompt, /Básica[^\n]*Intermediária[^\n]*Avançada/iu);
  assert.match(prompt, /Take home message/iu);
  assert.match(prompt, /Ponto-chave/iu);
  assert.match(prompt, /sem tabelas/iu);
  assert.match(prompt, /nenhum conteúdo fora/iu);
});

test("Prompt Supremo uses unambiguous placeholders for partial output and distribution", async () => {
  const prompt = await readPromptDocument();

  assert.doesNotMatch(prompt, /\[X\]/u);
  assert.match(prompt, /geradas \[QTD_GERADA\]/u);
  assert.match(prompt, /Distribuição: \[PCT_CLINICA\]% clínica, \[PCT_CONCEITO\]% conceito aplicado/u);
});

test("Prompt Supremo recalculates partial-output constraints over QTD_GERADA instead of N", async () => {
  const prompt = await readPromptDocument();

  assert.match(
    prompt,
    /insuficiência parcial[^\n]*proporções[^\n]*percentuais informados[^\n]*balanceamento das respostas[^\n]*\[QTD_GERADA\][^\n]*não (?:sobre|em relação a) \[N\]/iu
  );
});

test("exported PROMPT_SUPREMO is byte-for-byte equivalent to the copy-ready block", async () => {
  const document = await readPromptDocument();
  const { PROMPT_SUPREMO } = await import("../../js/prompt-supremo.js");

  assert.equal(PROMPT_SUPREMO, extractCopyReadyPrompt(document));
});
