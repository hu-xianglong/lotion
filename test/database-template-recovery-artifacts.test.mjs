import assert from "node:assert/strict";
import test from "node:test";

import { assertTemplateRecoveryEvidence } from "../scripts/lib/database-created-views-artifacts.mjs";

const completeRecovery = {
  message: "Injected template persistence failure",
  dialogRemainedOpen: true,
  pendingDismissalBlocked: true,
  draftRetained: true,
  failedStateRolledBack: true,
  duplicateSubmitSuppressed: true,
  retryCommittedExactlyOnce: true
};

test("database template recovery artifact accepts complete transactional evidence", () => {
  assert.equal(assertTemplateRecoveryEvidence(completeRecovery, "desktop"), true);
});

test("database template recovery artifact rejects missing rollback proof", () => {
  assert.throws(
    () => assertTemplateRecoveryEvidence({ ...completeRecovery, failedStateRolledBack: false }, "compact"),
    /missing template recovery evidence/
  );
});

test("database template recovery artifact rejects missing exactly-once retry proof", () => {
  assert.throws(
    () => assertTemplateRecoveryEvidence({ ...completeRecovery, duplicateSubmitSuppressed: false }, "wide"),
    /missing template recovery evidence/
  );
});
