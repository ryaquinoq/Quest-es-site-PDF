const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

const WRAPPED_LABELS = [
  [/^(Alternativa|Justificativa)(?: |\n)([A-E])\n?:/gim, "$1 $2:"],
  [/^Resposta(?: |\n)correta\n?:/gim, "Resposta correta:"],
  [/^Take(?: |\n)home(?: |\n)message\n?:/gim, "Take home message:"],
  [/^Ponto(?:-| |\n|-\n)chave\n?:/gim, "Ponto-chave:"],
  [/^Fonte(?: |\n)no(?: |\n)material\n?:/gim, "Fonte no material:"],
  [/^(N[uú]mero|Tema|Tipo|Dificuldade|Enunciado)\n?:/gim, "$1:"],
];

const FIELD_LABEL = /^(N[uú]mero|Tema|Tipo|Dificuldade|Enunciado|Alternativa [A-E]|Resposta correta|Justificativa [A-E]|Take home message|Ponto-chave|Fonte no material) *: */gim;

export function normalizeSource(text, options = {}) {
  const pageBreakToken = options.pageBreakToken == null
    ? ""
    : String(options.pageBreakToken).trim();

  let normalized = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, () => pageBreakToken ? `\n${pageBreakToken}\n` : "\n\n")
    .replace(UNICODE_SPACES, " ")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, "\"")
    .replace(/\u2026/g, "...")
    .replace(/[^\S\n]+/g, " ")
    .replace(/^ +| +$/gm, "");

  for (const [pattern, replacement] of WRAPPED_LABELS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(FIELD_LABEL, "$1: ")
    .replace(/^([A-E])\s*\.\s*/gim, "$1. ")
    .replace(/^([A-E])\s*\)\s*/gim, "$1) ")
    .replace(/^([A-E])[ \t]*[-\u2013\u2014][ \t]*/gim, "$1 - ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^ +| +$/gm, "")
    .trim();

  return normalized;
}
