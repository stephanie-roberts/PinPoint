/**
 * The conformance suite must pass every duplicate-`clientId` pattern the
 * `TcPinpointStore` contract allows, not only the engine's. This store returns
 * the existing record on a sequential repeat but, like a find-then-insert
 * over a unique index, throws `StoreDuplicateError` when it loses a
 * concurrent insert race — the case the HTTP handler recovers through
 * `findByClientId`.
 */

import { createCollectionStore, type FeedbackRecord, StoreDuplicateError, type TcPinpointStore } from "../src/index.js";
import { testTcPinpointStore } from "../src/testing.js";

function createUniqueIndexStore(): TcPinpointStore {
  let feedbacks: FeedbackRecord[] = [];
  let counter = 1;
  const base = createCollectionStore({
    load: () => feedbacks,
    persist: (next) => {
      feedbacks = next;
    },
    generateId: () => `unique-${counter++}`,
    comments: true,
  });
  const inserting = new Set<string>();

  return {
    ...base,
    async createFeedback(data) {
      const existing = await base.findByClientId(data.clientId);
      if (existing) return existing;
      if (inserting.has(data.clientId)) throw new StoreDuplicateError();
      inserting.add(data.clientId);
      try {
        return await base.createFeedback(data);
      } finally {
        inserting.delete(data.clientId);
      }
    },
  };
}

testTcPinpointStore(createUniqueIndexStore);
