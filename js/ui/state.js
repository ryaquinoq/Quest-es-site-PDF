const DEFAULT_IMPORT_DRAFT = Object.freeze({
  sourceText: "",
  sourceName: "",
  excludedQuestionIds: [],
  loading: false,
  progress: null,
  error: ""
});

const DEFAULT_STATE = Object.freeze({
  route: "import",
  activeQuiz: null,
  libraryItems: [],
  libraryLoading: false,
  importDraft: DEFAULT_IMPORT_DRAFT,
  importResult: null,
  selectedQuestion: 0,
  answers: {},
  finalized: false,
  notice: null
});

export function createStore(initialState = {}) {
  let state = {
    ...DEFAULT_STATE,
    ...initialState,
    importDraft: {
      ...DEFAULT_IMPORT_DRAFT,
      ...(initialState.importDraft || {})
    },
    answers: { ...(initialState.answers || {}) }
  };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },

    setState(update) {
      const patch = typeof update === "function" ? update(state) : update;
      if (!patch || typeof patch !== "object") return state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
