import { migrateQuiz } from "./js/core/quiz-schema.js";
import { createStore } from "./js/ui/state.js";
import { renderImportView } from "./js/ui/views/import-view.js";

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

function hydrateSharedLinkState() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const payload = fragment.get("quiz");
  if (!payload) return null;

  try {
    if (payload.startsWith("v2.")) return unreadableSharedLinkState();
    return { activeQuiz: parseQuiz(payload), route: "study" };
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

function initialState() {
  const sharedState = hydrateSharedLinkState();
  return sharedState || hydrateLocalLibraryState();
}

function renderStudyView(store) {
  const state = store.getState();
  const quiz = state.activeQuiz;
  const placeholder = document.querySelector("#simulado-placeholder");
  const view = document.querySelector("#simulado-view");
  const stage = document.querySelector("#question-stage");
  const sidebar = document.querySelector("#sidebar-nav");
  const stats = document.querySelector("#stats-header");

  placeholder.style.display = quiz?.questions.length ? "none" : "flex";
  view.style.display = quiz?.questions.length ? "grid" : "none";
  if (!quiz?.questions.length) return;

  const selectedIndex = Math.min(state.selectedQuestion, quiz.questions.length - 1);
  const question = quiz.questions[selectedIndex];
  stage.replaceChildren();
  stage.dataset.studyQuestion = question.id;

  const heading = document.createElement("h2");
  heading.className = "question-title";
  heading.textContent = `Questão ${question.number}`;
  const topic = document.createElement("p");
  topic.className = "question-kicker";
  topic.textContent = question.topic;
  const prompt = document.createElement("p");
  prompt.className = "question-prompt";
  prompt.textContent = question.prompt;
  const options = document.createElement("div");
  options.className = "options-list";

  for (const option of question.options) {
    const button = document.createElement("button");
    button.className = "option-item";
    button.type = "button";
    button.textContent = `${option.label}) ${option.text}`;
    button.addEventListener("click", () => {
      store.setState(current => ({
        answers: { ...current.answers, [question.id]: option.label }
      }));
    });
    options.append(button);
  }
  stage.append(topic, heading, prompt, options);

  sidebar.replaceChildren(...quiz.questions.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-quest-btn${index === selectedIndex ? " active" : ""}`;
    button.textContent = `Questão ${item.number}`;
    button.addEventListener("click", () => store.setState({ selectedQuestion: index }));
    return button;
  }));

  const answered = Object.keys(state.answers).length;
  stats.textContent = `${quiz.questions.length} questões · ${answered} respondidas`;
}

function renderApp(store) {
  const state = store.getState();
  const activeTab = ROUTE_TO_TAB[state.route] || "import";

  for (const tab of document.querySelectorAll("[data-tab]")) {
    tab.classList.toggle("active", tab.dataset.tab === activeTab);
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
}

function start() {
  const store = createStore(initialState());

  const switchRoute = route => {
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

start();
