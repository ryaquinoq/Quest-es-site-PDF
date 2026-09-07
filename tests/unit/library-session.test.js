import test from "node:test";
import assert from "node:assert/strict";

import {
  openLocalQuizState,
  resumeActionLabel,
  selectMostRecentlyStudiedQuiz
} from "../../js/ui/library-session.js";

function quiz(overrides = {}) {
  return {
    id: "quiz-1",
    title: "Cardiologia",
    questions: [{ id: "q-1" }, { id: "q-2" }],
    progress: {
      answers: { "q-1": "B" },
      selectedQuestion: 1,
      finalized: true
    },
    study: { lastStudiedAt: "2026-09-07T12:00:00.000Z" },
    ...overrides
  };
}

test("opens a local quiz with persisted study state and clears shared-session state", () => {
  const persisted = quiz();

  const state = openLocalQuizState(persisted);

  assert.deepEqual(state, {
    activeQuiz: persisted,
    route: "study",
    selectedQuestion: 1,
    answers: { "q-1": "B" },
    finalized: true,
    readOnly: false,
    notice: null
  });
  assert.notEqual(state.answers, persisted.progress.answers);
});

test("clamps the persisted question index to the available questions", () => {
  assert.equal(openLocalQuizState(quiz({
    progress: { answers: {}, selectedQuestion: 99, finalized: false }
  })).selectedQuestion, 1);

  assert.equal(openLocalQuizState(quiz({
    progress: { answers: {}, selectedQuestion: -4, finalized: false }
  })).selectedQuestion, 0);
});

test("selects the quiz with the newest valid non-empty last-studied timestamp", () => {
  const older = quiz({ id: "older", study: { lastStudiedAt: "2026-09-06T15:00:00.000Z" } });
  const newest = quiz({ id: "newest", study: { lastStudiedAt: "2026-09-07T08:00:00.000Z" } });
  const invalid = quiz({ id: "invalid", study: { lastStudiedAt: "not-a-date" } });

  assert.equal(selectMostRecentlyStudiedQuiz([invalid, older, newest]), newest);
  assert.equal(selectMostRecentlyStudiedQuiz([
    quiz({ study: { lastStudiedAt: "" } }),
    invalid
  ]), null);
});

test("labels a finalized resume action as viewing the result", () => {
  assert.equal(resumeActionLabel(quiz()), "Ver resultado");
  assert.equal(resumeActionLabel(quiz({
    progress: { answers: {}, selectedQuestion: 0, finalized: false }
  })), "Continuar estudando");
});
