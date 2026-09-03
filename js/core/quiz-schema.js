export const SCHEMA_VERSION = 2;

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

function toList(value) {
  return Array.isArray(value) ? [...value] : [];
}

export function createQuestion(input = {}, index = 0) {
  const rawOptions = Array.isArray(input.options)
    ? input.options
    : Object.entries(input.options || {}).map(([label, text]) => ({ label, text }));
  const options = rawOptions.map((option = {}, optionIndex) => ({
    label: String(option.label || OPTION_LABELS[optionIndex] || "").toUpperCase(),
    text: String(option.text || "").trim()
  }));
  const number = Number(input.number || index + 1);
  const correctOption = String(
    input.correctOption || input.feedback?.correctOption || ""
  ).toUpperCase();

  return {
    id: String(input.id || `q-${number}`),
    number,
    topic: String(input.topic || "Sem tema").trim(),
    type: String(input.type || "Clínica").trim(),
    difficulty: String(input.difficulty || "Não informada").trim(),
    prompt: String(input.prompt || "").trim(),
    options,
    correctOption,
    feedback: Object.fromEntries(options.map(({ label }) => [
      label,
      String(
        input.feedback?.[label] ||
        input.feedback?.optionFeedback?.[label] ||
        (label === correctOption ? input.feedback?.correctReason : "") ||
        ""
      ).trim()
    ])),
    takeHome: String(input.takeHome || "").trim(),
    keyPoint: String(input.keyPoint || input.feedback?.keyPoint || "").trim(),
    sourceReference: String(input.sourceReference || "").trim()
  };
}

export function createQuiz(input = {}) {
  const now = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    id: String(input.id || crypto.randomUUID()),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    sourceName: String(input.sourceName || ""),
    title: String(input.title || input.metadata?.title || "Simulado sem título").trim(),
    introduction: String(input.introduction || input.metadata?.intro || "").trim(),
    themes: toList(input.themes || input.metadata?.themes),
    distribution: toList(input.distribution || input.metadata?.distribution),
    questions: Array.isArray(input.questions) ? input.questions.map(createQuestion) : []
  };
}

export function migrateQuiz(input) {
  return createQuiz(input);
}
