import test from "node:test";
import assert from "node:assert/strict";

import { createQuiz } from "../../js/core/quiz-schema.js";
import { createBackup, parseBackup } from "../../js/storage/backup.js";

function canonicalQuiz(overrides = {}) {
  return createQuiz({
    id: "quiz-1",
    title: "Cardiologia",
    createdAt: "2026-09-07T10:00:00.000Z",
    updatedAt: "2026-09-07T11:00:00.000Z",
    questions: [{
      id: "q-1",
      prompt: "Caso clínico",
      options: { A: "Um", B: "Dois" },
      correctOption: "A"
    }],
    study: {
      lastStudiedAt: "2026-09-07T12:00:00.000Z",
      bookmarkedQuestionIds: ["q-1"],
      doubtQuestionIds: ["q-1"],
      errorReview: {
        questionIds: ["q-1"],
        answers: { "q-1": "B" },
        selectedQuestion: 0,
        finalized: false,
        updatedAt: "2026-09-07T12:15:00.000Z"
      }
    },
    ...overrides
  });
}

test("backup round-trip preserves canonical quiz and study metadata", () => {
  const quiz = canonicalQuiz();
  const backup = createBackup([quiz]);
  const parsed = parseBackup(JSON.stringify(backup));

  assert.equal(backup.format, "medup-backup");
  assert.equal(backup.version, 1);
  assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(parsed.quizzes, [quiz]);
  assert.deepEqual(parsed.preview, { incomingCount: 1, conflictingIds: [] });
});

test("parseBackup rejects wrong format, version, single quizzes, and malformed quizzes", () => {
  const valid = createBackup([canonicalQuiz()]);
  const invalidBackups = [
    { ...valid, format: "other-backup" },
    { ...valid, version: 2 },
    canonicalQuiz(),
    { ...valid, quizzes: [{ id: "broken", questions: "not-an-array" }] }
  ];

  for (const input of invalidBackups) {
    assert.throws(
      () => parseBackup(input),
      error => error instanceof Error && /^Backup inválido:/.test(error.message)
    );
  }
});

test("parseBackup previews incoming count and conflicting IDs", () => {
  const backup = createBackup([
    canonicalQuiz(),
    canonicalQuiz({ id: "quiz-2", title: "Neurologia" })
  ]);

  const parsed = parseBackup(backup, ["quiz-2", "unrelated"]);

  assert.deepEqual(parsed.preview, {
    incomingCount: 2,
    conflictingIds: ["quiz-2"]
  });
});
