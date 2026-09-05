const QUESTION_MARKER = /^===\s*(IN[IÍ]CIO|FIM) DA QUEST[AÃ]O\s*===$/gimu;
const FIELD_LABEL = /^(N[uú]mero|Tema|Tipo|Dificuldade|Enunciado|Alternativa [A-E]|Resposta correta|Justificativa [A-E]|Take home message|Ponto-chave|Fonte no material)\s*:\s*/gimu;

function normalizedKey(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function splitDocument(text) {
  const blocks = [];
  let firstStart = -1;
  let blockStart = -1;
  let marker;

  QUESTION_MARKER.lastIndex = 0;
  while ((marker = QUESTION_MARKER.exec(text)) !== null) {
    if (normalizedKey(marker[1]) === "inicio") {
      if (firstStart === -1) firstStart = marker.index;
      if (blockStart !== -1) blocks.push(text.slice(blockStart, marker.index).trim());
      blockStart = QUESTION_MARKER.lastIndex;
    } else if (blockStart !== -1) {
      blocks.push(text.slice(blockStart, marker.index).trim());
      blockStart = -1;
    }
  }

  if (blockStart !== -1) blocks.push(text.slice(blockStart).trim());
  return {
    preamble: firstStart === -1 ? "" : text.slice(0, firstStart).trim(),
    blocks
  };
}

function fieldsFromBlock(block) {
  const matches = [];
  let match;

  FIELD_LABEL.lastIndex = 0;
  while ((match = FIELD_LABEL.exec(block)) !== null) {
    matches.push({ key: normalizedKey(match[1]), index: match.index, valueStart: FIELD_LABEL.lastIndex });
  }

  return new Map(matches.map((field, index) => [
    field.key,
    block.slice(field.valueStart, matches[index + 1]?.index ?? block.length).trim()
  ]));
}

function listMetadata(preamble, label) {
  const match = preamble.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "imu"));
  return match ? match[1].split(/\s*,\s*/).filter(Boolean) : [];
}

function parseQuestion(block) {
  const fields = fieldsFromBlock(block);
  const options = [];
  const feedback = {};

  for (const label of ["A", "B", "C", "D", "E"]) {
    const option = fields.get(`alternativa ${label.toLowerCase()}`);
    if (option !== undefined) options.push({ label, text: option });

    const reason = fields.get(`justificativa ${label.toLowerCase()}`);
    if (reason !== undefined) feedback[label] = reason;
  }

  return {
    number: Number(fields.get("numero")),
    topic: fields.get("tema"),
    type: fields.get("tipo"),
    difficulty: fields.get("dificuldade"),
    prompt: fields.get("enunciado"),
    options,
    correctOption: fields.get("resposta correta"),
    feedback,
    takeHome: fields.get("take home message"),
    keyPoint: fields.get("ponto-chave"),
    sourceReference: fields.get("fonte no material")
  };
}

export function parse(text) {
  const source = String(text ?? "");
  const { preamble, blocks } = splitDocument(source);
  const firstLine = preamble.split("\n").map((line) => line.trim()).find(Boolean);

  return {
    title: firstLine || "Simulado sem título",
    introduction: preamble,
    themes: listMetadata(preamble, "Temas?"),
    distribution: listMetadata(preamble, "Distribui[cç][aã]o"),
    questions: blocks.map(parseQuestion)
  };
}
