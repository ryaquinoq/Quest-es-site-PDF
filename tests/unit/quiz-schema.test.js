import test from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  createQuestion,
  createQuiz,
  migrateQuiz
} from "../../js/core/quiz-schema.js";

test("createQuiz assigns stable canonical defaults", () => {
  const quiz = createQuiz({
    title: "Cardiologia",
    questions: [{
      prompt: "Caso",
      options: { A: "Um", B: "Dois" },
      correctOption: "B"
    }]
  });

  assert.equal(quiz.schemaVersion, SCHEMA_VERSION);
  assert.equal(quiz.schemaVersion, 2);
  assert.equal(quiz.title, "Cardiologia");
  assert.match(quiz.id, /\S/);
  assert.match(quiz.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(quiz.questions[0].number, 1);
  assert.equal(quiz.questions[0].options[1].label, "B");
  assert.equal(quiz.questions[0].feedback.B, "");
  assert.deepEqual(quiz.progress, {
    answers: {},
    answered: 0,
    correct: 0,
    finalized: false,
    selectedQuestion: 0
  });
});

test("createQuiz preserves normalized study progress", () => {
  const quiz = createQuiz({
    questions: [
      { id: "q-1", options: { A: "Um", B: "Dois" }, correctOption: "A" },
      { id: "q-2", options: { A: "Um", B: "Dois" }, correctOption: "B" }
    ],
    progress: {
      answers: { "q-1": "a", "q-2": "X", missing: "B" },
      answered: 99,
      correct: 99,
      finalized: true,
      selectedQuestion: 12
    }
  });

  assert.deepEqual(quiz.progress, {
    answers: { "q-1": "A" },
    answered: 1,
    correct: 1,
    finalized: true,
    selectedQuestion: 1
  });
});

test("createQuiz gives old quizzes safe study defaults", () => {
  const quiz = createQuiz({
    id: "legacy-quiz",
    questions: [{ id: "q-1", options: { A: "Um", B: "Dois" } }]
  });

  assert.deepEqual(quiz.study, {
    lastStudiedAt: "",
    bookmarkedQuestionIds: [],
    doubtQuestionIds: [],
    errorReview: null
  });
});

test("createQuiz removes stale study IDs and invalid review answers", () => {
  const quiz = createQuiz({
    questions: [
      { id: "q-1", options: { A: "Um", B: "Dois" }, correctOption: "A" },
      { id: "q-2", options: { A: "Um", B: "Dois" }, correctOption: "B" }
    ],
    study: {
      lastStudiedAt: "2026-09-07T12:30:00.000Z",
      bookmarkedQuestionIds: ["q-1", "missing", "q-1"],
      doubtQuestionIds: ["missing", "q-2", "q-2"],
      errorReview: {
        questionIds: ["q-2", "missing", "q-2", "q-1"],
        answers: { "q-1": "a", "q-2": "X", missing: "B" },
        selectedQuestion: 99,
        finalized: true,
        updatedAt: "2026-09-07T12:45:00.000Z"
      }
    }
  });

  assert.deepEqual(quiz.study, {
    lastStudiedAt: "2026-09-07T12:30:00.000Z",
    bookmarkedQuestionIds: ["q-1"],
    doubtQuestionIds: ["q-2"],
    errorReview: {
      questionIds: ["q-2", "q-1"],
      answers: { "q-1": "A" },
      selectedQuestion: 1,
      finalized: true,
      updatedAt: "2026-09-07T12:45:00.000Z"
    }
  });
});

test("createQuestion normalizes array options and legacy answer feedback", () => {
  const question = createQuestion({
    number: 7,
    prompt: "  Caso clínico  ",
    options: [{ label: "a", text: "  Um  " }, { text: "Dois" }],
    feedback: {
      correctOption: "b",
      correctReason: "  Correta  ",
      optionFeedback: { A: "  Incorreta  " },
      keyPoint: "  Revisar  "
    }
  }, 3);

  assert.equal(question.id, "q-7");
  assert.equal(question.prompt, "Caso clínico");
  assert.deepEqual(question.options, [
    { label: "A", text: "Um" },
    { label: "B", text: "Dois" }
  ]);
  assert.equal(question.correctOption, "B");
  assert.deepEqual(question.feedback, { A: "Incorreta", B: "Correta" });
  assert.equal(question.keyPoint, "Revisar");
});

test("createQuestion trims labels and answer before matching feedback keys case-insensitively", () => {
  const question = createQuestion({
    prompt: "Caso clínico",
    options: [{ label: " a ", text: "Um" }, { label: " b ", text: "Dois" }],
    correctOption: " b ",
    feedback: {
      a: "Alternativa incorreta",
      optionFeedback: { b: "Alternativa correta" }
    }
  });

  assert.deepEqual(question.options.map(({ label }) => label), ["A", "B"]);
  assert.equal(question.correctOption, "B");
  assert.deepEqual(question.feedback, {
    A: "Alternativa incorreta",
    B: "Alternativa correta"
  });
});

test("migrateQuiz converts legacy metadata and feedback", () => {
  const legacy = {
    metadata: { title: "Teste", intro: "Introdução", themes: ["Clínica"] },
    questions: [{
      id: "q-1",
      number: 1,
      prompt: "Caso",
      options: [{ label: "A", text: "Um" }, { label: "B", text: "Dois" }],
      feedback: {
        correctOption: "B",
        correctReason: "Certa",
        optionFeedback: { A: "Errada" }
      }
    }]
  };

  const quiz = migrateQuiz(legacy);

  assert.equal(quiz.title, "Teste");
  assert.equal(quiz.introduction, "Introdução");
  assert.deepEqual(quiz.themes, ["Clínica"]);
  assert.deepEqual(quiz.questions[0].feedback, { A: "Errada", B: "Certa" });
});

test("createQuiz assigns stable unique question IDs across source collisions", () => {
  const input = {
    questions: [
      { id: "provided", number: 1 },
      { id: "provided", number: 1 },
      { number: 1 },
      { number: 1 }
    ]
  };

  const firstIds = createQuiz(input).questions.map(({ id }) => id);
  const secondIds = createQuiz(input).questions.map(({ id }) => id);

  assert.deepEqual(firstIds, ["provided", "provided-2", "q-1", "q-1-2"]);
  assert.deepEqual(secondIds, firstIds);
  assert.equal(new Set(firstIds).size, firstIds.length);
});
