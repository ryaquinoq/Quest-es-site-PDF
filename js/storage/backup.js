import { migrateQuiz } from "../core/quiz-schema.js";

export const BACKUP_FORMAT = "medup-backup";
export const BACKUP_VERSION = 1;

function invalidBackup(message, cause) {
  const error = new Error(`Backup inválido: ${message}`);
  if (cause) error.cause = cause;
  return error;
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validateQuizCollection(quizzes) {
  if (!Array.isArray(quizzes)) {
    throw invalidBackup("a coleção de simulados deve ser uma lista.");
  }

  const ids = new Set();
  for (const quiz of quizzes) {
    if (!isRecord(quiz) || typeof quiz.id !== "string" || !quiz.id.trim()) {
      throw invalidBackup("há um simulado sem identificador válido.");
    }
    if (ids.has(quiz.id)) {
      throw invalidBackup(`o simulado ${quiz.id} aparece mais de uma vez.`);
    }
    ids.add(quiz.id);

    if (!Array.isArray(quiz.questions)) {
      throw invalidBackup(`as questões do simulado ${quiz.id} devem ser uma lista.`);
    }
    const questionIds = new Set();
    for (const question of quiz.questions) {
      if (
        !isRecord(question) ||
        typeof question.id !== "string" ||
        !question.id.trim() ||
        !Array.isArray(question.options)
      ) {
        throw invalidBackup(`o simulado ${quiz.id} contém uma questão malformada.`);
      }
      if (questionIds.has(question.id)) {
        throw invalidBackup(
          `o simulado ${quiz.id} contém identificador de questão duplicado: ${question.id}.`
        );
      }
      questionIds.add(question.id);
    }
  }
}

function canonicalQuizzes(quizzes) {
  validateQuizCollection(quizzes);
  return quizzes.map(migrateQuiz);
}

export function createBackup(quizzes) {
  if (!Array.isArray(quizzes)) {
    throw invalidBackup("a coleção de simulados deve ser uma lista.");
  }
  const normalized = quizzes.map(migrateQuiz);
  validateQuizCollection(normalized);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    quizzes: normalized
  };
}

export function parseBackup(input, existingIds = []) {
  let backup = input;
  if (typeof input === "string") {
    try {
      backup = JSON.parse(input);
    } catch (error) {
      throw invalidBackup("o conteúdo não é um JSON válido.", error);
    }
  }

  if (!isRecord(backup)) {
    throw invalidBackup("o conteúdo deve ser um objeto.");
  }
  if (backup.format !== BACKUP_FORMAT) {
    throw invalidBackup(`o formato deve ser "${BACKUP_FORMAT}".`);
  }
  if (backup.version !== BACKUP_VERSION) {
    throw invalidBackup(`a versão deve ser ${BACKUP_VERSION}.`);
  }

  const quizzes = canonicalQuizzes(backup.quizzes);
  const knownIds = new Set(Array.from(existingIds, id => String(id)));

  return {
    quizzes,
    preview: {
      incomingCount: quizzes.length,
      conflictingIds: quizzes
        .map(quiz => quiz.id)
        .filter(id => knownIds.has(id))
    }
  };
}
