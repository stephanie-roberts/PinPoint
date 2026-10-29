/**
 * Type-level locks for the widget's public API surface (vitest typecheck
 * mode — never executed).
 */

import type {
  CommentResponse as CoreCommentResponse,
  FeedbackQuery,
  FeedbackResponse,
  TcPinpointInstance,
  TcPinpointPublicEvents,
  TcPinpointStore,
} from "@tc-pinpoint/core";
import { describe, expectTypeOf, it } from "vitest";
import type { GetFeedbacksOptions } from "../../src/api-client.js";
import {
  type CommentResponse,
  initTcPinpoint,
  registerLocale,
  type TcPinpointConfig,
  type TcPinpointPanelAction,
  type TcPinpointPanelActionContext,
  type TcPinpointPanelActionFeedback,
  type TcPinpointPanelButtonAction,
  type TcPinpointPanelLinkAction,
  type Translations,
} from "../../src/index.js";

declare const store: TcPinpointStore;
declare const instance: TcPinpointInstance;

describe("initTcPinpoint config modes", () => {
  it("accepts HTTP mode and store mode", () => {
    expectTypeOf(initTcPinpoint).toBeCallableWith({ projectName: "p", endpoint: "/api/tcpinpoint" });
    expectTypeOf(initTcPinpoint).toBeCallableWith({ projectName: "p", store });
  });

  it("rejects mixed modes", () => {
    // @ts-expect-error — endpoint and store are mutually exclusive
    initTcPinpoint({ projectName: "p", endpoint: "/api", store });
  });
});

describe("readOnly", () => {
  it("is a shared option, in both modes", () => {
    expectTypeOf(initTcPinpoint).toBeCallableWith({ projectName: "p", endpoint: "/api/tcpinpoint", readOnly: true });
    expectTypeOf(initTcPinpoint).toBeCallableWith({ projectName: "p", store, readOnly: false });
    expectTypeOf<TcPinpointConfig["readOnly"]>().toEqualTypeOf<boolean | undefined>();
  });
});

describe("panelActions", () => {
  it("accepts button and link actions in both modes", () => {
    expectTypeOf(initTcPinpoint).toBeCallableWith({
      projectName: "p",
      endpoint: "/api/tcpinpoint",
      panelActions: [
        { id: "sync", label: "Sync", onAction: () => {} },
        { id: "async", label: "Async", onAction: async () => {}, icon: "<svg/>", visible: () => true },
        { id: "static", label: "Tracker", href: "https://tracker.example" },
        { id: "computed", label: "Mail", href: (fb) => `mailto:${fb.authorEmail}` },
      ],
    });
    expectTypeOf(initTcPinpoint).toBeCallableWith({ projectName: "p", store, panelActions: [] });
  });

  it("is a button XOR a link", () => {
    expectTypeOf<TcPinpointPanelAction>().toEqualTypeOf<TcPinpointPanelButtonAction | TcPinpointPanelLinkAction>();
    // @ts-expect-error — onAction and href are mutually exclusive
    const both: TcPinpointPanelAction = { id: "x", label: "X", onAction: () => {}, href: "https://x.example" };
    // @ts-expect-error — one of onAction / href is required
    const neither: TcPinpointPanelAction = { id: "x", label: "X" };
    void [both, neither];
  });

  it("hands callbacks a read-only feedback and the context", () => {
    expectTypeOf<Parameters<TcPinpointPanelButtonAction["onAction"]>>().toEqualTypeOf<
      [TcPinpointPanelActionFeedback, TcPinpointPanelActionContext]
    >();
    expectTypeOf<FeedbackResponse>().toExtend<TcPinpointPanelActionFeedback>();
    expectTypeOf<ReturnType<TcPinpointPanelButtonAction["onAction"]>>().toEqualTypeOf<void | Promise<void>>();
    expectTypeOf<TcPinpointPanelActionContext>().toEqualTypeOf<{ refresh: () => Promise<void>; close: () => void }>();
    expectTypeOf<TcPinpointPanelLinkAction["href"]>().toEqualTypeOf<
      string | ((feedback: TcPinpointPanelActionFeedback) => string)
    >();
  });

  it("accepts helpers typed with TcPinpointPanelActionFeedback", () => {
    const createTicket = (_fb: TcPinpointPanelActionFeedback): Promise<void> => Promise.resolve();
    const hasPin = (fb: TcPinpointPanelActionFeedback) => fb.annotations.length > 0;
    expectTypeOf(initTcPinpoint).toBeCallableWith({
      projectName: "p",
      endpoint: "/api",
      panelActions: [{ id: "t", label: "Ticket", onAction: createTicket, visible: hasPin }],
    });
  });

  it("rejects writes to the feedback", () => {
    const action: TcPinpointPanelButtonAction = {
      id: "x",
      label: "X",
      onAction: (fb) => {
        // @ts-expect-error — the snapshot is read-only…
        fb.status = "resolved";
        // @ts-expect-error — …its arrays included…
        fb.annotations.sort();
        // @ts-expect-error — …and the records inside them
        fb.annotations[0]!.scrollX = 0;
        // @ts-expect-error — …down to the diagnostics entries
        fb.diagnostics?.console.splice(0);
      },
    };
    void action;
  });
});

describe("public events", () => {
  it("types each listener payload", () => {
    instance.on("feedback:sent", (fb) => {
      expectTypeOf(fb).toEqualTypeOf<FeedbackResponse>();
    });
    instance.on("feedback:error", (error) => {
      expectTypeOf(error).toEqualTypeOf<Error>();
    });
    instance.on("comment:added", (comment) => {
      expectTypeOf(comment).toEqualTypeOf<CommentResponse>();
    });
    instance.on("annotation:start", (...args) => {
      expectTypeOf(args).toEqualTypeOf<[]>();
    });
  });

  it("rejects unknown event names", () => {
    // @ts-expect-error — not a public event
    instance.on("submission:cancelled", () => {});
  });

  it("keeps the public map in sync with the instance signature", () => {
    expectTypeOf<Parameters<TcPinpointInstance["on"]>[0]>().toEqualTypeOf<keyof TcPinpointPublicEvents>();
  });

  it("types onCommentAdded like the comment:added listener, in both modes", () => {
    expectTypeOf(initTcPinpoint).toBeCallableWith({
      projectName: "p",
      endpoint: "/api/tcpinpoint",
      onCommentAdded: (comment: CommentResponse) => void comment.authorRole,
    });
    expectTypeOf(initTcPinpoint).toBeCallableWith({ projectName: "p", store, onCommentAdded: () => {} });
    expectTypeOf<TcPinpointPublicEvents["comment:added"]>().toEqualTypeOf<[CommentResponse]>();
    expectTypeOf<CommentResponse>().toEqualTypeOf<CoreCommentResponse>();
    // The wire shape never carries the dedup key.
    expectTypeOf<CommentResponse>().not.toHaveProperty("clientId");
  });
});

describe("GetFeedbacksOptions derivation", () => {
  it("is FeedbackQuery minus projectName", () => {
    expectTypeOf<keyof GetFeedbacksOptions>().toEqualTypeOf<Exclude<keyof FeedbackQuery, "projectName">>();
    expectTypeOf<GetFeedbacksOptions["statuses"]>().toEqualTypeOf<FeedbackQuery["statuses"]>();
  });
});

describe("custom locales", () => {
  it("accepts partial dictionaries", () => {
    expectTypeOf(registerLocale).toBeCallableWith("nl", { "panel.title": "Feedback" });
  });

  it("rejects unknown keys", () => {
    // @ts-expect-error — not a Translations key
    registerLocale("nl", { "panel.doesNotExist": "x" });
  });

  it("keeps values as strings", () => {
    expectTypeOf<Translations["panel.title"]>().toEqualTypeOf<string>();
  });
});
