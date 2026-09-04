export const SCHEMA_VERSION = 2;

const OPTION_LABELS = ["A", "B", "C", "D", "E"];

function toList(value) {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeLabel(value) {
  return String(value || "").trim().toUpperCase();
}

function feedbackByLabel(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([label, feedback]) => [normalizeLabel(label), feedback])
  );
}

export function createQuestion(input = {}, index = 0) {
  const source = input && typeof input === "object" ? input : {};
  const rawOptions = Array.isArray(source.options)
    ? source.options
    : Object.entries(source.options || {}).map(([label, text]) => ({ label, text }));
  const options = rawOptions.map((option = {}, optionIndex) => {
    const label = normalizeLabel(option.label);
    return {
      label: label || OPTION_LABELS[optionIndex] || "",
      text: String(option.text || "").trim()
    };
  });
  const number = Number(source.number || index + 1);
  const correctOption = String(
    source.correctOption || source.feedback?.correctOption || ""
  ).trim().toUpperCase();
  const directFeedback = feedbackByLabel(source.feedback);
  const optionFeedback = feedbackByLabel(source.feedback?.optionFeedback);

  return {
    id: String(source.id || `q-${number}`),
    number,
    topic: String(source.topic || "Sem tema").trim(),
    type: String(source.type || "Clínica").trim(),
    difficulty: String(source.difficulty || "Não informada").trim(),
    prompt: String(source.prompt || "").trim(),
    options,
    correctOption,
    feedback: Object.fromEntries(options.map(({ label }) => [
      label,
      String(
        directFeedback[label] ||
        optionFeedback[label] ||
        (label === correctOption ? source.feedback?.correctReason : "") ||
        ""
      ).trim()
    ])),
    takeHome: String(source.takeHome || "").trim(),
    keyPoint: String(source.keyPoint || source.feedback?.keyPoint || "").trim(),
    sourceReference: String(source.sourceReference || "").trim()
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
