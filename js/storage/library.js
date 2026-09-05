import { migrateQuiz } from "../core/quiz-schema.js";

export const DATABASE_NAME = "medup";
export const DATABASE_VERSION = 2;
export const QUIZ_STORE = "quizzes";
export const LEGACY_QUIZ_KEY = "medup.quiz";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function storageError(error) {
  if (error?.code && typeof error.recoverable === "boolean") return error;

  const quota = error?.name === "QuotaExceededError";
  const unavailable = [
    "InvalidStateError",
    "NotAllowedError",
    "SecurityError",
    "UnknownError"
  ].includes(error?.name);
  const wrapped = new Error(quota
    ? "O armazenamento local está cheio. Exporte um simulado e libere espaço para continuar."
    : unavailable
      ? "O armazenamento local não está disponível neste navegador. Exporte o simulado antes de sair."
      : "Não foi possível acessar a biblioteca local. Tente novamente ou exporte o simulado.");
  wrapped.name = "QuizStorageError";
  wrapped.code = quota ? "storage-quota" : unavailable
    ? "storage-unavailable"
    : "storage-error";
  wrapped.recoverable = true;
  wrapped.cause = error;
  return wrapped;
}

function normalizeQuiz(input) {
  const quiz = migrateQuiz(input);
  if (input?.progress && typeof input.progress === "object") {
    quiz.progress = clone(input.progress);
  }
  return quiz;
}

async function repositoryCall(operation) {
  try {
    return await operation();
  } catch (error) {
    throw storageError(error);
  }
}

export function memoryAdapter(initialQuizzes = []) {
  const records = new Map(initialQuizzes.map(item => [item.id, clone(item)]));

  return {
    async list() {
      return [...records.values()]
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
        .map(clone);
    },
    async get(id) {
      return clone(records.get(id) || null);
    },
    async put(quiz) {
      records.set(quiz.id, clone(quiz));
      return clone(quiz);
    },
    async remove(id) {
      records.delete(id);
    }
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

export function indexedDbAdapter(indexedDB = globalThis.indexedDB) {
  let databasePromise;

  const database = () => {
    if (!indexedDB) {
      return Promise.reject(Object.assign(new Error("IndexedDB unavailable"), {
        name: "InvalidStateError"
      }));
    }
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(QUIZ_STORE)
          ? request.transaction.objectStore(QUIZ_STORE)
          : db.createObjectStore(QUIZ_STORE, { keyPath: "id" });
        if (!store.indexNames.contains("updatedAt")) {
          store.createIndex("updatedAt", "updatedAt");
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error), { once: true });
      request.addEventListener("blocked", () => reject(Object.assign(
        new Error("IndexedDB upgrade blocked"),
        { name: "InvalidStateError" }
      )), { once: true });
    });
    return databasePromise;
  };

  return {
    async list() {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readonly");
      const done = transactionDone(transaction);
      const index = transaction.objectStore(QUIZ_STORE).index("updatedAt");
      const result = await requestResult(index.getAll());
      await done;
      return result.reverse().map(clone);
    },
    async get(id) {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readonly");
      const done = transactionDone(transaction);
      const result = await requestResult(transaction.objectStore(QUIZ_STORE).get(id));
      await done;
      return clone(result || null);
    },
    async put(quiz) {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readwrite");
      transaction.objectStore(QUIZ_STORE).put(clone(quiz));
      await transactionDone(transaction);
      return clone(quiz);
    },
    async remove(id) {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readwrite");
      transaction.objectStore(QUIZ_STORE).delete(id);
      await transactionDone(transaction);
    }
  };
}

export function createQuizLibrary(adapter = indexedDbAdapter()) {
  return {
    list() {
      return repositoryCall(() => adapter.list());
    },
    get(id) {
      return repositoryCall(() => adapter.get(String(id)));
    },
    async put(input) {
      const quiz = normalizeQuiz(input);
      return repositoryCall(() => adapter.put(quiz));
    },
    async rename(id, title) {
      const quiz = await this.get(id);
      if (!quiz) return null;
      quiz.title = String(title || "").trim() || "Simulado sem título";
      quiz.updatedAt = new Date().toISOString();
      return this.put(quiz);
    },
    async duplicate(id) {
      const source = await this.get(id);
      if (!source) return null;
      const now = new Date().toISOString();
      return this.put({
        ...source,
        id: crypto.randomUUID(),
        title: `${source.title} (cópia)`,
        createdAt: now,
        updatedAt: now
      });
    },
    remove(id) {
      return repositoryCall(() => adapter.remove(String(id)));
    },
    async importLegacy(localStorage = globalThis.localStorage) {
      let serialized;
      try {
        serialized = localStorage?.getItem(LEGACY_QUIZ_KEY);
      } catch (error) {
        throw storageError(error);
      }
      if (!serialized) return null;

      const parsed = JSON.parse(serialized);
      const imported = await this.put(parsed.quiz || parsed);
      try {
        localStorage.removeItem(LEGACY_QUIZ_KEY);
      } catch (error) {
        throw storageError(error);
      }
      return imported;
    }
  };
}

export const quizLibrary = createQuizLibrary();
