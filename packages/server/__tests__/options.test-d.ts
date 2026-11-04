/**
 * Type-level locks for the handler options (vitest typecheck mode — never
 * executed): the `apiKey` policy XOR a custom `access` policy, and the
 * principal inferred from `access.authenticate`.
 */

import type { CommentPayload, PinPointStore } from "@pinpoint/core";
import { describe, expectTypeOf, it } from "vitest";
import {
  createPinPointHandler,
  type PinPointAccessControl,
  type PinPointAction,
  type PinPointHandler,
  type PinPointHandlerOptions,
} from "../src/index.js";

declare const store: PinPointStore;

interface Reviewer {
  id: string;
  isAdmin: boolean;
}
declare function sessionUser(request: Request): Promise<Reviewer | null>;

describe("createPinPointHandler options XOR union", () => {
  it("accepts each policy on its own", () => {
    expectTypeOf(createPinPointHandler({ store })).toEqualTypeOf<PinPointHandler>();
    expectTypeOf(
      createPinPointHandler({ store, apiKey: "k", publicEndpoints: ["POST"] }),
    ).toEqualTypeOf<PinPointHandler>();
    expectTypeOf(
      createPinPointHandler({ store, access: { authenticate: sessionUser } }),
    ).toEqualTypeOf<PinPointHandler>();
  });

  it("accepts options assembled at runtime", () => {
    const options: PinPointHandlerOptions<Reviewer> =
      Math.random() > 0.5 ? { store, apiKey: "k" } : { store, access: { authenticate: sessionUser } };
    expectTypeOf(createPinPointHandler(options)).toEqualTypeOf<PinPointHandler>();
  });

  it("rejects mixed policies and a missing store", () => {
    // @ts-expect-error — apiKey and access are mutually exclusive
    createPinPointHandler({ store, apiKey: "k", access: { authenticate: sessionUser } });

    // @ts-expect-error — publicEndpoints belongs to the apiKey policy
    createPinPointHandler({ store, access: { authenticate: sessionUser }, publicEndpoints: ["GET"] });

    // @ts-expect-error — redaction is access.canReadAuthorEmail's job under access
    createPinPointHandler({ store, access: { authenticate: sessionUser }, redactUnauthenticatedEmails: false });

    // @ts-expect-error — a store is required
    createPinPointHandler({ apiKey: "k" });
  });
});

describe("the principal", () => {
  it("is null in hooks and transforms under the apiKey policy", () => {
    createPinPointHandler({
      store,
      apiKey: "k",
      beforeCreate: (input, { principal }) => {
        expectTypeOf(principal).toEqualTypeOf<null>();
        return input;
      },
      hooks: {
        onDeleted: (target, { principal }) => {
          expectTypeOf(principal).toEqualTypeOf<null>();
          expectTypeOf(target.projectName).toEqualTypeOf<string>();
        },
      },
    });
  });

  it("is never a boolean, whose false would read as a signed-in caller", () => {
    // @ts-expect-error — authenticate must resolve who is calling, not whether
    createPinPointHandler({ store, access: { authenticate: (request) => request.headers.has("x-token") } });

    const tokenCheck = (request: Request) => request.headers.get("x-token") === "secret";
    // @ts-expect-error — nor through a policy typed on its own
    const standalone: PinPointAccessControl<boolean> = { authenticate: tokenCheck };
    void standalone;
  });

  it("is inferred from access.authenticate, without null", () => {
    createPinPointHandler({
      store,
      access: {
        authenticate: sessionUser,
        authorize: ({ principal, action, feedbackId, commentId, dryRun }) => {
          expectTypeOf(principal).toEqualTypeOf<Reviewer>();
          expectTypeOf(feedbackId).toEqualTypeOf<string | undefined>();
          expectTypeOf(commentId).toEqualTypeOf<string | undefined>();
          expectTypeOf(dryRun).toEqualTypeOf<boolean | undefined>();
          return action === "create" || principal.isAdmin;
        },
        canReadAuthorEmail: (principal) => {
          expectTypeOf(principal).toEqualTypeOf<Reviewer>();
          return principal.isAdmin;
        },
        canCommentAsTeam: (principal) => {
          expectTypeOf(principal).toEqualTypeOf<Reviewer>();
          return principal.isAdmin;
        },
      },
      presentFeedback: (feedback, { principal }) => {
        expectTypeOf(principal).toEqualTypeOf<Reviewer>();
        return feedback;
      },
      beforeComment: (input, { principal }) => {
        expectTypeOf(principal).toEqualTypeOf<Reviewer>();
        expectTypeOf(input).toEqualTypeOf<CommentPayload>();
        return input;
      },
      hooks: {
        onCreated: (_feedback, { principal }) => {
          expectTypeOf(principal).toEqualTypeOf<Reviewer>();
        },
      },
    });
  });
});

describe("the actions authorize decides about", () => {
  it("include the comment writes", () => {
    expectTypeOf<PinPointAction>().toEqualTypeOf<
      "create" | "list" | "update" | "delete" | "deleteAll" | "createComment" | "deleteComment"
    >();
  });
});
