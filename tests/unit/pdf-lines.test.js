import test from "node:test";
import assert from "node:assert/strict";

import { reconstructPageText } from "../../js/import/pdf.js";

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
