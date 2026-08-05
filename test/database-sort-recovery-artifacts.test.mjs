import assert from "node:assert/strict";
import test from "node:test";

import { assertSortRecoveryEvidence } from "../scripts/lib/database-created-views-artifacts.mjs";

const completeRecovery = {
  message: "Injected sort persistence failure",
  popoverRemainedOpen: true,
  pendingDismissalBlocked: true,
  draftRetained: true,
  failedStateRolledBack: true,
  duplicateSubmitSuppressed: true,
  retryCommittedExactlyOnce: true
};

test("database sort recovery artifact accepts complete transactional evidence", () => {
  assert.equal(assertSortRecoveryEvidence(completeRecovery, "desktop"), true);
});

test("database sort recovery artifact rejects missing rollback proof", () => {
  assert.throws(
    () => assertSortRecoveryEvidence({ ...completeRecovery, failedStateRolledBack: false }, "compact"),
    /missing sort recovery evidence/
  );
});

test("database sort recovery artifact rejects missing exactly-once retry proof", () => {
  assert.throws(
    () => assertSortRecoveryEvidence({ ...completeRecovery, duplicateSubmitSuppressed: false }, "wide"),
    /missing sort recovery evidence/
  );
});
