import test from "node:test";
import assert from "node:assert/strict";

import { createQuiz } from "../../js/core/quiz-schema.js";
import {
  createQuizLibrary,
  indexedDbAdapter,
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

function eventTarget(properties = {}) {
  return Object.assign(new EventTarget(), properties);
}

function successfulReadDatabase(result = []) {
  return {
    transaction() {
      const transaction = eventTarget({ error: null });
      const request = eventTarget({ error: null, result: undefined });
      transaction.objectStore = () => ({
        index: () => ({ getAll: () => request })
      });
      queueMicrotask(() => {
        request.result = structuredClone(result);
        request.dispatchEvent(new Event("success"));
        transaction.dispatchEvent(new Event("complete"));
      });
      return transaction;
    }
  };
}

function openingIndexedDb(sequence) {
  let calls = 0;
  return {
    get calls() { return calls; },
    open() {
      const request = eventTarget({ error: null, result: undefined });
      const outcome = sequence[calls++];
      queueMicrotask(() => {
        if (outcome instanceof Error) {
          request.error = outcome;
          request.dispatchEvent(new Event("error"));
          return;
        }
        request.result = outcome;
        request.dispatchEvent(new Event("success"));
      });
      return request;
    }
  };
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

test("preserves canonical study progress through repository writes", async () => {
  const repository = createQuizLibrary(memoryAdapter());
  await repository.put(quiz({
    questions: [{ id: "q-1", options: { A: "Um", B: "Dois" }, correctOption: "A" }],
    progress: {
      answers: { "q-1": "A" },
      answered: 1,
      correct: 1,
      finalized: true,
      selectedQuestion: 0
    }
  }));

  assert.deepEqual((await repository.get("quiz-1")).progress, {
    answers: { "q-1": "A" },
    answered: 1,
    correct: 1,
    finalized: true,
    selectedQuestion: 0
  });
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

test("classifies a write request quota error when transaction.error is null", async () => {
  const database = {
    transaction() {
      const transaction = eventTarget({ error: null });
      transaction.objectStore = () => ({
        put() {
          const request = eventTarget({ error: null });
          queueMicrotask(() => {
            request.error = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
            request.dispatchEvent(new Event("error"));
            transaction.dispatchEvent(new Event("abort"));
          });
          return request;
        }
      });
      return transaction;
    }
  };
  const repository = createQuizLibrary(indexedDbAdapter(openingIndexedDb([database])));

  await assert.rejects(repository.put(quiz()), error => (
    error.code === "storage-quota" && error.cause?.name === "QuotaExceededError"
  ));
});

test("retries opening IndexedDB after a transient rejection", async () => {
  const unavailable = Object.assign(new Error("temporarily unavailable"), {
    name: "InvalidStateError"
  });
  const indexedDB = openingIndexedDb([unavailable, successfulReadDatabase()]);
  const repository = createQuizLibrary(indexedDbAdapter(indexedDB));

  await assert.rejects(repository.list(), error => error.code === "storage-unavailable");
  assert.deepEqual(await repository.list(), []);
  assert.equal(indexedDB.calls, 2);
});

test("legacy migration remains idempotent when localStorage cleanup fails", async () => {
  const adapter = memoryAdapter();
  const serialized = JSON.stringify({
    metadata: { title: "Legado sem identificador" },
    questions: []
  });
  const localStorage = {
    getItem: () => serialized,
    removeItem() { throw Object.assign(new Error("denied"), { name: "SecurityError" }); }
  };

  const firstRepository = createQuizLibrary(adapter);
  const first = await firstRepository.importLegacy(localStorage);
  await firstRepository.rename(first.id, "Edição mais nova");

  const reloadedRepository = createQuizLibrary(adapter);
  const second = await reloadedRepository.importLegacy(localStorage);
  assert.equal(second.id, first.id);
  assert.equal(second.title, "Edição mais nova");
  assert.equal((await reloadedRepository.list()).length, 1);
});
