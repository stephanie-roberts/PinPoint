/**
 * Type-level locks for the handler options (vitest typecheck mode — never
 * executed): the `apiKey` policy XOR a custom `access` policy, and the
 * principal inferred from `access.authenticate`.
 */

import type { CommentPayload, TcPinpointStore } from "@tc-pinpoint/core";
import { describe, expectTypeOf, it } from "vitest";
import {
  createTcPinpointHandler,
  type TcPinpointAccessControl,
  type TcPinpointAction,
  type TcPinpointHandler,
  type TcPinpointHandlerOptions,
} from "../src/index.js";

declare const store: TcPinpointStore;

interface Reviewer {
  id: string;
  isAdmin: boolean;
}
declare function sessionUser(request: Request): Promise<Reviewer | null>;

describe("createTcPinpointHandler options XOR union", () => {
  it("accepts each policy on its own", () => {
    expectTypeOf(createTcPinpointHandler({ store })).toEqualTypeOf<TcPinpointHandler>();
    expectTypeOf(
      createTcPinpointHandler({ store, apiKey: "k", publicEndpoints: ["POST"] }),
    ).toEqualTypeOf<TcPinpointHandler>();
    expectTypeOf(
      createTcPinpointHandler({ store, access: { authenticate: sessionUser } }),
    ).toEqualTypeOf<TcPinpointHandler>();
  });

  it("accepts options assembled at runtime", () => {
    const options: TcPinpointHandlerOptions<Reviewer> =
      Math.random() > 0.5 ? { store, apiKey: "k" } : { store, access: { authenticate: sessionUser } };
    expectTypeOf(createTcPinpointHandler(options)).toEqualTypeOf<TcPinpointHandler>();
  });

  it("rejects mixed policies and a missing store", () => {
    // @ts-expect-error — apiKey and access are mutually exclusive
    createTcPinpointHandler({ store, apiKey: "k", access: { authenticate: sessionUser } });

    // @ts-expect-error — publicEndpoints belongs to the apiKey policy
    createTcPinpointHandler({ store, access: { authenticate: sessionUser }, publicEndpoints: ["GET"] });

    // @ts-expect-error — redaction is access.canReadAuthorEmail's job under access
    createTcPinpointHandler({ store, access: { authenticate: sessionUser }, redactUnauthenticatedEmails: false });

    // @ts-expect-error — a store is required
    createTcPinpointHandler({ apiKey: "k" });
  });
});

describe("the principal", () => {
  it("is null in hooks and transforms under the apiKey policy", () => {
    createTcPinpointHandler({
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
    createTcPinpointHandler({ store, access: { authenticate: (request) => request.headers.has("x-token") } });

    const tokenCheck = (request: Request) => request.headers.get("x-token") === "secret";
    // @ts-expect-error — nor through a policy typed on its own
    const standalone: TcPinpointAccessControl<boolean> = { authenticate: tokenCheck };
    void standalone;
  });

  it("is inferred from access.authenticate, without null", () => {
    createTcPinpointHandler({
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
    expectTypeOf<TcPinpointAction>().toEqualTypeOf<
      "create" | "list" | "update" | "delete" | "deleteAll" | "createComment" | "deleteComment"
    >();
  });
});
