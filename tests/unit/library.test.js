import test from "node:test";
import assert from "node:assert/strict";

import { createQuiz } from "../../js/core/quiz-schema.js";
import {
  createQuizLibrary,
  memoryAdapter,
  storageError
} from "../../js/storage/library.js";

function quiz(overrides = {}) {
  return createQuiz({
    id: "quiz-1",
    title: "Cardio",
    updatedAt: "2026-09-03T10:00:00.000Z",
    questions: [],
    ...overrides
  });
}

test("stores canonical quizzes and lists the most recently updated first", async () => {
  const repository = createQuizLibrary(memoryAdapter());
  await repository.put(quiz());
  await repository.put(quiz({
    id: "quiz-2",
    title: "Neuro",
    updatedAt: "2026-09-04T10:00:00.000Z"
  }));

  const saved = await repository.list();
  assert.deepEqual(saved.map(item => item.title), ["Neuro", "Cardio"]);

  saved[0].title = "Alterado fora do repositório";
  assert.equal((await repository.get("quiz-2")).title, "Neuro");
});

test("renames, duplicates, and removes a stored quiz", async () => {
  const repository = createQuizLibrary(memoryAdapter());
  await repository.put(quiz());

  const renamed = await repository.rename("quiz-1", "Cardiologia avançada");
  assert.equal(renamed.title, "Cardiologia avançada");

  const copy = await repository.duplicate("quiz-1");
  assert.notEqual(copy.id, "quiz-1");
  assert.match(copy.title, /cópia/i);
  assert.notEqual(copy.updatedAt, "2026-09-03T10:00:00.000Z");

  await repository.remove("quiz-1");
  assert.equal(await repository.get("quiz-1"), null);
  assert.equal((await repository.list()).length, 1);
});

test("imports the previous localStorage quiz once and preserves it on parse failure", async () => {
  const repository = createQuizLibrary(memoryAdapter());
  const values = new Map([["medup.quiz", JSON.stringify({
    id: "legacy-1",
    metadata: { title: "Legado" },
    questions: []
  })]]);
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key)
  };

  const imported = await repository.importLegacy(localStorage);
  assert.equal(imported.title, "Legado");
  assert.equal(values.has("medup.quiz"), false);
  assert.equal(await repository.importLegacy(localStorage), null);

  values.set("medup.quiz", "not-json");
  await assert.rejects(repository.importLegacy(localStorage), SyntaxError);
  assert.equal(values.has("medup.quiz"), true);
});

test("exposes recoverable storage errors with a stable public shape", async () => {
  const quota = storageError({ name: "QuotaExceededError" });
  assert.deepEqual(
    { code: quota.code, message: quota.message, recoverable: quota.recoverable },
    {
      code: "storage-quota",
      message: "O armazenamento local está cheio. Exporte um simulado e libere espaço para continuar.",
      recoverable: true
    }
  );

  const repository = createQuizLibrary({
    async list() { throw Object.assign(new Error("denied"), { name: "InvalidStateError" }); }
  });
  await assert.rejects(repository.list(), error => (
    error.code === "storage-unavailable" && error.recoverable === true
  ));
});
