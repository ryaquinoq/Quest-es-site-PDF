import { migrateQuiz } from "../core/quiz-schema.js";

export function createShareableQuiz(input) {
  const quiz = migrateQuiz(input);

  return {
    schemaVersion: quiz.schemaVersion,
    title: quiz.title,
    introduction: quiz.introduction,
    themes: quiz.themes,
    distribution: quiz.distribution,
    questions: quiz.questions
  };
}
