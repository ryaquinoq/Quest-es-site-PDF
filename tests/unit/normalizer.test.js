import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSource } from "../../js/import/normalizer.js";

test("normalizes Google Docs and PDF typography", () => {
  const input = "Questão\u00a01\r\nA .\u00a0 Opção\nResposta   correta :  a\n“Texto” com reticências…";
  const output = normalizeSource(input);

  assert.equal(output, "Questão 1\nA. Opção\nResposta correta: a\n\"Texto\" com reticências...");
});

test("keeps paragraph boundaries while joining wrapped field labels", () => {
  const output = normalizeSource("Alternativa\nA: Conduta\n\nEnunciado:\nCaso clínico");

  assert.equal(output, "Alternativa A: Conduta\n\nEnunciado:\nCaso clínico");
});

test("joins only recognized wrapped labels and leaves prose lines separate", () => {
  const input = "Resposta\ncorreta: B\nJustificativa\nB: Correta\nPrimeira linha\nsegunda linha";

  assert.equal(
    normalizeSource(input),
    "Resposta correta: B\nJustificativa B: Correta\nPrimeira linha\nsegunda linha",
  );
});

test("collapses excessive blank lines and preserves page boundaries with a token", () => {
  const input = "Página 1\n\n\n\n\fPágina 2";

  assert.equal(
    normalizeSource(input, { pageBreakToken: "=== PAGINA ===" }),
    "Página 1\n\n=== PAGINA ===\nPágina 2",
  );
});
