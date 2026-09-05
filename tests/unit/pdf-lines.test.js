import test from "node:test";
import assert from "node:assert/strict";

import { extractPdf, reconstructPageText } from "../../js/import/pdf.js";

const textItem = (str, x, y) => ({
  str,
  width: str.length * 5,
  transform: [10, 0, 0, 10, x, y]
});

function fakePdfJs(pageItems, options = {}) {
  const calls = [];
  let destroyed = false;
  const document = {
    numPages: pageItems.length,
    async getPage(pageNumber) {
      if (options.failPage === pageNumber) throw new Error("falha ao ler página");
      return {
        async getTextContent() {
          return { items: pageItems[pageNumber - 1] };
        }
      };
    },
    async destroy() {
      destroyed = true;
    }
  };

  return {
    calls,
    wasDestroyed: () => destroyed,
    runtime: {
      getDocument(parameters) {
        calls.push(parameters);
        return { promise: Promise.resolve(document) };
      }
    }
  };
}

test("reconstructPageText preserves option boundaries", () => {
  const items = [
    { str: "A)", transform: [1, 0, 0, 1, 40, 700] },
    { str: "Conduta inicial", transform: [1, 0, 0, 1, 65, 700] },
    { str: "B)", transform: [1, 0, 0, 1, 40, 680] },
    { str: "Observação", transform: [1, 0, 0, 1, 65, 680] }
  ];

  assert.equal(
    reconstructPageText(items),
    "A) Conduta inicial\nB) Observação"
  );
});

test("extractPdf preserves pages, markers, and progress", async () => {
  const pdfjs = fakePdfJs([
    [textItem("Página um", 40, 700)],
    [textItem("Página dois", 40, 700)]
  ]);
  const progress = [];
  const file = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };

  const result = await extractPdf(
    file,
    (current, total) => progress.push([current, total]),
    pdfjs.runtime
  );

  assert.deepEqual(result.pages, ["Página um", "Página dois"]);
  assert.equal(
    result.text,
    "Página um\n\n<<< MEDUP_PAGE_BREAK:1 >>>\n\nPágina dois"
  );
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.equal("enableScripting" in pdfjs.calls[0], false);
  assert.equal(pdfjs.wasDestroyed(), true);
});

test("extractPdf rejects invalid files and destroys a loaded document after page errors", async () => {
  await assert.rejects(() => extractPdf(null), /arquivo PDF válido/i);

  const pdfjs = fakePdfJs([[textItem("Página", 40, 700)]], { failPage: 1 });
  const file = { arrayBuffer: async () => new ArrayBuffer(1) };

  await assert.rejects(
    () => extractPdf(file, undefined, pdfjs.runtime),
    /falha ao ler página/i
  );
  assert.equal(pdfjs.wasDestroyed(), true);
});
