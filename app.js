import { migrateQuiz } from "./js/core/quiz-schema.js";
import { decodeQuizFragment } from "./js/share/codec.js";
import { quizLibrary } from "./js/storage/library.js";
import { createStore } from "./js/ui/state.js";
import { renderEditorView } from "./js/ui/views/editor-view.js";
import { renderImportView } from "./js/ui/views/import-view.js";
import { renderLibraryView } from "./js/ui/views/library-view.js";
import { renderShareView } from "./js/ui/views/share-view.js";
import { renderStudyView } from "./js/ui/views/study-view.js";

const ROUTE_TO_TAB = {
  library: "biblioteca",
  import: "import",
  study: "simulado",
  editor: "editor",
  share: "exportar"
};

function parseQuiz(value) {
  const parsed = JSON.parse(value);
  return migrateQuiz(parsed.quiz || parsed);
}

function unreadableSharedLinkState() {
  return {
    notice: {
      type: "error",
      message: "O link compartilhado não pôde ser aberto."
    }
  };
}

async function hydrateSharedLinkState() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const payload = fragment.get("quiz");
  if (!payload) return null;

  try {
    const quiz = payload.startsWith("v2.")
      ? migrateQuiz(await decodeQuizFragment(`#quiz=${payload}`))
      : parseQuiz(payload);
    return { activeQuiz: quiz, route: "study", readOnly: true };
  } catch {
    return unreadableSharedLinkState();
  }
}

function renderApp(store, library, setEditorController) {
  const state = store.getState();
  const activeTab = ROUTE_TO_TAB[state.route] || "import";

  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.classList.toggle("active", tab.dataset.tab === activeTab);
    tab.disabled = Boolean(state.readOnly && tab.dataset.tab === "editor");
  }
  for (const section of document.querySelectorAll(".tab-content")) {
    section.classList.toggle("active", section.id === `${activeTab}-tab`);
  }

  const notice = document.querySelector("#app-notice");
  notice.textContent = state.notice?.message || "";
  notice.hidden = !state.notice;
  notice.dataset.type = state.notice?.type || "";

  if (state.route === "import") {
    renderImportView(document.querySelector("#import-tab"), store, library);
  }
  if (state.route === "study") renderStudyView(store);
  if (state.route === "library") {
    renderLibraryView(document.querySelector("#biblioteca-tab"), store, library);
  }
  if (state.route === "editor") {
    setEditorController(renderEditorView(
      document.querySelector("#editor-tab"),
      store,
      library
    ));
  } else {
    setEditorController(null);
  }
  if (state.route === "share") {
    void renderShareView(document.querySelector("#exportar-tab"), store);
  }
}

async function start() {
  const sharedState = await hydrateSharedLinkState();
  const store = createStore({ ...(sharedState || {}), libraryLoading: true });
  let editorController = null;
  const render = () => renderApp(
    store,
    quizLibrary,
    controller => { editorController = controller; }
  );

  const switchRoute = async route => {
    if (store.getState().route === "editor" && route !== "editor") {
      const saved = await editorController?.save();
      if (saved === false) return;
    }
    if (route === "editor" && store.getState().readOnly) {
      store.setState({
        route: "study",
        notice: { type: "info", message: "Links compartilhados abrem somente para estudo." }
      });
      return;
    }
    if (!["import", "library"].includes(route) && !store.getState().activeQuiz) {
      store.setState({
        route: "import",
        notice: { type: "info", message: "Importe questões para abrir esta área." }
      });
      return;
    }
    store.setState({ route, notice: null });
  };

  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.addEventListener("click", () => {
      const route = Object.entries(ROUTE_TO_TAB)
        .find(([, tabName]) => tabName === tab.dataset.tab)?.[0] || "import";
      void switchRoute(route);
    });
  }

  window.switchTab = tabName => {
    const route = Object.entries(ROUTE_TO_TAB)
      .find(([, name]) => name === tabName)?.[0] || "import";
    void switchRoute(route);
  };

  store.subscribe(render);
  render();

  try {
    const imported = sharedState ? null : await quizLibrary.importLegacy();
    const libraryItems = await quizLibrary.list();
    const patch = { libraryItems, libraryLoading: false };
    if (!sharedState && imported) {
      Object.assign(patch, {
        activeQuiz: imported,
        route: "study",
        notice: { type: "success", message: "Simulado anterior adicionado à biblioteca local." }
      });
    } else if (!sharedState && libraryItems.length) {
      patch.route = "library";
    }
    store.setState(patch);
  } catch (error) {
    store.setState({
      libraryLoading: false,
      notice: {
        type: "error",
        message: error.message || "Não foi possível abrir a biblioteca local."
      }
    });
  }
}

void start();
