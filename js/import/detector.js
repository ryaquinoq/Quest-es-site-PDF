const UNKNOWN_THRESHOLD = 0.45;

function occurrences(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function result(format, confidence, reasons) {
  return {
    format,
    confidence: Number(Math.min(1, Math.max(0, confidence)).toFixed(2)),
    reasons,
  };
}

export function detectFormat(text) {
  const source = String(text ?? "");
  const trimmed = source.trim();

  const canonicalStarts = occurrences(source, /^=== INICIO DA QUESTAO ===$/gim);
  const canonicalEnds = occurrences(source, /^=== FIM DA QUESTAO ===$/gim);
  if (canonicalStarts || canonicalEnds) {
    const reasons = ["marcadores canônicos de questão encontrados"];
    const hasCompleteBoundary = canonicalStarts > 0 && canonicalEnds > 0;
    if (hasCompleteBoundary) reasons.push("limites de início e fim presentes");
    return result("medup-docs", hasCompleteBoundary ? 0.98 : 0.72, reasons);
  }

  const fencedJson = /```json\s*[\s\S]*?```/i.test(source);
  const jsonShape = /^[\[{]/.test(trimmed)
    && /"(?:questions|version|metadata)"\s*:/i.test(trimmed);
  if (fencedJson || jsonShape) {
    const reasons = [];
    if (fencedJson) reasons.push("bloco JSON delimitado encontrado");
    if (jsonShape) reasons.push("estrutura de quiz JSON encontrada");
    return result("json", jsonShape ? 0.97 : 0.92, reasons);
  }

  const legacyHeading = /^GABARITO E FEEDBACK DETALHADO\s*:?\s*$/im.test(source);
  if (legacyHeading) {
    const reasons = ["cabeçalho de gabarito legado encontrado"];
    const splitAnswers = occurrences(
      source,
      /^Quest[aã]o\s+\d+\s*[—-]\s*Resposta correta\s*:\s*[A-E]\b/gim,
    );
    if (splitAnswers) reasons.push("respostas do gabarito separado encontradas");
    return result("legacy", splitAnswers ? 0.97 : 0.9, reasons);
  }

  const numberedQuestions = occurrences(
    source,
    /^\s{0,3}(?:#{1,6}\s*)?(?:Quest[aã]o\s+)?\d+(?:\s*[.)](?:\s+.*)?|\s*[—-]\s*.*)?\s*$/gim,
  );
  const optionLabels = occurrences(
    source,
    /^\s*(?:Alternativa\s+)?[A-E]\s*(?:[.)]|-|:)\s+.+$/gim,
  );
  const answerLabels = occurrences(
    source,
    /^\s*(?:Resposta(?: correta)?|Gabarito)\s*:\s*[A-E]\b/gim,
  );

  let genericConfidence = 0;
  const genericReasons = [];
  if (numberedQuestions) {
    genericConfidence += numberedQuestions > 1 ? 0.55 : 0.45;
    genericReasons.push("perguntas numeradas encontradas");
  }
  if (optionLabels >= 2) {
    genericConfidence += 0.2;
    genericReasons.push("alternativas rotuladas encontradas");
  }
  if (answerLabels) {
    genericConfidence += 0.15;
    genericReasons.push("gabarito inline encontrado");
  }

  if (genericConfidence >= UNKNOWN_THRESHOLD) {
    return result("generic", Math.min(genericConfidence, 0.9), genericReasons);
  }

  return result(
    "unknown",
    Math.min(genericConfidence, UNKNOWN_THRESHOLD - 0.01),
    genericReasons.length ? genericReasons : ["nenhum marcador de formato confiável encontrado"],
  );
}
