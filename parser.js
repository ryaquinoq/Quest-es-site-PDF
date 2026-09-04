import { importQuiz } from "./js/import/pipeline.js";

/**
 * Compatibility facade kept while the application migrates to ES modules.
 */
class QuizParser {
  /**
   * Extrai texto completo de um arquivo PDF usando PDF.js.
   * @param {File} file Objeto File do PDF vindo do input.
   * @param {function} progressCallback Callback opcional para progresso.
   * @returns {Promise<string>} Texto extraído e formatado.
   */
  static async extractTextFromPDF(file, progressCallback) {
    if (!window.pdfjsLib) {
      throw new Error(
        "Biblioteca PDF.js não carregada. Certifique-se de estar conectado à internet na primeira execução."
      );
    }

    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async function onLoad() {
        try {
          const typedarray = new Uint8Array(this.result);
          const loadingTask = window.pdfjsLib.getDocument({ data: typedarray });
          const pdf = await loadingTask.promise;
          let fullText = "";

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            if (progressCallback) progressCallback(pageNumber, pdf.numPages);

            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();
            const items = textContent.items;

            items.sort((left, right) => {
              if (Math.abs(left.transform[5] - right.transform[5]) < 5) {
                return left.transform[4] - right.transform[4];
              }
              return right.transform[5] - left.transform[5];
            });

            let lastY = null;
            let pageText = "";
            for (const item of items) {
              if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                pageText += "\n";
              }
              pageText += item.str;
              lastY = item.transform[5];
            }

            fullText += `${pageText}\n\n`;
          }

          resolve(fullText);
        } catch (error) {
          reject(new Error(`Erro ao ler páginas do PDF: ${error.message}`));
        }
      };

      reader.onerror = () => reject(
        new Error(`Erro ao carregar arquivo local: ${reader.error.message}`)
      );
      reader.readAsArrayBuffer(file);
    });
  }

  static parse(rawText) {
    return importQuiz(rawText).quiz;
  }
}

window.QuizParser = QuizParser;
