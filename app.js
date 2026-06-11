/**
 * Controlador Principal da Aplicação
 */

// Estado Global
const state = {
  activeTab: "import", // "import" | "simulado" | "editor" | "exportar"
  quizData: null,       // Dados JSON do simulado ativo
  userAnswers: {},     // Respostas do usuário { "q-1": "A" }
  currentQuestionIndex: 0,
  currentEditIndex: 0
};

// Seletor de Elementos
const DOM = {
  tabs: document.querySelectorAll(".tab-btn"),
  tabContents: document.querySelectorAll(".tab-content"),
  
  // Import
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  pasteArea: document.getElementById("paste-area"),
  btnParseText: document.getElementById("btn-parse-text"),
  loaderContainer: document.getElementById("loader-container"),
  loaderText: document.getElementById("loader-text"),
  loaderBar: document.getElementById("loader-bar"),
  
  // Simulado Player
  simuladoView: document.getElementById("simulado-view"),
  simuladoPlaceholder: document.getElementById("simulado-placeholder"),
  statsHeader: document.getElementById("stats-header"),
  progressBar: document.getElementById("progress-bar"),
  sidebarNav: document.getElementById("sidebar-nav"),
  questionStage: document.getElementById("question-stage"),
  
  // Editor
  editorView: document.getElementById("editor-view"),
  editorPlaceholder: document.getElementById("editor-placeholder"),
  editorSidebar: document.getElementById("editor-sidebar"),
  editorForm: document.getElementById("editor-form"),
  
  // Exportar
  exportView: document.getElementById("export-view"),
  exportPlaceholder: document.getElementById("export-placeholder"),
  btnDownloadHtml: document.getElementById("btn-download-html"),
  btnDownloadJson: document.getElementById("btn-download-json")
};

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initImport();
  initEditor();
  initExport();
});

// 1. Gerenciador de Abas (Tabs)
function initTabs() {
  DOM.tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.tab;
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  
  DOM.tabs.forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  
  DOM.tabContents.forEach(content => {
    content.classList.toggle("active", content.id === `${tabId}-tab`);
  });
  
  // Ações ao trocar de aba
  if (tabId === "simulado") {
    renderSimulado();
  } else if (tabId === "editor") {
    renderEditor();
  } else if (tabId === "exportar") {
    renderExport();
  }
}

// 2. Módulo de Importação (PDF / Texto)
function initImport() {
  const dz = DOM.dropzone;
  const input = DOM.fileInput;
  
  // Drag and Drop events
  ["dragenter", "dragover"].forEach(eventName => {
    dz.addEventListener(eventName, (e) => {
      e.preventDefault();
      dz.classList.add("drag-over");
    }, false);
  });
  
  ["dragleave", "drop"].forEach(eventName => {
    dz.addEventListener(eventName, (e) => {
      e.preventDefault();
      dz.classList.remove("drag-over");
    }, false);
  });
  
  dz.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0 && files[0].type === "application/pdf") {
      processPDFFile(files[0]);
    } else {
      alert("Por favor, envie um arquivo PDF válido.");
    }
  });
  
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", function() {
    if (this.files.length > 0) {
      processPDFFile(this.files[0]);
    }
  });
  
  // Botão de processar texto colado
  DOM.btnParseText.addEventListener("click", () => {
    const rawText = DOM.pasteArea.value.trim();
    if (!rawText) {
      alert("Por favor, cole o texto do simulado antes de processar.");
      return;
    }
    
    try {
      showLoader(true, "Analisando estrutura do simulado...");
      setTimeout(() => {
        const parsed = QuizParser.parse(rawText);
        loadQuizData(parsed);
        showLoader(false);
        switchTab("simulado");
      }, 300);
    } catch (err) {
      showLoader(false);
      alert("Erro ao processar texto: " + err.message);
    }
  });
}

function showLoader(show, text = "") {
  DOM.loaderContainer.style.display = show ? "block" : "none";
  DOM.loaderText.textContent = text;
  DOM.loaderBar.style.width = "0%";
}

async function processPDFFile(file) {
  try {
    showLoader(true, "Iniciando leitura do PDF...");
    const text = await QuizParser.extractTextFromPDF(file, (current, total) => {
      const pct = Math.round((current / total) * 100);
      DOM.loaderText.textContent = `Lendo PDF: Página ${current} de ${total} (${pct}%)`;
      DOM.loaderBar.style.width = `${pct}%`;
    });
    
    DOM.loaderText.textContent = "Estruturando questões e gabarito...";
    setTimeout(() => {
      const parsed = QuizParser.parse(text);
      // Salva o nome original do arquivo
      parsed.sourceName = file.name;
      loadQuizData(parsed);
      showLoader(false);
      switchTab("simulado");
    }, 200);
    
  } catch (err) {
    showLoader(false);
    alert(err.message);
  }
}

function loadQuizData(data) {
  state.quizData = data;
  state.userAnswers = {};
  state.currentQuestionIndex = 0;
  state.currentEditIndex = 0;
  state.finalized = false;
  
  // Atualiza campo de colagem caso queira ver o texto bruto
  if (data.metadata && data.metadata.intro) {
    DOM.pasteArea.value = data.metadata.intro;
  }
}

// 3. Módulo de Execução do Simulado (Player)
function renderSimulado() {
  if (!state.quizData || state.quizData.questions.length === 0) {
    DOM.simuladoView.style.display = "none";
    DOM.simuladoPlaceholder.style.display = "flex";
    return;
  }
  
  DOM.simuladoView.style.display = "grid";
  DOM.simuladoPlaceholder.style.display = "none";
  
  updateSimuladoStats();
  renderSimuladoSidebar();
  renderActiveQuestion();
}

function updateSimuladoStats() {
  const questions = state.quizData.questions;
  const total = questions.length;
  const answered = Object.keys(state.userAnswers).length;
  
  let correct = 0;
  let wrong = 0;
  
  questions.forEach(q => {
    const ans = state.userAnswers[q.id];
    if (ans) {
      if (ans === q.feedback.correctOption) {
        correct++;
      } else {
        wrong++;
      }
    }
  });
  
  const pctCorrect = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const pctProgress = Math.round((answered / total) * 100);
  
  DOM.statsHeader.innerHTML = `
    <div class="stat-item">
      <div class="stat-value primary">${total}</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${answered}</div>
      <div class="stat-label">Respondidas</div>
    </div>
    <div class="stat-item">
      <div class="stat-value success">${correct}</div>
      <div class="stat-label">Acertos</div>
    </div>
    <div class="stat-item">
      <div class="stat-value error">${wrong}</div>
      <div class="stat-label">Erros</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${pctCorrect}%</div>
      <div class="stat-label">Aproveitamento</div>
    </div>
  `;
  
  DOM.progressBar.style.width = `${pctProgress}%`;
}

function renderSimuladoSidebar() {
  const questions = state.quizData.questions;
  let html = "";
  
  if (state.finalized) {
    const isGabaritoActive = state.currentQuestionIndex === -1;
    html += `
      <button class="nav-quest-btn ${isGabaritoActive ? 'active' : ''}" onclick="selectQuestion(-1)" style="margin-bottom: 12px; font-weight: 700; background: rgba(6, 182, 212, 0.05);">
        <span>📊 Gabarito Geral</span>
      </button>
    `;
  }
  
  html += questions.map((q, idx) => {
    const isCurrent = idx === state.currentQuestionIndex;
    const ans = state.userAnswers[q.id];
    let badgeHtml = `<span class="badge badge-todo">Aberto</span>`;
    
    if (ans) {
      if (ans === q.feedback.correctOption) {
        badgeHtml = `<span class="badge badge-correct">Acerto</span>`;
      } else {
        badgeHtml = `<span class="badge badge-wrong">Erro</span>`;
      }
    }
    
    return `
      <button class="nav-quest-btn ${isCurrent ? 'active' : ''}" onclick="selectQuestion(${idx})">
        <strong>Questão ${q.number}</strong>
        ${badgeHtml}
      </button>
    `;
  }).join("");

  if (!state.finalized && Object.keys(state.userAnswers).length > 0) {
    html += `
      <button class="btn btn-danger" style="margin-top: 16px; width: 100%; font-size: 0.8rem;" onclick="finalizeQuiz()">
        Finalizar Simulado
      </button>
    `;
  } else if (state.finalized) {
    html += `
      <button class="btn btn-secondary" style="margin-top: 16px; width: 100%; font-size: 0.8rem;" onclick="resetQuiz()">
        Refazer Simulado
      </button>
    `;
  }
  
  DOM.sidebarNav.innerHTML = html;
}

// Vincula ao escopo global para o onclick dos botões da sidebar
window.selectQuestion = function(idx) {
  state.currentQuestionIndex = idx;
  renderSimuladoSidebar();
  renderActiveQuestion();
};

window.finalizeQuiz = function() {
  state.finalized = true;
  state.currentQuestionIndex = -1; // Exibe o gabarito geral
  renderSimulado();
};

window.resetQuiz = function() {
  state.finalized = false;
  state.userAnswers = {};
  state.currentQuestionIndex = 0;
  renderSimulado();
};

function renderActiveQuestion() {
  if (state.currentQuestionIndex === -1) {
    renderGabaritoGeral();
    return;
  }

  const q = state.quizData.questions[state.currentQuestionIndex];
  const ans = state.userAnswers[q.id];
  const isAnswered = !!ans;
  
  // Prompt e cabeçalhos
  let html = `
    <div class="question-header">
      <div class="question-kicker">
        Questão ${q.number} · <span>${q.type}</span>
      </div>
      <h2 class="question-title">${q.topic}</h2>
    </div>
    <div class="question-prompt">${escapeHtml(q.prompt)}</div>
  `;
  
  // Alternativas
  html += `<div class="options-list">`;
  q.options.forEach(o => {
    let optClass = "";
    if (ans === o.label) {
      optClass = "selected";
    }
    
    // Se respondeu e há gabarito estruturado, colore correto/incorreto
    if (isAnswered && q.feedback.correctOption) {
      if (o.label === q.feedback.correctOption) {
        optClass = "correct";
      } else if (ans === o.label) {
        optClass = "wrong";
      }
    }
    
    html += `
      <button class="option-item ${optClass}" onclick="answerQuestion('${q.id}', '${o.label}')" ${isAnswered ? 'disabled' : ''}>
        <span class="option-letter">${o.label}</span>
        <span>${escapeHtml(o.text)}</span>
      </button>
    `;
  });
  html += `</div>`;
  
  // Explicações e Feedback
  if (isAnswered) {
    html += `<div class="feedback-panel">`;
    
    const isCorrect = ans === q.feedback.correctOption;
    
    if (q.feedback.correctOption) {
      html += `
        <div class="feedback-section ${isCorrect ? 'correct-banner' : 'wrong-banner'}">
          <div class="feedback-title ${isCorrect ? 'green' : 'red'}">
            ${isCorrect ? '✨ Resposta Correta!' : `❌ Resposta Incorreta. (A alternativa correta é ${q.feedback.correctOption})`}
          </div>
          ${q.feedback.correctReason ? `<div class="feedback-text"><strong>Justificativa da Correta:</strong> ${escapeHtml(q.feedback.correctReason)}</div>` : ''}
        </div>
      `;
    }
    
    // Feedback específico de alternativa incorreta do usuário
    const specificFb = q.feedback.optionFeedback[ans];
    if (specificFb) {
      html += `
        <div class="feedback-section">
          <div class="feedback-title amber">Feedback sobre a sua alternativa (${ans}):</div>
          <div class="feedback-text">${escapeHtml(specificFb)}</div>
        </div>
      `;
    }
    
    // Explicação geral sobre as incorretas
    if (q.feedback.incorrectReason && !specificFb) {
      html += `
        <div class="feedback-section">
          <div class="feedback-title">Análise das outras alternativas:</div>
          <div class="feedback-text">${escapeHtml(q.feedback.incorrectReason)}</div>
        </div>
      `;
    }
    
    // Ponto-chave
    if (q.feedback.keyPoint) {
      html += `
        <div class="feedback-section">
          <div class="feedback-title green">📌 Ponto-chave para revisão:</div>
          <div class="feedback-text">${escapeHtml(q.feedback.keyPoint)}</div>
        </div>
      `;
    }
    
    // Take-home message
    if (q.takeHome) {
      html += `
        <div class="feedback-section">
          <div class="feedback-title">🎯 Take home message:</div>
          <div class="feedback-text">${escapeHtml(q.takeHome)}</div>
        </div>
      `;
    }
    
    html += `</div>`;
  }
  
  // Controles de navegação inferior
  const isFirst = state.currentQuestionIndex === 0;
  const isLast = state.currentQuestionIndex === state.quizData.questions.length - 1;
  
  html += `
    <div class="stage-controls">
      <button class="btn btn-secondary" onclick="prevQuestion()" ${isFirst ? 'disabled' : ''}>Anterior</button>
      ${state.finalized 
        ? `<button class="btn btn-secondary btn-primary" onclick="selectQuestion(-1)">📊 Gabarito Geral</button>` 
        : (isAnswered ? `<button class="btn btn-secondary" onclick="clearAnswer('${q.id}')">Limpar Resposta</button>` : '<div></div>')
      }
      <button class="btn btn-primary" onclick="nextQuestion()" ${isLast ? 'disabled' : ''}>Próxima</button>
    </div>
  `;
  
  DOM.questionStage.innerHTML = html;
}

function renderGabaritoGeral() {
  let html = `
    <div style="margin-bottom: 24px; border-bottom: 1px solid var(--border-muted); padding-bottom: 16px;">
      <h2 class="question-title" style="font-size: 1.6rem; color: #fff;">📊 Gabarito Geral & Revisão</h2>
      <p style="color: var(--text-muted); font-size: 0.9rem;">Revise abaixo as explicações de todas as alternativas e memorize os pontos-chave.</p>
    </div>
    <div style="display: flex; flex-direction: column; gap: 32px;">
  `;
  
  state.quizData.questions.forEach(q => {
    const ans = state.userAnswers[q.id];
    const isCorrect = ans === q.feedback.correctOption;
    const hasAnswered = !!ans;
    
    let statusText = "NÃO RESPONDIDA";
    let statusColor = "var(--text-muted)";
    let borderStyle = "border-color: var(--border-muted);";
    
    if (hasAnswered) {
      if (isCorrect) {
        statusText = "CORRETA";
        statusColor = "var(--success)";
        borderStyle = "border-color: var(--success); box-shadow: 0 0 15px rgba(16, 185, 129, 0.05);";
      } else {
        statusText = `INCORRETA (Marcou ${ans})`;
        statusColor = "var(--error)";
        borderStyle = "border-color: var(--error); box-shadow: 0 0 15px rgba(239, 68, 68, 0.05);";
      }
    }
    
    html += `
      <div class="feedback-section" style="${borderStyle} background: rgba(255,255,255,0.01); padding: 24px; border-radius: var(--radius-md);">
        <div class="question-kicker" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span>Questão ${q.number} · ${q.type}</span>
          <strong style="color: ${statusColor}; font-size: 0.8rem; letter-spacing: 0.05em;">${statusText}</strong>
        </div>
        <h3 style="color: #fff; font-size: 1.15rem; margin-bottom: 12px; font-weight: 600;">${q.topic}</h3>
        <p style="font-size: 0.95rem; margin-bottom: 20px; white-space: pre-wrap; color: #d1d5db; line-height: 1.6;">${escapeHtml(q.prompt)}</p>
        
        <div class="options-list" style="margin-bottom: 16px;">
    `;
    
    q.options.forEach(o => {
      let optClass = "";
      if (ans === o.label) optClass = "selected";
      
      if (q.feedback.correctOption) {
        if (o.label === q.feedback.correctOption) {
          optClass = "correct";
        } else if (ans === o.label) {
          optClass = "wrong";
        }
      }
      
      html += `
        <div class="option-item ${optClass}" style="cursor: default; pointer-events: none;">
          <span class="option-letter">${o.label}</span>
          <span>${escapeHtml(o.text)}</span>
        </div>
      `;
      
      // Justificativas específicas por alternativa
      if (o.label === q.feedback.correctOption && q.feedback.correctReason) {
        html += `
          <div style="margin: -6px 0 16px 48px; padding: 12px 16px; background: rgba(16, 185, 129, 0.04); border-left: 3px solid var(--success); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 0.875rem;">
            <strong style="color: var(--success); display: block; margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">✅ Por que é CORRETA:</strong>
            <span style="color: #e5e7eb; line-height: 1.5;">${escapeHtml(q.feedback.correctReason)}</span>
          </div>
        `;
      } else {
        const specFb = q.feedback.optionFeedback[o.label];
        if (specFb) {
          html += `
            <div style="margin: -6px 0 16px 48px; padding: 12px 16px; background: rgba(255, 255, 255, 0.02); border-left: 3px solid var(--text-muted); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 0.875rem;">
              <strong style="color: var(--text-muted); display: block; margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">❌ Análise da Alternativa ${o.label}:</strong>
              <span style="color: #d1d5db; line-height: 1.5;">${escapeHtml(specFb)}</span>
            </div>
          `;
        } else if (ans === o.label && q.feedback.incorrectReason) {
          html += `
            <div style="margin: -6px 0 16px 48px; padding: 12px 16px; background: rgba(239, 68, 68, 0.04); border-left: 3px solid var(--error); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 0.875rem;">
              <strong style="color: var(--error); display: block; margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">❌ Por que é INCORRETA:</strong>
              <span style="color: #e5e7eb; line-height: 1.5;">${escapeHtml(q.feedback.incorrectReason)}</span>
            </div>
          `;
        }
      }
    });
    
    html += `</div>`;
    
    // Se tiver incorrectReason geral e nenhum feedback de opção específico
    const hasSpecFbAny = q.options.some(o => q.feedback.optionFeedback[o.label]);
    if (q.feedback.incorrectReason && !hasSpecFbAny) {
      html += `
        <div style="margin-bottom: 16px; padding: 12px 16px; background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-sm); font-size: 0.875rem; border-left: 3px dashed var(--text-muted);">
          <strong style="color: var(--text-muted); display: block; margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">Justificativa das Alternativas Incorretas:</strong>
          <span style="color: #d1d5db; line-height: 1.5;">${escapeHtml(q.feedback.incorrectReason)}</span>
        </div>
      `;
    }

    // Ponto-chave e Take-home
    if (q.feedback.keyPoint || q.takeHome) {
      html += `<div style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 16px;">`;
      if (q.feedback.keyPoint) {
        html += `
          <div style="padding: 12px 16px; background: rgba(6, 182, 212, 0.03); border-left: 3px solid var(--primary); border-radius: var(--radius-sm); font-size: 0.875rem;">
            <strong style="color: var(--primary); display: block; margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">📌 Ponto-chave para revisão:</strong>
            <span style="color: #e5e7eb; line-height: 1.5;">${escapeHtml(q.feedback.keyPoint)}</span>
          </div>
        `;
      }
      if (q.takeHome) {
        html += `
          <div style="padding: 12px 16px; background: rgba(245, 158, 11, 0.03); border-left: 3px solid var(--warning); border-radius: var(--radius-sm); font-size: 0.875rem;">
            <strong style="color: var(--warning); display: block; margin-bottom: 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">🎯 Take home message:</strong>
            <span style="color: #e5e7eb; line-height: 1.5;">${escapeHtml(q.takeHome)}</span>
          </div>
        `;
      }
      html += `</div>`;
    }
    
    html += `</div>`;
  });
  
  html += `
    </div>
    <div class="stage-controls" style="margin-top: 30px;">
      <button class="btn btn-secondary" onclick="resetQuiz()">Refazer Simulado</button>
      <div></div>
      <div></div>
    </div>
  `;
  
  DOM.questionStage.innerHTML = html;
}

window.answerQuestion = function(qId, optionLabel) {
  state.userAnswers[qId] = optionLabel;
  updateSimuladoStats();
  renderSimuladoSidebar();
  renderActiveQuestion();
};

window.clearAnswer = function(qId) {
  delete state.userAnswers[qId];
  updateSimuladoStats();
  renderSimuladoSidebar();
  renderActiveQuestion();
};

window.prevQuestion = function() {
  if (state.currentQuestionIndex > 0) {
    state.currentQuestionIndex--;
    renderSimuladoSidebar();
    renderActiveQuestion();
  }
};

window.nextQuestion = function() {
  if (state.currentQuestionIndex < state.quizData.questions.length - 1) {
    state.currentQuestionIndex++;
    renderSimuladoSidebar();
    renderActiveQuestion();
  }
};

// 4. Módulo do Editor de Questões
function initEditor() {
  DOM.editorForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveActiveEditQuestion();
  });
}

function renderEditor() {
  if (!state.quizData || state.quizData.questions.length === 0) {
    DOM.editorView.style.display = "none";
    DOM.editorPlaceholder.style.display = "flex";
    return;
  }
  
  DOM.editorView.style.display = "grid";
  DOM.editorPlaceholder.style.display = "none";
  
  renderEditorSidebar();
  loadQuestionInEditor();
}

function renderEditorSidebar() {
  const questions = state.quizData.questions;
  DOM.editorSidebar.innerHTML = questions.map((q, idx) => {
    const isCurrent = idx === state.currentEditIndex;
    return `
      <button class="editor-nav-btn ${isCurrent ? 'active' : ''}" onclick="selectEditorQuestion(${idx})">
        <strong>Questão ${q.number}</strong>: ${escapeHtml(q.topic)}
      </button>
    `;
  }).join("");
}

window.selectEditorQuestion = function(idx) {
  // Salva alterações da anterior antes de carregar a nova
  saveActiveEditQuestion();
  
  state.currentEditIndex = idx;
  renderEditorSidebar();
  loadQuestionInEditor();
};

function loadQuestionInEditor() {
  const q = state.quizData.questions[state.currentEditIndex];
  
  // Preenche metadados/cabeçalhos
  document.getElementById("edit-topic").value = q.topic || "";
  document.getElementById("edit-type").value = q.type || "";
  document.getElementById("edit-prompt").value = q.prompt || "";
  
  // Preenche as 4 primeiras alternativas (padrão do formulário)
  for (let letter of ['A', 'B', 'C', 'D']) {
    const opt = q.options.find(o => o.label === letter);
    document.getElementById(`edit-opt-${letter.toLowerCase()}`).value = opt ? opt.text : "";
  }
  
  // Preenche gabarito e feedbacks
  document.getElementById("edit-correct").value = q.feedback.correctOption || "";
  document.getElementById("edit-reason-correct").value = q.feedback.correctReason || "";
  document.getElementById("edit-reason-incorrect").value = q.feedback.incorrectReason || "";
  document.getElementById("edit-keypoint").value = q.feedback.keyPoint || "";
  document.getElementById("edit-takehome").value = q.takeHome || "";
}

function saveActiveEditQuestion() {
  if (!state.quizData || state.quizData.questions.length === 0) return;
  
  const q = state.quizData.questions[state.currentEditIndex];
  
  q.topic = document.getElementById("edit-topic").value.trim();
  q.type = document.getElementById("edit-type").value.trim();
  q.prompt = document.getElementById("edit-prompt").value.trim();
  
  // Atualiza alternativas
  q.options = ['A', 'B', 'C', 'D'].map(letter => {
    return {
      label: letter,
      text: document.getElementById(`edit-opt-${letter.toLowerCase()}`).value.trim()
    };
  }).filter(opt => opt.text.length > 0); // remove vazias se houver menos alternativas
  
  q.feedback.correctOption = document.getElementById("edit-correct").value.toUpperCase();
  q.feedback.correctReason = document.getElementById("edit-reason-correct").value.trim();
  q.feedback.incorrectReason = document.getElementById("edit-reason-incorrect").value.trim();
  q.feedback.keyPoint = document.getElementById("edit-keypoint").value.trim();
  q.takeHome = document.getElementById("edit-takehome").value.trim();
}

// 5. Módulo de Exportação
function initExport() {
  DOM.btnDownloadJson.addEventListener("click", () => {
    if (!state.quizData) return;
    
    // Sincroniza o editor atual
    saveActiveEditQuestion();
    
    const jsonStr = JSON.stringify(state.quizData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = state.quizData.sourceName 
      ? state.quizData.sourceName.replace(/\.[^/.]+$/, "") + "-dados.json" 
      : "simulado-dados.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  
  DOM.btnDownloadHtml.addEventListener("click", () => {
    if (!state.quizData) return;
    
    // Sincroniza o editor atual
    saveActiveEditQuestion();
    
    const htmlOutput = generateSelfContainedHtml(state.quizData);
    const blob = new Blob([htmlOutput], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = state.quizData.sourceName 
      ? state.quizData.sourceName.replace(/\.[^/.]+$/, "") + "-site.html" 
      : "simulado-site.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function renderExport() {
  if (!state.quizData || state.quizData.questions.length === 0) {
    DOM.exportView.style.display = "none";
    DOM.exportPlaceholder.style.display = "flex";
    return;
  }
  
  DOM.exportView.style.display = "block";
  DOM.exportPlaceholder.style.display = "none";
}

function generateSelfContainedHtml(quizData) {
  const jsonDataEscaped = JSON.stringify(quizData)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(quizData.metadata.title)}</title>
  <style>
    /* Estilos Premium Autocontidos */
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
    
    :root {
      --bg-app: #090d16;
      --bg-card: rgba(17, 24, 39, 0.85);
      --border-muted: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-inverse: #030712;
      --primary: #06b6d4;
      --primary-dark: #0891b2;
      --primary-light: rgba(6, 182, 212, 0.1);
      --success: #10b981;
      --success-light: rgba(16, 185, 129, 0.15);
      --success-border: rgba(16, 185, 129, 0.3);
      --error: #ef4444;
      --error-light: rgba(239, 68, 68, 0.15);
      --error-border: rgba(239, 68, 68, 0.3);
      --warning: #f59e0b;
      --font-sans: 'Plus Jakarta Sans', sans-serif;
      --radius-sm: 8px;
      --radius-md: 12px;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-app);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.6;
      background-image: 
        radial-gradient(at 0% 0%, rgba(6, 182, 212, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
      background-attachment: fixed;
    }
    header {
      backdrop-filter: blur(12px);
      background-color: rgba(9, 13, 22, 0.8);
      border-bottom: 1px solid var(--border-muted);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo-container { display: flex; align-items: center; gap: 12px; }
    .logo-icon {
      background: linear-gradient(135deg, var(--primary), var(--success));
      color: var(--text-inverse);
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 1.15rem;
    }
    .logo-text h1 { font-size: 1.15rem; font-weight: 700; color: #fff; }
    .logo-text p { font-size: 0.7rem; color: var(--text-muted); }
    
    .container { flex: 1; max-width: 1200px; width: 100%; margin: 0 auto; padding: 24px; }
    
    /* Stats */
    .stats-header {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius-sm);
      padding: 10px;
      text-align: center;
    }
    .stat-value { font-size: 1.35rem; font-weight: 700; color: #fff; }
    .stat-value.success { color: var(--success); }
    .stat-value.error { color: var(--error); }
    .stat-value.primary { color: var(--primary); }
    .stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; }
    
    .progress-outer { width: 100%; height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden; margin-bottom: 24px; }
    .progress-inner { width: 0%; height: 100%; background: var(--primary); transition: width 0.3s ease; }
    
    /* Layout Grid */
    .grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
    @media(min-width: 850px) {
      .grid { grid-template-columns: 260px minmax(0, 1fr); }
    }
    
    /* Navigation Sidebar */
    .sidebar { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow-y: auto; }
    @media(max-width: 849px) {
      .sidebar { flex-direction: row; overflow-x: auto; padding-bottom: 6px; }
    }
    .nav-btn {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-muted);
      color: var(--text-main);
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-family: inherit;
      font-weight: 600;
      font-size: 0.85rem;
    }
    @media(max-width: 849px) {
      .nav-btn { flex-shrink: 0; min-width: 110px; flex-direction: column; align-items: flex-start; }
    }
    .nav-btn:hover { background: rgba(255, 255, 255, 0.05); }
    .nav-btn.active { background: rgba(6, 182, 212, 0.08); border-color: var(--primary); }
    .badge { font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
    .badge-todo { background: rgba(255, 255, 255, 0.08); color: var(--text-muted); }
    .badge-correct { background: var(--success-light); color: var(--success); border: 1px solid var(--success-border); }
    .badge-wrong { background: var(--error-light); color: var(--error); border: 1px solid var(--error-border); }
    
    /* Stage */
    .stage { background: var(--bg-card); border: 1px solid var(--border-muted); border-radius: var(--radius-md); padding: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
    .q-kicker { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--primary); margin-bottom: 6px; }
    .q-kicker span { background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: var(--text-muted); }
    .q-title { font-size: 1.35rem; font-weight: 700; color: #fff; margin-bottom: 16px; }
    .q-prompt { font-size: 1rem; line-height: 1.6; color: #e5e7eb; margin-bottom: 24px; white-space: pre-wrap; }
    
    /* Options */
    .options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
    .option {
      width: 100%;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius-sm);
      padding: 14px 18px;
      color: var(--text-main);
      text-align: left;
      cursor: pointer;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      font-family: inherit;
      font-size: 0.95rem;
      line-height: 1.4;
      transition: all 0.15s ease;
    }
    .option:hover:not(:disabled) { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.15); transform: translateX(3px); }
    .option-letter {
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.04);
      display: grid;
      place-items: center;
      font-weight: 700;
      border: 1px solid var(--border-muted);
    }
    .option.selected { border-color: var(--warning); background: rgba(245, 158, 11, 0.03); }
    .option.selected .option-letter { background: var(--warning); color: var(--text-inverse); border-color: var(--warning); }
    .option.correct { border-color: var(--success); background: rgba(16, 185, 129, 0.08); }
    .option.correct .option-letter { background: var(--success); color: var(--text-inverse); border-color: var(--success); }
    .option.wrong { border-color: var(--error); background: rgba(239, 68, 68, 0.08); }
    .option.wrong .option-letter { background: var(--error); color: #fff; border-color: var(--error); }
    
    /* Feedback Panels */
    .fb-panel { margin-top: 20px; animation: slideIn 0.25s ease; }
    .fb-section { border-radius: var(--radius-sm); border: 1px solid var(--border-muted); padding: 16px; margin-bottom: 12px; background: rgba(255, 255, 255, 0.01); }
    .fb-section.correct { background: rgba(16, 185, 129, 0.03); border-color: var(--success-border); }
    .fb-section.wrong { background: rgba(239, 68, 68, 0.03); border-color: var(--error-border); }
    .fb-title { font-weight: 700; font-size: 1rem; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .fb-title.green { color: var(--success); }
    .fb-title.red { color: var(--error); }
    .fb-title.amber { color: var(--warning); }
    .fb-text { font-size: 0.9rem; color: #d1d5db; line-height: 1.5; }
    
    /* Controls */
    .controls { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-muted); padding-top: 16px; margin-top: 20px; }
    .btn {
      font-family: inherit;
      font-weight: 600;
      font-size: 0.85rem;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 0;
      transition: all 0.15s ease;
    }
    .btn-primary { background: var(--primary); color: var(--text-inverse); }
    .btn-primary:hover:not(:disabled) { background: var(--primary-dark); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: rgba(255, 255, 255, 0.05); color: var(--text-main); border: 1px solid var(--border-muted); }
    .btn-secondary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
    .btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-danger { background: var(--error); color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    
    @keyframes slideIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <header>
    <div class="logo-container">
      <div class="logo-icon">Q</div>
      <div class="logo-text">
        <h1 id="header-title">Med<span style="background: linear-gradient(135deg, var(--primary), #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Up</span></h1>
        <p>MedUp Interativo Offline</p>
      </div>
    </div>
  </header>
  
  <main class="container">
    <div class="stats-header" id="stats-area"></div>
    <div class="progress-outer">
      <div class="progress-inner" id="pb"></div>
    </div>
    
    <div class="grid">
      <nav class="sidebar" id="side-nav"></nav>
      <section class="stage" id="stage-area"></section>
    </div>
  </main>

  <script id="quiz-data" type="application/json">${jsonDataEscaped}</script>
  
  <script>
    (function() {
      const quiz = JSON.parse(document.getElementById("quiz-data").textContent);
      const state = {
        i: 0,
        answers: {},
        finalized: false
      };
      
      const elements = {
        headerTitle: document.getElementById("header-title"),
        statsArea: document.getElementById("stats-area"),
        pb: document.getElementById("pb"),
        sideNav: document.getElementById("side-nav"),
        stageArea: document.getElementById("stage-area")
      };
      
      function init() {
        if (quiz.metadata.title) {
          elements.headerTitle.textContent = quiz.metadata.title;
        } else {
          elements.headerTitle.innerHTML = 'Med<span style="background: linear-gradient(135deg, var(--primary), #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Up</span>';
        }
        render();
      }
      
      function render() {
        const total = quiz.questions.length;
        const answered = Object.keys(state.answers).length;
        
        let correct = 0;
        let wrong = 0;
        
        quiz.questions.forEach(q => {
          const ans = state.answers[q.id];
          if(ans) {
            if(ans === q.feedback.correctOption) correct++;
            else wrong++;
          }
        });
        
        const pctCorrect = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        const pctProgress = Math.round((answered / total) * 100);
        
        // Render stats
        elements.statsArea.innerHTML = \`
          <div class="stat-item">
            <div class="stat-value primary">\${total}</div>
            <div class="stat-label">Questões</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${answered}</div>
            <div class="stat-label">Respondidas</div>
          </div>
          <div class="stat-item">
            <div class="stat-value success">\${correct}</div>
            <div class="stat-label">Acertos</div>
          </div>
          <div class="stat-item">
            <div class="stat-value error">\${wrong}</div>
            <div class="stat-label">Erros</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${pctCorrect}%</div>
            <div class="stat-label">Aproveitamento</div>
          </div>
        \`;
        
        elements.pb.style.width = \`\${pctProgress}%\`;
        
        // Render Nav Sidebar
        let sideHtml = "";
        if (state.finalized) {
          const isGabaritoActive = state.i === -1;
          sideHtml += \`<button class="nav-btn \${isGabaritoActive ? 'active':''}" data-idx="-1" style="margin-bottom: 12px; font-weight: 700; background: rgba(6, 182, 212, 0.05);">
            <span>📊 Gabarito Geral</span>
          </button>\`;
        }
        
        sideHtml += quiz.questions.map((q, idx) => {
          const isCurrent = idx === state.i;
          const ans = state.answers[q.id];
          let badge = '<span class="badge badge-todo">Aberto</span>';
          if(ans) {
            if(ans === q.feedback.correctOption) badge = '<span class="badge badge-correct">Acerto</span>';
            else badge = '<span class="badge badge-wrong">Erro</span>';
          }
          return \`<button class="nav-btn \${isCurrent ? 'active':''}" data-idx="\${idx}">
            <strong>Questão \${q.number}</strong>
            \${badge}
          </button>\`;
        }).join("");

        if (!state.finalized && answered > 0) {
          sideHtml += \`<button class="btn btn-danger" id="side-finalize" style="margin-top: 16px; width: 100%; font-size: 0.8rem;">Finalizar Simulado</button>\`;
        } else if (state.finalized) {
          sideHtml += \`<button class="btn btn-secondary" id="side-reset" style="margin-top: 16px; width: 100%; font-size: 0.8rem;">Refazer Simulado</button>\`;
        }
        
        elements.sideNav.innerHTML = sideHtml;
        
        elements.sideNav.querySelectorAll("[data-idx]").forEach(btn => {
          btn.addEventListener("click", () => {
            state.i = parseInt(btn.dataset.idx);
            render();
          });
        });

        const sideFinalize = document.getElementById("side-finalize");
        if (sideFinalize) {
          sideFinalize.addEventListener("click", () => {
            state.finalized = true;
            state.i = -1;
            render();
          });
        }
        const sideReset = document.getElementById("side-reset");
        if (sideReset) {
          sideReset.addEventListener("click", () => {
            state.finalized = false;
            state.answers = {};
            state.i = 0;
            render();
          });
        }
        
        // Render question stage or Gabarito Geral
        if (state.i === -1) {
          renderGabaritoGeral();
        } else {
          renderActiveQuestion();
        }
      }

      function renderGabaritoGeral() {
        let html = \`
          <div style="margin-bottom: 20px; border-bottom: 1px solid var(--border-muted); padding-bottom: 12px;">
            <h2 class="q-title" style="font-size: 1.5rem; color: #fff;">📊 Gabarito Geral & Revisão</h2>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Revise abaixo as justificativas de todas as alternativas.</p>
          </div>
          <div style="display: flex; flex-direction: column; gap: 24px;">
        \`;

        quiz.questions.forEach(q => {
          const ans = state.answers[q.id];
          const isCorrect = ans === q.feedback.correctOption;
          const hasAnswered = !!ans;
          
          let statusText = "NÃO RESPONDIDA";
          let statusColor = "var(--text-muted)";
          let borderStyle = "border-color: var(--border-muted);";
          
          if (hasAnswered) {
            if (isCorrect) {
              statusText = "CORRETA";
              statusColor = "var(--success)";
              borderStyle = "border-color: var(--success);";
            } else {
              statusText = \`INCORRETA (Marcou \${ans})\`;
              statusColor = "var(--error)";
              borderStyle = "border-color: var(--error);";
            }
          }

          html += \`
            <div class="fb-section" style="\${borderStyle} background: rgba(255,255,255,0.015); padding: 18px; border-radius: var(--radius-md); border-width: 1px; border-style: solid;">
              <div class="q-kicker" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>Questão \${q.number} · \${q.type || 'Clínica'}</span>
                <strong style="color: \${statusColor}; font-size: 0.75rem; letter-spacing: 0.05em;">\${statusText}</strong>
              </div>
              <h3 style="color: #fff; font-size: 1.1rem; margin-bottom: 10px; font-weight: 600;">\${q.topic}</h3>
              <p style="font-size: 0.9rem; margin-bottom: 16px; white-space: pre-wrap; color: #d1d5db;">\${escapeText(q.prompt)}</p>
              
              <div class="options" style="margin-bottom: 12px; gap: 8px;">
          \`;

          q.options.forEach(o => {
            let optClass = "";
            if (ans === o.label) optClass = "selected";
            
            if (q.feedback.correctOption) {
              if (o.label === q.feedback.correctOption) {
                optClass = "correct";
              } else if (ans === o.label) {
                optClass = "wrong";
              }
            }

            html += \`
              <div class="option \${optClass}" style="cursor: default; pointer-events: none; padding: 10px 14px; font-size: 0.9rem;">
                <span class="option-letter">\${o.label}</span>
                <span>\${escapeText(o.text)}</span>
              </div>
            \`;

            if (o.label === q.feedback.correctOption && q.feedback.correctReason) {
              html += \`
                <div style="margin: -4px 0 12px 40px; padding: 8px 12px; background: rgba(16, 185, 129, 0.04); border-left: 3px solid var(--success); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 0.8rem;">
                  <strong style="color: var(--success); display: block; margin-bottom: 2px;">Por que é CORRETA:</strong>
                  <span style="color: #e5e7eb;">\${escapeText(q.feedback.correctReason)}</span>
                </div>
              \`;
            } else {
              const specFb = q.feedback.optionFeedback ? q.feedback.optionFeedback[o.label] : null;
              if (specFb) {
                html += \`
                  <div style="margin: -4px 0 12px 40px; padding: 8px 12px; background: rgba(255, 255, 255, 0.02); border-left: 3px solid var(--text-muted); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 0.8rem;">
                    <strong style="color: var(--text-muted); display: block; margin-bottom: 2px;">Análise da Alternativa \${o.label}:</strong>
                    <span style="color: #d1d5db;">\${escapeText(specFb)}</span>
                  </div>
                \`;
              } else if (ans === o.label && q.feedback.incorrectReason) {
                html += \`
                  <div style="margin: -4px 0 12px 40px; padding: 8px 12px; background: rgba(239, 68, 68, 0.04); border-left: 3px solid var(--error); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 0.8rem;">
                    <strong style="color: var(--error); display: block; margin-bottom: 2px;">Por que é INCORRETA:</strong>
                    <span style="color: #e5e7eb;">\${escapeText(q.feedback.incorrectReason)}</span>
                  </div>
                \`;
              }
            }
          });

          html += \`</div>\`;

          const hasSpecFbAny = q.options.some(o => q.feedback.optionFeedback && q.feedback.optionFeedback[o.label]);
          if (q.feedback.incorrectReason && !hasSpecFbAny) {
            html += \`
              <div style="margin-bottom: 12px; padding: 10px 12px; background: rgba(255, 255, 255, 0.01); border-radius: var(--radius-sm); font-size: 0.8rem; border-left: 3px dashed var(--text-muted);">
                <strong style="color: var(--text-muted); display: block; margin-bottom: 2px;">Justificativa das Alternativas Incorretas:</strong>
                <span style="color: #d1d5db;">\${escapeText(q.feedback.incorrectReason)}</span>
              </div>
            \`;
          }

          if (q.feedback.keyPoint || q.takeHome) {
            html += \`<div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 12px;">\`;
            if (q.feedback.keyPoint) {
              html += \`
                <div style="padding: 8px 12px; background: rgba(6, 182, 212, 0.03); border-left: 3px solid var(--primary); border-radius: var(--radius-sm); font-size: 0.8rem;">
                  <strong style="color: var(--primary); display: block; margin-bottom: 2px;">📌 Ponto-chave:</strong>
                  <span style="color: #e5e7eb;">\${escapeText(q.feedback.keyPoint)}</span>
                </div>
              \`;
            }
            if (q.takeHome) {
              html += \`
                <div style="padding: 8px 12px; background: rgba(245, 158, 11, 0.03); border-left: 3px solid var(--warning); border-radius: var(--radius-sm); font-size: 0.8rem;">
                  <strong style="color: var(--warning); display: block; margin-bottom: 2px;">🎯 Take home message:</strong>
                  <span style="color: #e5e7eb;">\${escapeText(q.takeHome)}</span>
                </div>
              \`;
            }
            html += \`</div>\`;
          }

          html += \`</div>\`;
        });

        html += \`
          </div>
          <div class="controls" style="margin-top: 24px;">
            <button class="btn btn-secondary" id="gabarito-reset-btn">Refazer Simulado</button>
            <div></div>
            <div></div>
          </div>
        \`;

        elements.stageArea.innerHTML = html;

        document.getElementById("gabarito-reset-btn").addEventListener("click", () => {
          state.finalized = false;
          state.answers = {};
          state.i = 0;
          render();
        });
      }
      
      function renderActiveQuestion() {
        const q = quiz.questions[state.i];
        const ans = state.answers[q.id];
        const isAnswered = !!ans;
        
        let html = \`
          <div class="q-kicker">Questão \${q.number} · <span>\${q.type || 'Clínica'}</span></div>
          <h2 class="q-title">\${escapeText(q.topic)}</h2>
          <div class="q-prompt">\${escapeText(q.prompt)}</div>
          
          <div class="options">
        \`;
        
        q.options.forEach(o => {
          let optClass = "";
          if(ans === o.label) optClass = "selected";
          
          if(isAnswered && q.feedback.correctOption) {
            if(o.label === q.feedback.correctOption) optClass = "correct";
            else if(ans === o.label) optClass = "wrong";
          }
          
          html += \`
            <button class="option \${optClass}" data-opt="\${o.label}" \${isAnswered ? 'disabled':''}>
              <span class="option-letter">\${o.label}</span>
              <span>\${escapeText(o.text)}</span>
            </button>
          \`;
        });
        
        html += \`</div>\`;
        
        if (isAnswered) {
          html += \`<div class="fb-panel">\`;
          const isCorrect = ans === q.feedback.correctOption;
          
          if(q.feedback.correctOption) {
            html += \`
              <div class="fb-section \${isCorrect ? 'correct':'wrong'}">
                <div class="fb-title \${isCorrect ? 'green':'red'}">
                  \${isCorrect ? '✨ Correto!':'❌ Incorreto. A resposta é ' + q.feedback.correctOption}
                </div>
                \${q.feedback.correctReason ? \`<div class="fb-text"><strong>Justificativa da Correta:</strong> \${escapeText(q.feedback.correctReason)}</div>\`:''}
              </div>
            \`;
          }
          
          const specFb = q.feedback.optionFeedback ? q.feedback.optionFeedback[ans] : null;
          if(specFb) {
            html += \`
              <div class="fb-section">
                <div class="fb-title amber">Feedback sobre a sua alternativa (\${ans}):</div>
                <div class="fb-text">\${escapeText(specFb)}</div>
              </div>
            \`;
          }
          
          if(q.feedback.incorrectReason && !specFb) {
            html += \`
              <div class="fb-section">
                <div class="fb-title">Análise das outras alternativas:</div>
                <div class="fb-text">\${escapeText(q.feedback.incorrectReason)}</div>
              </div>
            \`;
          }
          
          if(q.feedback.keyPoint) {
            html += \`
              <div class="fb-section">
                <div class="fb-title green">📌 Ponto-chave para revisão:</div>
                <div class="fb-text">\${escapeText(q.feedback.keyPoint)}</div>
              </div>
            \`;
          }
          
          if(q.takeHome) {
            html += \`
              <div class="fb-section">
                <div class="fb-title">🎯 Take home message:</div>
                <div class="fb-text">\${escapeText(q.takeHome)}</div>
              </div>
            \`;
          }
          
          html += \`</div>\`;
        }
        
        const isFirst = state.i === 0;
        const isLast = state.i === quiz.questions.length - 1;
        
        html += \`
          <div class="controls">
            <button class="btn btn-secondary" id="btn-prev" \${isFirst ? 'disabled':''}>Anterior</button>
            \${state.finalized
              ? '<button class="btn btn-secondary btn-primary" id="btn-back-gabarito">📊 Gabarito Geral</button>'
              : (isAnswered ? '<button class="btn btn-secondary" id="btn-clear">Limpar resposta</button>' : '<div></div>')
            }
            <button class="btn btn-primary" id="btn-next" \${isLast ? 'disabled':''}>Próxima</button>
          </div>
        \`;
        
        elements.stageArea.innerHTML = html;
        
        // Event Listeners
        elements.stageArea.querySelectorAll("[data-opt]").forEach(btn => {
          btn.addEventListener("click", () => {
            state.answers[q.id] = btn.dataset.opt;
            render();
          });
        });
        
        document.getElementById("btn-prev").addEventListener("click", () => {
          if(state.i > 0) {
            state.i--;
            render();
          }
        });
        
        document.getElementById("btn-next").addEventListener("click", () => {
          if(state.i < quiz.questions.length - 1) {
            state.i++;
            render();
          }
        });
        
        const clearBtn = document.getElementById("btn-clear");
        if(clearBtn) {
          clearBtn.addEventListener("click", () => {
            delete state.answers[q.id];
            render();
          });
        }

        const backGabaritoBtn = document.getElementById("btn-back-gabarito");
        if(backGabaritoBtn) {
          backGabaritoBtn.addEventListener("click", () => {
            state.i = -1;
            render();
          });
        }
      }
      
      function escapeText(text) {
        if(!text) return "";
        return String(text)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }
      
      init();
    })();
  </script>
</body>
</html>`;
}

// Helpers Utilitários
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
