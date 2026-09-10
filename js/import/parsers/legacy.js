import { ANSWER_KEY_HEADER } from "../answer-boundary.js";

const QUESTION_HEADER = /^Quest[aã]o[ \t]+(\d+)[ \t]*(?:[-—–:][ \t]*)?([^|\n]*?)(?:[ \t]*\|[ \t]*([^\n]+))?[ \t]*$/gimu;
// Parenthesized letters inside prose (e.g. "via aérea (A)") are not options.
const OPTION_MARKER = /(?:^[ \t]*(?:\([ \t]*)?|[^\S\n]+)(?:Alternativa[ \t]+)?([A-E])[ \t]*(?:[).:]|[-—–])[ \t]+/gimu;
const TAKE_HOME_MARKER = /^(?:[^\p{L}\p{N}\n]*)?Take\s*home\s*message\s*:\s*/imu;

function withoutDecorators(value) {
  return String(value || "").replace(/[─━—_-]{5,}/g, "").trim();
}

function questionHeaders(text) {
  const headers = [];
  let match;

  QUESTION_HEADER.lastIndex = 0;
  while ((match = QUESTION_HEADER.exec(text)) !== null) {
    headers.push({
      index: match.index,
      contentStart: QUESTION_HEADER.lastIndex,
      number: Number(match[1]),
      topic: withoutDecorators(match[2]),
      type: match[3]?.trim()
    });
  }
  return headers;
}

function parseOptions(text) {
  const markers = [];
  let match;

  OPTION_MARKER.lastIndex = 0;
  while ((match = OPTION_MARKER.exec(text)) !== null) {
    markers.push({ label: match[1].toUpperCase(), index: match.index, valueStart: OPTION_MARKER.lastIndex });
  }

  return {
    prompt: withoutDecorators(text.slice(0, markers[0]?.index ?? text.length)),
    options: markers.map((marker, index) => ({
      label: marker.label,
      text: withoutDecorators(text.slice(marker.valueStart, markers[index + 1]?.index ?? text.length))
    }))
  };
}

function parseQuestion(header, block) {
  const takeHomeMatch = TAKE_HOME_MARKER.exec(block);
  const questionBody = takeHomeMatch ? block.slice(0, takeHomeMatch.index) : block;
  const takeHome = takeHomeMatch ? block.slice(takeHomeMatch.index + takeHomeMatch[0].length) : "";
  const { prompt, options } = parseOptions(questionBody);

  return {
    number: header.number,
    topic: header.topic,
    type: header.type,
    prompt,
    options,
    takeHome: withoutDecorators(takeHome),
    feedback: {}
  };
}

function answerBlocks(text) {
  const header = /(?:^|\n|[─━])[ \t]*(?:Quest[aã]o|Resposta)[ \t]+(\d+)\b/gimu;
  const matches = [];
  let match;

  while ((match = header.exec(text)) !== null) {
    matches.push({ number: Number(match[1]), index: match.index, contentStart: header.lastIndex });
  }

  return matches.map((item, index) => ({
    number: item.number,
    text: text.slice(item.contentStart, matches[index + 1]?.index ?? text.length).trim()
  }));
}

function directFeedback(text) {
  const marker = /(?:^|\s)Justificativa\s+([A-E])\s*:\s*/gimu;
  const matches = [];
  let match;

  while ((match = marker.exec(text)) !== null) {
    matches.push({ label: match[1].toUpperCase(), index: match.index, valueStart: marker.lastIndex });
  }

  return Object.fromEntries(matches.map((item, index) => [
    item.label,
    withoutDecorators(text.slice(item.valueStart, matches[index + 1]?.index ?? text.length).split(/\n[ \t]*(?:Ponto-chave(?: para revis[aã]o)?|Take home message|Fonte(?: no material)?)[ \t]*:/iu)[0])
  ]));
}

function optionFeedback(text) {
  const marker = /(?:^|\s)(?:Alternativa\s+([A-E])\s*:|([A-E])\s*\))\s*/gimu;
  const matches = [];
  let match;

  while ((match = marker.exec(text)) !== null) {
    matches.push({
      label: (match[1] || match[2]).toUpperCase(),
      index: match.index,
      valueStart: marker.lastIndex
    });
  }

  return Object.fromEntries(matches.map((item, index) => [
    item.label,
    withoutDecorators(text.slice(item.valueStart, matches[index + 1]?.index ?? text.length))
  ]));
}

function applyAnswer(question, text) {
  const sourceMatch = text.match(/^\s*Fonte(?: no material)?\s*:\s*([\s\S]*)$/imu);
  if (sourceMatch) {
    question.sourceReference = withoutDecorators(sourceMatch[1]);
    text = text.slice(0, sourceMatch.index).trim();
  }
  const correctMatch = text.match(/(?:Resposta\s+correta|Resposta|Gabarito|Correta)\s*:\s*([A-E])\b/iu);
  const correctReasonMatch = text.match(
    /(?:✅\s*)?Por\s+que\s+([A-E])\s+est[aá]\s+corret[ao]\s*:\s*([\s\S]*?)(?=(?:❌\s*)?Por\s+que\s+(?:as\s+demais|as\s+outras|as\s+alternativas)|(?:📌\s*)?Ponto-chave|(?:🎯\s*)?Take\s*home|$)/iu
  );
  const incorrectMatch = text.match(
    /(?:❌\s*)?Por\s+que\s+(?:as\s+demais|as\s+outras|as\s+alternativas)\s+(?:est[aã]o\s+)?incorretas\s*:\s*([\s\S]*?)(?=(?:📌\s*)?Ponto-chave|(?:🎯\s*)?Take\s*home|$)/iu
  );
  const keyPointMatch = text.match(
    /(?:📌\s*)?Ponto-chave(?:\s+para\s+revis[aã]o)?\s*:\s*([\s\S]*?)(?=(?:🎯\s*)?Take\s*home|$)/iu
  );
  const takeHomeMatch = text.match(/(?:🎯\s*)?Take\s*home\s*message\s*:\s*([\s\S]*?)$/iu);
  const correctOption = (correctMatch?.[1] || correctReasonMatch?.[1] || "").toUpperCase();
  const feedback = {
    ...directFeedback(text),
    ...(incorrectMatch ? optionFeedback(incorrectMatch[1]) : {})
  };

  if (correctReasonMatch && !feedback[correctOption]) {
    feedback[correctOption] = withoutDecorators(correctReasonMatch[2]);
  }

  const collectiveIncorrect = withoutDecorators(incorrectMatch?.[1]);
  for (const { label } of question.options) {
    if (!feedback[label] && label !== correctOption && collectiveIncorrect) {
      feedback[label] = collectiveIncorrect;
    }
  }

  question.correctOption = correctOption;
  question.feedback = feedback;
  question.keyPoint = withoutDecorators(keyPointMatch?.[1]);
  if (!question.takeHome) question.takeHome = withoutDecorators(takeHomeMatch?.[1]);
}

export function parse(text) {
  const source = String(text ?? "");
  const answerKeyMatch = source.match(ANSWER_KEY_HEADER);
  const questionsText = answerKeyMatch ? source.slice(0, answerKeyMatch.index) : source;
  const answersText = answerKeyMatch
    ? source.slice(answerKeyMatch.index + answerKeyMatch[0].length)
    : "";
  const headers = questionHeaders(questionsText);
  const questions = headers.map((header, index) => parseQuestion(
    header,
    questionsText.slice(header.contentStart, headers[index + 1]?.index ?? questionsText.length).trim()
  ));

  const seenAnswers = new Set();
  for (const answer of answerBlocks(answersText)) {
    const question = questions.find((item) => item.number === answer.number);
    if (question) {
      if (seenAnswers.has(answer.number)) {
        question.importIssues = [...(question.importIssues || []), "Mais de um gabarito para esta questão. Confira o texto original e selecione a resposta correta."];
        question.correctOption = "";
        continue;
      }
      seenAnswers.add(answer.number);
      applyAnswer(question, answer.text);
      const answers = [...answer.text.matchAll(/(?:^|\n)[ \t—–:-]*(?:Resposta\s+correta|Gabarito|Correta)[ \t]*:[ \t]*([A-E])\b/giu)].map(match => match[1].toUpperCase());
      answers.push(...[...answer.text.matchAll(/Por\s+que\s+([A-E])\s+est[aá]\s+corret[ao]\s*:/giu)].map(match => match[1].toUpperCase()));
      if (new Set(answers).size > 1) {
        question.importIssues = ["Respostas corretas conflitantes no gabarito. Confira o original."];
        question.correctOption = "";
      }
    }
  }

  for (const question of questions) {
    if (questions.filter(item => item.number === question.number).length > 1) {
      question.importIssues = [...(question.importIssues || []), `Número ${question.number} repetido no original; confira a associação com o gabarito.`];
      question.correctOption = "";
    }
  }
  const introduction = withoutDecorators(questionsText.slice(0, headers[0]?.index ?? questionsText.length));
  return {
    title: introduction.split("\n").map((line) => line.trim()).find(Boolean) || "Simulado sem título",
    introduction,
    questions
  };
}
