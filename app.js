import { migrateQuiz } from "./js/core/quiz-schema.js";
import { decodeQuizFragment } from "./js/share/codec.js";
import { createStore } from "./js/ui/state.js";
import { renderImportView } from "./js/ui/views/import-view.js";
import { renderShareView } from "./js/ui/views/share-view.js";
import { renderStudyView } from "./js/ui/views/study-view.js";

const ROUTE_TO_TAB = {
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

function hydrateLocalLibraryState() {
  try {
    const savedQuiz = window.localStorage.getItem("medup.quiz");
    return savedQuiz
      ? { activeQuiz: parseQuiz(savedQuiz), route: "study" }
      : {};
  } catch {
    return {
      notice: {
        type: "error",
        message: "Não foi possível restaurar o simulado salvo neste navegador."
      }
    };
  }
}

async function initialState() {
  const sharedState = await hydrateSharedLinkState();
  return sharedState || hydrateLocalLibraryState();
}

function renderApp(store) {
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
    renderImportView(document.querySelector("#import-tab"), store);
  }
  if (state.route === "study") renderStudyView(store);
  if (state.route === "share") {
    void renderShareView(document.querySelector("#exportar-tab"), store);
  }
}

async function start() {
  const store = createStore(await initialState());

  const switchRoute = route => {
    if (route === "editor" && store.getState().readOnly) {
      store.setState({
        route: "study",
        notice: { type: "info", message: "Links compartilhados abrem somente para estudo." }
      });
      return;
    }
    if (route !== "import" && !store.getState().activeQuiz) {
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
      switchRoute(route);
    });
  }

  window.switchTab = tabName => {
    const route = Object.entries(ROUTE_TO_TAB)
      .find(([, name]) => name === tabName)?.[0] || "import";
    switchRoute(route);
  };

  store.subscribe(() => renderApp(store));
  renderApp(store);
}

void start();
