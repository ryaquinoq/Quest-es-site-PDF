const LINE_Y_TOLERANCE = 3;
const MIN_WORD_GAP = 1.5;
const PDFJS_URL = new URL("../../vendor/pdfjs/pdf.min.mjs", import.meta.url);
const PDFJS_WORKER_URL = new URL(
  "../../vendor/pdfjs/pdf.worker.min.mjs",
  import.meta.url
);

let pdfjsPromise;

async function loadPdfJs() {
  pdfjsPromise ||= import(PDFJS_URL).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL.toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

function itemPosition(item) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return {
    x: Number(transform[4]) || 0,
    y: Number(transform[5]) || 0,
    fontSize: Math.max(Math.hypot(Number(transform[0]) || 0, Number(transform[1]) || 0), 1)
  };
}

function itemWidth(item, text, fontSize) {
  const measuredWidth = Number(item?.width);
  if (Number.isFinite(measuredWidth) && measuredWidth > 0) return measuredWidth;
  return text.length * fontSize * 0.5;
}

function joinLine(items) {
  let text = "";
  let previousEnd = null;
  let previousFontSize = 1;
  let previousSpace = false;

  for (const item of items) {
    const value = String(item?.str || "").replace(/\s+/g, " ").trim();
    if (!value) continue;

    const { x, fontSize } = itemPosition(item);
    const gap = previousEnd === null ? 0 : x - previousEnd;
    const gapThreshold = Math.max(
      MIN_WORD_GAP,
      Math.min(previousFontSize, fontSize) * 0.2
    );

    if (text && (previousSpace || /^\s/.test(item.str) || gap > gapThreshold) && !text.endsWith(" ")) text += " ";
    text += value;
    previousEnd = x + itemWidth(item, value, fontSize);
    previousFontSize = fontSize;
    previousSpace = /\s$/.test(item.str);
  }

  return text;
}

export function reconstructPageText(items) {
  const positioned = (Array.isArray(items) ? items : [])
    .filter(item => String(item?.str || "").trim())
    .map(item => ({ item, ...itemPosition(item) }))
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];

  for (const positionedItem of positioned) {
    const line = lines.find(candidate => (
      Math.abs(candidate.y - positionedItem.y) <= LINE_Y_TOLERANCE
    ));

    if (line) {
      line.items.push(positionedItem.item);
      line.y = (line.y * (line.items.length - 1) + positionedItem.y) / line.items.length;
    } else {
      lines.push({ y: positionedItem.y, items: [positionedItem.item] });
    }
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map(line => line.items.sort((left, right) => (
      itemPosition(left).x - itemPosition(right).x
    )))
    .map(joinLine)
    .filter(Boolean)
    .join("\n");
}

export async function extractPdf(file, onProgress = () => {}, pdfjsRuntime) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new TypeError("Selecione um arquivo PDF válido.");
  }

  const { getDocument } = pdfjsRuntime || await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  // Text-only extraction never instantiates PDF.js viewer or scripting components.
  const loadingTask = getDocument({ data });
  let pdf;

  try {
    pdf = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(reconstructPageText(content.items));
      onProgress(pageNumber, pdf.numPages);
    }

    if (!pages.some(text => text.trim())) throw new Error("Este PDF não contém texto selecionável. Cole o texto original do NotebookLM ou envie o arquivo Markdown (.md).");
    return {
      text: pages.map((pageText, index) => (
        index === 0
          ? pageText
          : `<<< MEDUP_PAGE_BREAK:${index} >>>\n\n${pageText}`
      )).join("\n\n"),
      pages
    };
  } finally {
    if (typeof loadingTask.destroy === "function") await loadingTask.destroy();
    else if (typeof pdf?.destroy === "function") await pdf.destroy();
  }
}
