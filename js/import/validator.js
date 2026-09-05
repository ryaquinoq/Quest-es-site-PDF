import { createQuiz, ensureUniqueQuestionIds } from "../core/quiz-schema.js";

const STATUS_PRIORITY = {
  ready: 0,
  attention: 1,
  blocked: 2
};

function rawOptions(question = {}) {
  if (Array.isArray(question.options)) return question.options;
  return Object.entries(question.options || {}).map(([label, text]) => ({ label, text }));
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function questionDiagnostic(question, rawQuestion, index) {
  const messages = [];
  let status = "ready";
  const add = (nextStatus, message) => {
    if (STATUS_PRIORITY[nextStatus] > STATUS_PRIORITY[status]) status = nextStatus;
    messages.push(message);
  };

  if (!question.prompt) {
    add("blocked", "O enunciado da questão está vazio.");
  }

  if (question.options.length < 2 || question.options.length > 5) {
    add("blocked", "A questão deve ter de 2 a 5 alternativas.");
  }

  for (const option of question.options) {
    if (!option.text) {
      add("blocked", `O texto da alternativa ${option.label || "sem rótulo"} está vazio.`);
    }
  }

  const optionLabels = question.options.map(({ label }) => label);
  if (new Set(optionLabels).size !== optionLabels.length) {
    add("blocked", "Há rótulos de alternativas duplicados.");
  }

  if (!question.correctOption || !optionLabels.includes(question.correctOption)) {
    add("blocked", "A resposta correta deve indicar uma alternativa existente.");
  }

  const expectedNumber = index + 1;
  if (Number(rawQuestion.number) !== expectedNumber) {
    add("attention", `Numeração ajustada para ${expectedNumber}.`);
  }
  const suppliedId = String(rawQuestion.id || "").trim();
  if (suppliedId && question.id !== suppliedId) {
    add("attention", `Identificador duplicado ajustado para ${question.id}.`);
  }

  const sourceOptions = rawOptions(rawQuestion);
  if (sourceOptions.some(option => !String(option?.label || "").trim())) {
    add("attention", "Rótulo ausente preenchido automaticamente.");
  }
  if (sourceOptions.some(option => {
    const label = String(option?.label || "");
    return label.trim() && label !== label.trim().toUpperCase();
  })) {
    add("attention", "Rótulos das alternativas convertidos para maiúsculas.");
  }

  if (!hasText(rawQuestion.topic)) add("attention", "Tema não informado.");
  if (!hasText(rawQuestion.difficulty)) add("attention", "Dificuldade não informada.");
  if (!hasText(rawQuestion.takeHome)) add("attention", "Take-home message não informado.");
  if (question.options.some(({ label }) => !hasText(question.feedback[label]))) {
    add("attention", "Feedback ausente para uma ou mais alternativas.");
  }
  if (!hasText(rawQuestion.keyPoint) && !hasText(rawQuestion.feedback?.keyPoint)) {
    add("attention", "Ponto-chave não informado.");
  }
  if (!hasText(rawQuestion.sourceReference)) add("attention", "Fonte no material não informada.");

  return {
    questionNumber: expectedNumber,
    status,
    messages
  };
}

export function validateQuiz(input = {}) {
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  const quiz = createQuiz(input);
  quiz.questions.forEach((question, index) => {
    question.number = index + 1;
  });
  quiz.questions = ensureUniqueQuestionIds(quiz.questions);

  const diagnostics = quiz.questions.map((question, index) => (
    questionDiagnostic(question, rawQuestions[index] || {}, index)
  ));
  const status = diagnostics.reduce((current, diagnostic) => (
    STATUS_PRIORITY[diagnostic.status] > STATUS_PRIORITY[current]
      ? diagnostic.status
      : current
  ), "ready");

  return { quiz, status, diagnostics };
}
