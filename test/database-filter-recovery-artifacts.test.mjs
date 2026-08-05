import assert from "node:assert/strict";
import test from "node:test";

import { assertFilterRecoveryEvidence } from "../scripts/lib/database-created-views-artifacts.mjs";

test("database filter recovery artifact accepts complete transactional evidence", () => {
  assert.equal(assertFilterRecoveryEvidence({
    message: "Injected view persistence failure",
    popoverRemainedOpen: true,
    pendingDismissalBlocked: true,
    draftRetained: true,
    debouncedDismissalFlushed: true,
    failedStateRolledBack: true,
    duplicateSubmitSuppressed: true,
    retryCommittedExactlyOnce: true
  }, "desktop"), true);
});

test("database filter recovery artifact rejects missing rollback proof", () => {
  assert.throws(() => assertFilterRecoveryEvidence({
    message: "Injected view persistence failure",
    popoverRemainedOpen: true,
    pendingDismissalBlocked: true,
    draftRetained: true,
    debouncedDismissalFlushed: true,
    failedStateRolledBack: false,
    duplicateSubmitSuppressed: true,
    retryCommittedExactlyOnce: true
  }, "compact"), /missing filter recovery evidence/);
});

test("database filter recovery artifact rejects missing exactly-once retry proof", () => {
  assert.throws(() => assertFilterRecoveryEvidence({
    message: "Injected view persistence failure",
    popoverRemainedOpen: true,
    pendingDismissalBlocked: true,
    draftRetained: true,
    debouncedDismissalFlushed: true,
    failedStateRolledBack: true,
    duplicateSubmitSuppressed: false,
    retryCommittedExactlyOnce: true
  }, "wide"), /missing filter recovery evidence/);
});
