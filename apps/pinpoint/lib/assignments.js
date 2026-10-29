// Who on your team each piece of feedback is assigned to.
// Saved to data/assignments.json as { feedbackId: { projectName, email, assignedBy, assignedAt } }.
// Only people on a site's Notify list can be assigned its feedback (checked in server.js).

import { readJson, writeJson } from "./json-file.js";

export function createAssignments({ file }) {
  let assignments = readJson(file, {});

  function save(next) {
    writeJson(file, next);
    assignments = next;
  }

  return {
    get: (feedbackId) => assignments[feedbackId] ?? null,

    // Every assignment on one site, as { feedbackId: email }.
    forProject(projectName) {
      return Object.fromEntries(
        Object.entries(assignments)
          .filter(([, assignment]) => assignment.projectName === projectName)
          .map(([feedbackId, assignment]) => [feedbackId, assignment.email]),
      );
    },

    // Assign feedback to someone, or pass email: null to unassign it.
    set(feedbackId, { projectName, email, assignedBy }) {
      const next = { ...assignments };
      if (email) next[feedbackId] = { projectName, email, assignedBy, assignedAt: new Date().toISOString() };
      else delete next[feedbackId];
      save(next);
    },

    // When feedback is deleted, its assignment goes too.
    remove(feedbackId) {
      if (!assignments[feedbackId]) return;
      const { [feedbackId]: _removed, ...rest } = assignments;
      save(rest);
    },

    // When all of a site's feedback is deleted at once.
    removeProject(projectName) {
      const rest = Object.fromEntries(
        Object.entries(assignments).filter(([, assignment]) => assignment.projectName !== projectName),
      );
      if (Object.keys(rest).length !== Object.keys(assignments).length) save(rest);
    },
  };
}
