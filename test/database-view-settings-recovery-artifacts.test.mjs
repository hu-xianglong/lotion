import assert from "node:assert/strict";
import test from "node:test";

import { assertViewSettingsRecoveryEvidence } from "../scripts/lib/database-created-views-artifacts.mjs";

const completeRecovery = {
  message: "Injected view settings persistence failure",
  dialogRemainedOpen: true,
  pendingDismissalBlocked: true,
  draftRetained: true,
  failedStateRolledBack: true,
  duplicateSubmitSuppressed: true,
  retryCommittedExactlyOnce: true
};

test("database view settings recovery artifact accepts complete transactional evidence", () => {
  assert.equal(assertViewSettingsRecoveryEvidence(completeRecovery, "desktop"), true);
});

test("database view settings recovery artifact rejects missing rollback proof", () => {
  assert.throws(
    () => assertViewSettingsRecoveryEvidence({ ...completeRecovery, failedStateRolledBack: false }, "compact"),
    /missing view settings recovery evidence/
  );
});

test("database view settings recovery artifact rejects missing exactly-once retry proof", () => {
  assert.throws(
    () => assertViewSettingsRecoveryEvidence({ ...completeRecovery, retryCommittedExactlyOnce: false }, "wide"),
    /missing view settings recovery evidence/
  );
});
