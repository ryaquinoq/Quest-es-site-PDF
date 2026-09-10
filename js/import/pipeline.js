import { createQuiz } from "../core/quiz-schema.js";
import { detectFormat } from "./detector.js";
import { normalizeSource, expandCompactQuestions } from "./normalizer.js";
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
  const rawDetection = detectFormat(sourceText);
  const normalized = rawDetection.format === "json" ? sourceText : normalizeSource(sourceText);
  const detection = options.format
    ? { format: options.format, confidence: 1, reasons: ["manual"] }
    : detectFormat(normalized);
  const adapter = adapters[detection.format];
  let best;
  if (!options.format && detection.format !== "json") {
    // A separate, numbered answer key is stronger evidence than option counts.
    const splitKey = detection.format === "legacy" && /^(?:Quest[aã]o|Resposta)[ \t]+\d+[^\n]*(?:Resposta correta|Correta)[ \t]*:|^Resposta[ \t]+\d+[ \t]*$/imu.test(normalized);
    if (splitKey) {
      for (const variant of new Set([normalized, expandCompactQuestions(normalized)])) {
        const parsed = parseLegacy(variant);
        const result = validateQuiz(parsed);
        const blocked = result.diagnostics.filter(item => item.status === "blocked").length;
        const score = result.quiz.questions.length * 100 - blocked * 200;
        if (parsed.questions.length && (!best || score > best.score)) best = { result, score, format: "legacy" };
      }
      if (best) return { ...best.result, detectedFormat: "legacy", confidence: detection.confidence, sourceText };
    }
    for (const variant of new Set([normalized, expandCompactQuestions(normalized)])) {
    for (const [format, candidate] of Object.entries(adapters)) {
      if (format === "json") continue;
      const result = validateQuiz(candidate.parse(variant));
      const usable = result.diagnostics.filter(item => item.status !== "blocked").length;
      const usableRatio = result.quiz.questions.length ? usable / result.quiz.questions.length : 0;
      const completeness = result.quiz.questions.reduce((total, q) => total + q.options.length + q.options.filter(o => q.feedback[o.label]).length, 0);
      const blocked = result.diagnostics.length - usable;
      const score = usable * 1000 - blocked * 200 + completeness + (format === detection.format ? 10 : 0);
      if (!best || score > best.score) best = { result, score, format, confidence: usableRatio };
    }
    }
    if (best?.score > 0) return {
      ...best.result, detectedFormat: best.format, confidence: best.format === detection.format ? detection.confidence : best.confidence, sourceText
    };
  }

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
