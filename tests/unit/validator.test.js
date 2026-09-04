import test from "node:test";
import assert from "node:assert/strict";

import { validateQuiz } from "../../js/import/validator.js";

const completeQuestion = (overrides = {}) => ({
  number: 1,
  topic: "Cardiologia",
  type: "Clínica",
  difficulty: "Intermediária",
  prompt: "Qual é a conduta?",
  options: { A: "Conduta um", B: "Conduta dois" },
  correctOption: "A",
  feedback: { A: "Correta", B: "Incorreta" },
  takeHome: "Mensagem",
  keyPoint: "Ponto-chave",
  sourceReference: "Aula 1",
  ...overrides
});

test("validator repairs labels and numbers but blocks a missing answer", () => {
  const result = validateQuiz({
    title: "Teste",
    questions: [
      {
        number: 9,
        prompt: "Caso",
        options: [{ label: "a", text: "Um" }, { label: "b", text: "Dois" }],
        correctOption: "b"
      },
      { prompt: "Sem resposta", options: { A: "Um", B: "Dois" } }
    ]
  });

  assert.equal(result.quiz.questions[0].number, 1);
  assert.deepEqual(result.quiz.questions[0].options.map(({ label }) => label), ["A", "B"]);
  assert.equal(result.quiz.questions[0].correctOption, "B");
  assert.equal(result.status, "blocked");
  assert.equal(result.diagnostics[0].status, "attention");
  assert.equal(result.diagnostics[1].status, "blocked");
  assert.match(result.diagnostics[1].messages[0], /resposta correta/i);
});

test("validator marks a complete canonical question ready", () => {
  const result = validateQuiz({
    title: "Teste",
    questions: [completeQuestion({
      options: { A: "Um", B: "Dois", C: "Três", D: "Quatro", E: "Cinco" },
      feedback: { A: "Certa", B: "Errada", C: "Errada", D: "Errada", E: "Errada" }
    })]
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.diagnostics, [{
    questionNumber: 1,
    status: "ready",
    messages: []
  }]);
});

test("validator reports every missing optional field as attention", () => {
  const result = validateQuiz({
    questions: [{
      prompt: "Caso",
      options: { A: "Um", B: "Dois" },
      correctOption: "A"
    }]
  });

  assert.equal(result.status, "attention");
  assert.equal(result.diagnostics[0].status, "attention");
  for (const field of ["tema", "dificuldade", "take-home", "feedback", "ponto-chave", "fonte"]) {
    assert.ok(
      result.diagnostics[0].messages.some(message => message.toLowerCase().includes(field)),
      `missing diagnostic for ${field}`
    );
  }
});

test("validator blocks missing prompts and invalid option collections", () => {
  const cases = [
    { question: completeQuestion({ prompt: "" }), message: /enunciado/i },
    { question: completeQuestion({ options: { A: "Única" }, correctOption: "A" }), message: /2 a 5 alternativas/i },
    { question: completeQuestion({ options: { A: "Um", B: "" } }), message: /texto.*alternativa/i },
    { question: completeQuestion({
      options: { A: "Um", B: "Dois", C: "Três", D: "Quatro", E: "Cinco", F: "Seis" }
    }), message: /2 a 5 alternativas/i },
    { question: completeQuestion({ options: [
      { label: "A", text: "Um" },
      { label: "a", text: "Dois" }
    ] }), message: /rótulos.*duplicados/i },
    { question: completeQuestion({ correctOption: "C" }), message: /resposta correta.*alternativa existente/i }
  ];

  for (const { question, message } of cases) {
    const result = validateQuiz({ questions: [question] });
    assert.equal(result.status, "blocked");
    assert.equal(result.diagnostics[0].status, "blocked");
    assert.ok(result.diagnostics[0].messages.some(item => message.test(item)));
  }
});

test("validator preserves question-level recovery when another question is blocked", () => {
  const result = validateQuiz({
    questions: [completeQuestion(), completeQuestion({ prompt: "" })]
  });

  assert.equal(result.quiz.questions.length, 2);
  assert.deepEqual(result.diagnostics.map(({ status }) => status), ["ready", "blocked"]);
});

test("validator preserves a null question and returns a blocked diagnostic", () => {
  const result = validateQuiz({ questions: [null] });

  assert.equal(result.quiz.questions.length, 1);
  assert.equal(result.status, "blocked");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].status, "blocked");
});

test("validator reports attention when an option label is filled automatically", () => {
  const result = validateQuiz({
    questions: [completeQuestion({
      options: [{ text: "Conduta um" }, { label: "B", text: "Conduta dois" }]
    })]
  });

  assert.equal(result.quiz.questions[0].options[0].label, "A");
  assert.equal(result.status, "attention");
  assert.equal(result.diagnostics[0].status, "attention");
  assert.ok(result.diagnostics[0].messages.some(message => /rótulo.*preenchido/i.test(message)));
});
