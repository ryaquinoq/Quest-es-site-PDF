import { quizTitle } from './quiz-title.js';
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

function boundedInteger(value, minimum, maximum) {
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : minimum;
  return Math.min(Math.max(number, minimum), maximum);
}

function isoTimestamp(value) {
  const text = typeof value === "string" ? value : "";
  return /^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(Date.parse(text))
    ? text
    : "";
}

function existingUniqueIds(value, questionIds) {
  const seen = new Set();
  return toList(value).map(id => String(id)).filter(id => {
    if (!questionIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function createProgress(input = {}, questions = []) {
  const source = input && typeof input === "object" ? input : {};
  const rawAnswers = source.answers && typeof source.answers === "object"
    ? source.answers
    : {};
  const answers = {};

  for (const question of questions) {
    const answer = normalizeLabel(rawAnswers[question.id]);
    if (question.options.some(option => option.label === answer)) {
      answers[question.id] = answer;
    }
  }

  const answerEntries = Object.entries(answers);
  const hasAnswerMap = Object.keys(rawAnswers).length > 0;
  const answered = hasAnswerMap
    ? answerEntries.length
    : boundedInteger(source.answered, 0, questions.length);
  const correct = hasAnswerMap
    ? answerEntries.filter(([id, answer]) => (
      questions.find(question => question.id === id)?.correctOption === answer
    )).length
    : boundedInteger(source.correct, 0, answered);

  return {
    answers,
    answered,
    correct,
    finalized: Boolean(source.finalized),
    selectedQuestion: boundedInteger(source.selectedQuestion, 0, Math.max(questions.length - 1, 0))
  };
}

export function createStudy(input = {}, questions = []) {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
  const questionIds = new Set(questions.map(question => question.id));
  const reviewSource = source.errorReview;
  let errorReview = null;

  if (reviewSource && typeof reviewSource === "object" && !Array.isArray(reviewSource)) {
    const reviewQuestionIds = existingUniqueIds(reviewSource.questionIds, questionIds);
    const reviewIdSet = new Set(reviewQuestionIds);
    const rawAnswers = reviewSource.answers && typeof reviewSource.answers === "object"
      && !Array.isArray(reviewSource.answers)
      ? reviewSource.answers
      : {};
    const answers = {};

    for (const question of questions) {
      if (!reviewIdSet.has(question.id)) continue;
      const answer = normalizeLabel(rawAnswers[question.id]);
      if (question.options.some(option => option.label === answer)) {
        answers[question.id] = answer;
      }
    }

    errorReview = {
      questionIds: reviewQuestionIds,
      answers,
      selectedQuestion: boundedInteger(
        reviewSource.selectedQuestion,
        0,
        Math.max(reviewQuestionIds.length - 1, 0)
      ),
      finalized: Boolean(reviewSource.finalized),
      updatedAt: isoTimestamp(reviewSource.updatedAt)
    };
  }

  return {
    lastStudiedAt: isoTimestamp(source.lastStudiedAt),
    bookmarkedQuestionIds: existingUniqueIds(source.bookmarkedQuestionIds, questionIds),
    doubtQuestionIds: existingUniqueIds(source.doubtQuestionIds, questionIds),
    errorReview
  };
}

export function ensureUniqueQuestionIds(questions = []) {
  const usedIds = new Set();

  return questions.map((question, index) => {
    const fallbackId = `q-${question?.number || index + 1}`;
    const baseId = String(question?.id || fallbackId).trim() || fallbackId;
    let id = baseId;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return { ...question, id };
  });
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
    id: String(source.id || `q-${number}`).trim(),
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
  const questions = Array.isArray(input.questions)
    ? ensureUniqueQuestionIds(input.questions.map(createQuestion))
    : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    id: String(input.id || crypto.randomUUID()),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    sourceName: String(input.sourceName || ""),
    title: quizTitle(input.title || input.metadata?.title || "Simulado sem título", input.questions || []),
    introduction: String(input.introduction || input.metadata?.intro || "").trim(),
    themes: toList(input.themes || input.metadata?.themes),
    distribution: toList(input.distribution || input.metadata?.distribution),
    questions,
    progress: createProgress(input.progress, questions),
    study: createStudy(input.study, questions)
  };
}

export function migrateQuiz(input) {
  return createQuiz(input);
}
