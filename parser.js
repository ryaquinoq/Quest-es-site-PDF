import { importQuiz } from "./js/import/pipeline.js";
import { extractPdf } from "./js/import/pdf.js";

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
    const result = await extractPdf(file, progressCallback);
    return result.text;
  }

  static parse(rawText) {
    return importQuiz(rawText).quiz;
  }
}

window.QuizParser = QuizParser;
