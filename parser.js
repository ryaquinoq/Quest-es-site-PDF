/**
 * Engine de Parsing do Simulado (Execução Client-side Offline)
 */

class QuizParser {
  /**
   * Extrai texto completo de um arquivo PDF usando PDF.js
   * @param {File} file - Objeto File do PDF vindo do input
   * @param {function} progressCallback - Callback opcional para progresso (página atual / total)
   * @returns {Promise<string>} Texto extraído e formatado
   */
  static async extractTextFromPDF(file, progressCallback) {
    if (!window.pdfjsLib) {
      throw new Error("Biblioteca PDF.js não carregada. Certifique-se de estar conectado à internet na primeira execução.");
    }

    // Configura o worker se ainda não estiver
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async function() {
        try {
          const typedarray = new Uint8Array(this.result);
          const loadingTask = window.pdfjsLib.getDocument({ data: typedarray });
          
          const pdf = await loadingTask.promise;
          let fullText = "";
          
          for (let i = 1; i <= pdf.numPages; i++) {
            if (progressCallback) {
              progressCallback(i, pdf.numPages);
            }
            
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            // Ordena os itens textuais por coordenada Y (descendente) e X (ascendente)
            // Isso evita quebras e desalinhamentos na leitura de colunas/tabelas simples
            const items = textContent.items;
            items.sort((a, b) => {
              if (Math.abs(a.transform[5] - b.transform[5]) < 5) {
                return a.transform[4] - b.transform[4];
              }
              return b.transform[5] - a.transform[5];
            });
            
            let lastY = null;
            let pageText = "";
            
            for (const item of items) {
              // Se a variação na linha Y for considerável, insere quebra de linha
              if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                pageText += "\n";
              }
              pageText += item.str;
              lastY = item.transform[5];
            }
            
            fullText += pageText + "\n\n";
          }
          
          resolve(fullText);
        } catch (err) {
          reject(new Error("Erro ao ler páginas do PDF: " + err.message));
        }
      };
      
      reader.onerror = () => reject(new Error("Erro ao carregar arquivo local: " + reader.error.message));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Faz o parse do texto bruto em uma estrutura de simulado JSON
   * @param {string} rawText - Texto bruto do PDF ou textarea
   * @returns {Object} Dados estruturados do Simulado
   */
  static parse(rawText) {
    // Normaliza quebras de linha
    const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Identifica e separa a seção de Gabarito
    const gabaritoRegex = /(?:GABARITO\s+E\s+FEEDBACK\s+DETALHADO|GABARITO|FEEDBACK\s+DETALHADO)/i;
    const gabaritoIndex = text.search(gabaritoRegex);
    
    let questionsText = text;
    let gabaritoText = "";
    
    if (gabaritoIndex !== -1) {
      questionsText = text.substring(0, gabaritoIndex);
      gabaritoText = text.substring(gabaritoIndex);
    }

    // Extrai metadados/introdução
    const firstQuestIndex = questionsText.search(/Questão\s+\d+/i);
    let intro = "";
    if (firstQuestIndex !== -1) {
      intro = questionsText.substring(0, firstQuestIndex).trim();
      questionsText = questionsText.substring(firstQuestIndex);
    } else {
      intro = "MedQuestion carregado em " + new Date().toLocaleDateString();
    }

    // Limpa introdução de divisores estéticos
    intro = intro.replace(/[─━—_-]{5,}/g, "").trim();

    // Encontra todas as cabeças de questões
    // Ex: "Questão 1 — Epidemiologia e Rastreio | Clínica" ou "Questão 2 — Influência..."
    const headerRegex = /^Questão\s+(\d+)\s*(?:[-—–:]+)?\s*([^|\n]+?)(?:\s*\|\s*([^\n]+))?$/gm;
    const headerMatches = [];
    let match;

    while ((match = headerRegex.exec(questionsText)) !== null) {
      headerMatches.push({
        index: match.index,
        length: match[0].length,
        number: parseInt(match[1]),
        topic: match[2].trim(),
        type: match[3] ? match[3].trim() : "Clínica"
      });
    }

    const questions = [];

    // Processa os blocos de questões
    for (let i = 0; i < headerMatches.length; i++) {
      const current = headerMatches[i];
      const nextIndex = (i + 1 < headerMatches.length) ? headerMatches[i+1].index : questionsText.length;
      const block = questionsText.substring(current.index + current.length, nextIndex).trim();

      // Identifica o início das alternativas (A), B), C) etc.)
      const optionStartRegex = /(?:\s|^)([A-E])\)\s/;
      const optStartMatch = block.match(optionStartRegex);

      let prompt = block;
      let optionsBlock = "";
      let takeHome = "";

      if (optStartMatch) {
        const optIndex = block.indexOf(optStartMatch[0]);
        prompt = block.substring(0, optIndex).trim();
        optionsBlock = block.substring(optIndex).trim();

        // Extrai a mensagem "Take home message" se houver dentro deste bloco
        const takeHomeRegex = /(?:🎯\s*)?Take\s*home\s*message:\s*([\s\S]*?)$/i;
        const thMatch = optionsBlock.match(takeHomeRegex);
        if (thMatch) {
          takeHome = thMatch[1].trim();
          optionsBlock = optionsBlock.replace(takeHomeRegex, "").trim();
        }
      }

      // Limpa divisores decorativos do enunciado e do takeHome
      prompt = prompt.replace(/[─━—_-]{5,}/g, "").trim();
      takeHome = takeHome.replace(/[─━—_-]{5,}/g, "").trim();

      // Divide o bloco de opções nas alternativas individuais
      const options = [];
      if (optionsBlock) {
        const optSplitRegex = /(?:\s|^)([A-E])\)\s/gi;
        let optMatch;
        const optMatches = [];
        
        while ((optMatch = optSplitRegex.exec(optionsBlock)) !== null) {
          optMatches.push({
            label: optMatch[1].toUpperCase(),
            index: optMatch.index,
            length: optMatch[0].length
          });
        }

        for (let j = 0; j < optMatches.length; j++) {
          const currOpt = optMatches[j];
          const nextOptIndex = (j + 1 < optMatches.length) ? optMatches[j+1].index : optionsBlock.length;
          let text = optionsBlock.substring(currOpt.index + currOpt.length, nextOptIndex).trim();
          
          // Remove possíveis traços ou sujeiras no fim de cada opção
          text = text.replace(/[─━—_-]+$/, "").trim();

          options.push({
            label: currOpt.label,
            text: text
          });
        }
      }

      questions.push({
        id: `q-${current.number}`,
        number: current.number,
        topic: current.topic,
        type: current.type,
        prompt: prompt,
        options: options,
        takeHome: takeHome,
        feedback: {
          correctOption: "",
          correctReason: "",
          incorrectReason: "",
          keyPoint: "",
          optionFeedback: {}
        }
      });
    }

    // Processa os gabaritos se o bloco foi encontrado
    if (gabaritoText) {
      const gabHeaderRegex = /(?:^|\n|─)\s*Questão\s+(\d+)/gi;
      let gabMatch;
      const gabMatches = [];

      while ((gabMatch = gabHeaderRegex.exec(gabaritoText)) !== null) {
        gabMatches.push({
          number: parseInt(gabMatch[1]),
          index: gabMatch.index,
          length: gabMatch[0].length
        });
      }

      for (let i = 0; i < gabMatches.length; i++) {
        const current = gabMatches[i];
        const nextIndex = (i + 1 < gabMatches.length) ? gabMatches[i+1].index : gabaritoText.length;
        const block = gabaritoText.substring(current.index + current.length, nextIndex).trim();

        const question = questions.find(q => q.number === current.number);
        if (question) {
          // 1. Alternativa correta (ex: "Resposta correta: C" ou "Gabarito: C")
          const correctOptMatch = block.match(/(?:Resposta\s+correta|Resposta|Gabarito|Correta)\s*:\s*([A-E])/i);
          if (correctOptMatch) {
            question.feedback.correctOption = correctOptMatch[1].toUpperCase();
          }

          // 2. Justificativa da correta (✅ Por que C está CORRETA:)
          const correctReasonMatch = block.match(/✅\s*Por\s+que\s+[A-E]\s+está\s+(?:CORRETA|Correta|correta|CORRETO|Correto|correto):\s*([\s\S]*?)(?=(?:❌|📌|🎯|$))/i);
          if (correctReasonMatch) {
            question.feedback.correctReason = correctReasonMatch[1].replace(/[─━—_-]{5,}/g, "").trim();
          }

          // 3. Justificativa das incorretas (❌ Por que as demais estão INCORRETAS:)
          const incorrectReasonMatch = block.match(/❌\s*Por\s+que\s+(?:as\s+demais|as\s+outras|as\s+alternativas)\s+(?:estão|estao)\s+(?:INCORRETAS|Incorretas|incorretas):\s*([\s\S]*?)(?=(?:✅|📌|🎯|$))/i);
          if (incorrectReasonMatch) {
            let rawIncorrect = incorrectReasonMatch[1].replace(/[─━—_-]{5,}/g, "").trim();
            question.feedback.incorrectReason = rawIncorrect;

            // Tenta extrair justificativas de alternativas individuais (A) ... B) ... etc) se houver no bloco
            const optionFbRegex = /(?:\s|^)([A-E])\)\s/gi;
            let fbMatch;
            const fbMatches = [];
            
            while ((fbMatch = optionFbRegex.exec(rawIncorrect)) !== null) {
              fbMatches.push({
                label: fbMatch[1].toUpperCase(),
                index: fbMatch.index,
                length: fbMatch[0].length
              });
            }

            for (let j = 0; j < fbMatches.length; j++) {
              const currFb = fbMatches[j];
              const nextFbIndex = (j + 1 < fbMatches.length) ? fbMatches[j+1].index : rawIncorrect.length;
              let text = rawIncorrect.substring(currFb.index + currFb.length, nextFbIndex).trim();
              
              // Remove possíveis traços ou sujeiras
              text = text.replace(/[─━—_-]+$/, "").trim();
              question.feedback.optionFeedback[currFb.label] = text;
            }
          }

          // 4. Ponto-chave para revisão (📌 Ponto-chave para revisão:)
          const keyPointMatch = block.match(/(?:📌\s*)?Ponto-chave(?:\s+para\s+revisão)?:\s*([\s\S]*?)(?=(?:✅|❌|🎯|$))/i);
          if (keyPointMatch) {
            question.feedback.keyPoint = keyPointMatch[1].replace(/[─━—_-]{5,}/g, "").trim();
          }
        }
      }
    }

    // Título do simulado baseado no primeiro cabeçalho
    const titleMatch = intro.split('\n')[0] || "MedQuestion";
    const title = titleMatch.length > 120 ? titleMatch.substring(0, 117) + "..." : titleMatch;

    return {
      createdAt: new Date().toISOString(),
      metadata: {
        title: title,
        intro: intro,
        themes: [],
        distribution: []
      },
      questions: questions
    };
  }
}

// Vincula ao escopo global para acesso facilitado
window.QuizParser = QuizParser;
