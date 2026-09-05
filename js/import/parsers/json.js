import { migrateQuiz } from "../../core/quiz-schema.js";

const INLINE_FEEDBACK_MARKER = /(?:^|[^\S\n]+)([A-E])\)\s*/giu;

function normalizeLabel(value) {
  return String(value || "").trim().toUpperCase();
}

function questionOptionLabels(question) {
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => option?.label)
    : Object.keys(question?.options || {});
  return new Set(options.map(normalizeLabel).filter(Boolean));
}

function splitOptionFeedback(value, implicitLabel = "") {
  const source = String(value || "").trim();
  if (!source) return {};

  const markers = [];
  let match;

  INLINE_FEEDBACK_MARKER.lastIndex = 0;
  while ((match = INLINE_FEEDBACK_MARKER.exec(source)) !== null) {
    markers.push({
      label: match[1].toUpperCase(),
      index: match.index,
      valueStart: INLINE_FEEDBACK_MARKER.lastIndex
    });
  }

  if (markers.length === 0) {
    return implicitLabel ? { [implicitLabel]: source } : {};
  }

  const recovered = {};
  const leadingText = source.slice(0, markers[0].index).trim();
  if (implicitLabel && leadingText) recovered[implicitLabel] = leadingText;

  for (const [index, marker] of markers.entries()) {
    const feedback = source.slice(
      marker.valueStart,
      markers[index + 1]?.index ?? source.length
    ).trim();
    if (feedback) recovered[marker.label] = feedback;
  }

  return recovered;
}

function recoverLegacyQuestion(question) {
  if (!question || typeof question !== "object") return question;

  const feedback = question.feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) return question;

  const validLabels = questionOptionLabels(question);
  const recovered = splitOptionFeedback(feedback.incorrectReason);
  const explicit = feedback.optionFeedback;

  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
    for (const [label, value] of Object.entries(explicit)) {
      Object.assign(recovered, splitOptionFeedback(value, normalizeLabel(label)));
    }
  }

  const optionFeedback = Object.fromEntries(
    Object.entries(recovered).filter(([label]) => validLabels.has(label))
  );

  return {
    ...question,
    feedback: { ...feedback, optionFeedback }
  };
}

function recoverLegacyFeedback(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.questions)) return input;
  return { ...input, questions: input.questions.map(recoverLegacyQuestion) };
}

export function parse(text) {
  const source = String(text ?? "").trim();
  const fenced = source.match(/```json\s*([\s\S]*?)```/iu);
  const json = fenced ? fenced[1].trim() : source;
  return migrateQuiz(recoverLegacyFeedback(JSON.parse(json)));
}
