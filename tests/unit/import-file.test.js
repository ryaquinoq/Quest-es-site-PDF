import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../../js/ui/state.js";
import { createLatestFileLoader } from "../../js/ui/views/import-view.js";

test("only the latest file read can update import state", async () => {
  let finishSlowRead;
  const slowRead = new Promise(resolve => {
    finishSlowRead = resolve;
  });
  const readSource = file => (
    file.name === "slow.txt"
      ? slowRead
      : Promise.resolve({ sourceName: file.name, sourceText: "fonte mais recente" })
  );
  const store = createStore({ importResult: { stale: true } });
  const loadFile = createLatestFileLoader(store, readSource);

  const pendingSlow = loadFile({ name: "slow.txt" });
  assert.equal(store.getState().importResult, null);
  assert.equal(store.getState().importDraft.sourceName, "slow.txt");
  assert.equal(store.getState().importDraft.loading, true);

  await loadFile({ name: "latest.txt" });
  assert.equal(store.getState().importDraft.sourceName, "latest.txt");
  assert.equal(store.getState().importDraft.sourceText, "fonte mais recente");
  assert.equal(store.getState().importDraft.loading, false);

  finishSlowRead({ sourceName: "slow.txt", sourceText: "fonte antiga" });
  await pendingSlow;

  assert.equal(store.getState().importDraft.sourceName, "latest.txt");
  assert.equal(store.getState().importDraft.sourceText, "fonte mais recente");
  assert.equal(store.getState().importDraft.loading, false);
});
