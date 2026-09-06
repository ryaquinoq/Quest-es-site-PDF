const ANSWER_KEY_HEADER = /^\s*(?:#{1,6}\s*)?GABARITO(?:\s+(?:COMENTADO|FINAL|E FEEDBACK DETALHADO))?\s*:?\s*$/imu;
const QUESTION_HEADER = /^\s{0,3}(?:#{1,6}\s*)?(?:(?:Quest[aã]o\s+)(\d+)(?:\s*[.)])?|(\d+)\s*[.)])(?:\s*(?:[-—–:]\s*)?(.*))?$/gimu;
const OPTION_MARKER = /^\s*(?:Alternativa\s+)?([A-E])\s*(?:[).:]|[-—–])\s+/gimu;
const INLINE_ANSWER = /^\s*(?:Resposta(?:\s+correta)?|Gabarito|Alternativa correta)\s*[:\-–—]\s*(?:alternativa\s+|letra\s+)?\(?([A-E])\b.*$/imu;
const EXPLANATION = /^\s*(?:Explica[cç][aã]o|Justificativa|Coment[aá]rio|Feedback)(?:\s+[A-E])?\s*:\s*/imu;
const TAKE_HOME = /^\s*Take\s*home\s*message\s*:\s*/imu;

function clean(value) {
  return String(value || "").trim();
}

function questionHeaders(text) {
  const headers = [];
  let match;

  QUESTION_HEADER.lastIndex = 0;
  while ((match = QUESTION_HEADER.exec(text)) !== null) {
    headers.push({
      index: match.index,
      contentStart: QUESTION_HEADER.lastIndex,
      number: Number(match[1] || match[2]),
      inlinePrompt: clean(match[3])
    });
  }
  return headers;
}

function firstIndex(...matches) {
  const indexes = matches.filter(Boolean).map((match) => match.index);
  return indexes.length ? Math.min(...indexes) : -1;
}

function parseOptions(text) {
  const markers = [];
  let match;

  OPTION_MARKER.lastIndex = 0;
  while ((match = OPTION_MARKER.exec(text)) !== null) {
    markers.push({ label: match[1].toUpperCase(), index: match.index, valueStart: OPTION_MARKER.lastIndex });
  }

  return {
    leadingText: clean(text.slice(0, markers[0]?.index ?? text.length)),
    options: markers.map((marker, index) => ({
      label: marker.label,
      text: clean(text.slice(marker.valueStart, markers[index + 1]?.index ?? text.length))
    }))
  };
}

function parseQuestion(header, block) {
  const answerMatch = block.match(INLINE_ANSWER);
  const explanationMatch = block.match(EXPLANATION);
  const takeHomeMatch = block.match(TAKE_HOME);
  const trailingStart = firstIndex(answerMatch, explanationMatch, takeHomeMatch);
  const questionText = trailingStart === -1 ? block : block.slice(0, trailingStart);
  const { leadingText, options } = parseOptions(questionText);
  const promptParts = [header.inlinePrompt, leadingText.replace(/^Enunciado\s*:\s*/iu, "")].filter(Boolean);
  const explanationEnd = takeHomeMatch && explanationMatch && takeHomeMatch.index > explanationMatch.index
    ? takeHomeMatch.index
    : block.length;
  const explanation = explanationMatch
    ? clean(block.slice(explanationMatch.index + explanationMatch[0].length, explanationEnd))
    : "";
  const correctOption = (answerMatch?.[1] || "").toUpperCase();
  const fields = Array.from(block.matchAll(/^(Justificativa [A-E]|Fonte(?: no material)?|Ponto-chave|Tema|Dificuldade)\s*:\s*(.*(?:\n(?![\wÀ-ÿ -]+:).*)*)/gimu));
  const feedback = Object.fromEntries(fields.filter(m => /^Justificativa/i.test(m[1])).map(m => [m[1].slice(-1).toUpperCase(), clean(m[2])]));

  return {
    number: header.number,
    prompt: promptParts.join("\n"),
    options,
    correctOption,
    feedback: Object.keys(feedback).length ? feedback : correctOption && explanation ? { [correctOption]: explanation } : {},
    takeHome: takeHomeMatch
      ? clean(block.slice(takeHomeMatch.index + takeHomeMatch[0].length))
      : ""
  };
}

function finalAnswers(text) {
  const answer = /^\s*(?:Quest[aã]o\s+)?(\d+)\s*(?:[).:]|[-—–])\s*(?:Resposta(?:\s+correta)?\s*:\s*)?([A-E])\b/gimu;
  return new Map(Array.from(text.matchAll(answer), (match) => [Number(match[1]), match[2].toUpperCase()]));
}

export function parse(text) {
  const source = String(text ?? "");
  const answerKeyMatch = source.match(ANSWER_KEY_HEADER);
  const questionsText = answerKeyMatch ? source.slice(0, answerKeyMatch.index) : source;
  const answerKeyText = answerKeyMatch
    ? source.slice(answerKeyMatch.index + answerKeyMatch[0].length)
    : "";
  const headers = questionHeaders(questionsText);
  const answers = finalAnswers(answerKeyText);
  const questions = headers.map((header, index) => {
    const question = parseQuestion(
      header,
      questionsText.slice(header.contentStart, headers[index + 1]?.index ?? questionsText.length).trim()
    );
    if (!question.correctOption && answers.has(question.number)) {
      question.correctOption = answers.get(question.number);
    }
    return question;
  });
  const introduction = clean(questionsText.slice(0, headers[0]?.index ?? questionsText.length));
  const title = introduction
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s*/, "").trim())
    .find(Boolean);

  return {
    title: title || "Simulado sem título",
    introduction,
    questions
  };
}
