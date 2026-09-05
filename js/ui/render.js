export const ROUTE_TO_TAB = {
  library: "biblioteca",
  import: "import",
  study: "simulado",
  editor: "editor",
  share: "exportar"
};

const ROUTE_META = {
  library: ["Acervo local", "Biblioteca"],
  import: ["Entrada de conteúdo", "Importar questões"],
  study: ["Desempenho acadêmico", "Simulado"],
  editor: ["Curadoria de conteúdo", "Editar questões"],
  share: ["Distribuição privada", "Compartilhar simulado"]
};

export function renderShellState(state) {
  const activeTab = ROUTE_TO_TAB[state.route] || "import";
  for (const tab of document.querySelectorAll("[data-tab]")) {
    const active = tab.dataset.tab === activeTab;
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
    tab.disabled = Boolean(state.readOnly && tab.dataset.tab === "editor");
  }
  for (const section of document.querySelectorAll(".tab-content")) {
    const active = section.id === `${activeTab}-tab`;
    section.classList.toggle("active", active);
    section.hidden = !active;
  }
  const [eyebrow, title] = ROUTE_META[state.route] || ROUTE_META.import;
  document.querySelector("#route-eyebrow").textContent = eyebrow;
  document.querySelector("#route-title").textContent = title;
  document.querySelector("#app-shell").setAttribute("aria-busy", String(state.libraryLoading));
}
