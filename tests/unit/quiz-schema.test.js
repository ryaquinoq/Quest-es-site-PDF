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
