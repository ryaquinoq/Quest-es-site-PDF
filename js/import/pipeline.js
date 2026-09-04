import { createQuiz } from "../core/quiz-schema.js";
import { detectFormat } from "./detector.js";
import { normalizeSource } from "./normalizer.js";
import { parse as parseGeneric } from "./parsers/generic.js";
import { parse as parseJson } from "./parsers/json.js";
import { parse as parseLegacy } from "./parsers/legacy.js";
import { parse as parseMedupDocs } from "./parsers/medup-docs.js";
import { validateQuiz } from "./validator.js";

const adapters = {
  generic: { parse: parseGeneric },
  json: { parse: parseJson },
  legacy: { parse: parseLegacy },
  "medup-docs": { parse: parseMedupDocs }
};

export function importQuiz(rawText, options = {}) {
  const sourceText = String(rawText || "");
  const normalized = normalizeSource(sourceText);
  const detection = options.format
    ? { format: options.format, confidence: 1, reasons: ["manual"] }
    : detectFormat(normalized);
  const adapter = adapters[detection.format];

  if (!adapter) {
    return {
      quiz: createQuiz(),
      detectedFormat: "unknown",
      confidence: detection.confidence,
      diagnostics: [{
        questionNumber: null,
        status: "blocked",
        messages: ["Não foi possível reconhecer o formato das questões."]
      }],
      sourceText
    };
  }

  const parsed = adapter.parse(normalized);
  return {
    ...validateQuiz(parsed),
    detectedFormat: detection.format,
    confidence: detection.confidence,
    sourceText
  };
}
