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
  return migrateQuiz(input);
}

function restoreMode(mode) {
  if (mode === "preserve" || mode === "replace") return mode;
  throw new TypeError('O modo de restauração deve ser "preserve" ou "replace".');
}

function legacyQuizId(serialized) {
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return `legacy-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
    },
    async restore(quizzes, mode) {
      const selectedMode = restoreMode(mode);
      const snapshot = new Map([...records].map(([id, value]) => [id, clone(value)]));
      const counts = { added: 0, replaced: 0, skipped: 0 };

      try {
        for (const quiz of quizzes) {
          const exists = records.has(quiz.id);
          if (exists && selectedMode === "preserve") {
            counts.skipped += 1;
            continue;
          }

          const saved = clone(quiz);
          records.set(saved.id, saved);
          if (exists) counts.replaced += 1;
          else counts.added += 1;
        }
        return counts;
      } catch (error) {
        records.clear();
        for (const [id, value] of snapshot) records.set(id, value);
        throw error;
      }
    }
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionResult(transaction, request) {
  return new Promise((resolve, reject) => {
    let result;
    const fail = event => reject(
      transaction.error ||
      request.error ||
      event?.target?.error ||
      event?.error ||
      new Error("IndexedDB transaction failed")
    );
    request.addEventListener("success", () => { result = request.result; }, { once: true });
    request.addEventListener("error", fail, { once: true });
    transaction.addEventListener("complete", () => resolve(result), { once: true });
    transaction.addEventListener("abort", fail, { once: true });
    transaction.addEventListener("error", fail, { once: true });
  });
}

function transactionCompletion(transaction) {
  return new Promise((resolve, reject) => {
    const fail = event => reject(
      transaction.error ||
      event?.target?.error ||
      event?.error ||
      new Error("IndexedDB transaction failed")
    );
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", fail, { once: true });
    transaction.addEventListener("error", fail, { once: true });
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
    }).catch(error => {
      databasePromise = undefined;
      throw error;
    });
    return databasePromise;
  };

  return {
    async list() {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readonly");
      const index = transaction.objectStore(QUIZ_STORE).index("updatedAt");
      const result = await transactionResult(transaction, index.getAll());
      return result.reverse().map(clone);
    },
    async get(id) {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readonly");
      const request = transaction.objectStore(QUIZ_STORE).get(id);
      const result = await transactionResult(transaction, request);
      return clone(result || null);
    },
    async put(quiz) {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readwrite");
      const request = transaction.objectStore(QUIZ_STORE).put(clone(quiz));
      await transactionResult(transaction, request);
      return clone(quiz);
    },
    async remove(id) {
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readwrite");
      const request = transaction.objectStore(QUIZ_STORE).delete(id);
      await transactionResult(transaction, request);
    },
    async restore(quizzes, mode) {
      const selectedMode = restoreMode(mode);
      const db = await database();
      const transaction = db.transaction(QUIZ_STORE, "readwrite");
      const completion = transactionCompletion(transaction);
      const store = transaction.objectStore(QUIZ_STORE);
      const counts = { added: 0, replaced: 0, skipped: 0 };

      try {
        const existingIds = new Set(await requestResult(store.getAllKeys()));
        const writes = [];
        for (const quiz of quizzes) {
          const exists = existingIds.has(quiz.id);
          if (exists && selectedMode === "preserve") {
            counts.skipped += 1;
            continue;
          }

          writes.push(requestResult(store.put(clone(quiz))));
          if (exists) counts.replaced += 1;
          else counts.added += 1;
        }
        await Promise.all(writes);
        await completion;
        return counts;
      } catch (error) {
        try { transaction.abort(); } catch {}
        await completion.catch(() => {});
        throw error;
      }
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
    restore(inputs, mode) {
      if (!Array.isArray(inputs)) {
        throw new TypeError("A restauração exige uma lista de simulados.");
      }
      const selectedMode = restoreMode(mode);
      const quizzes = inputs.map(normalizeQuiz);
      return repositoryCall(() => adapter.restore(quizzes, selectedMode));
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
      const source = parsed?.quiz || parsed || {};
      const candidate = {
        ...source,
        id: source.id || legacyQuizId(serialized)
      };
      const imported = await this.get(candidate.id) || await this.put(candidate);
      try {
        localStorage.removeItem(LEGACY_QUIZ_KEY);
      } catch {}
      return imported;
    }
  };
}

export const quizLibrary = createQuizLibrary();
