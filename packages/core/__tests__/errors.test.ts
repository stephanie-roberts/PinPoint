import { describe, expect, it } from "vitest";
import {
  TcPinpointAuthError,
  TcPinpointError,
  TcPinpointNetworkError,
  TcPinpointValidationError,
} from "../src/errors.js";
import { StoreLimitError, StoreNotFoundError } from "../src/types.js";
import { errorFromResponse, isCommentGone, isThreadFull } from "../src/wire.js";

describe("TcPinpointError (base)", () => {
  it("constructs with explicit code and retryable flag", () => {
    const err = new TcPinpointError("boom", "CUSTOM", true);
    expect(err.message).toBe("boom");
    expect(err.code).toBe("CUSTOM");
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("TcPinpointError");
  });

  it("is an Error subclass — instanceof Error", () => {
    const err = new TcPinpointError("x", "X", false);
    expect(err).toBeInstanceOf(Error);
  });

  it("retryable can be explicitly false", () => {
    const err = new TcPinpointError("nope", "NOPE", false);
    expect(err.retryable).toBe(false);
  });
});

describe("TcPinpointNetworkError", () => {
  it("has code NETWORK and is retryable", () => {
    const err = new TcPinpointNetworkError("connection refused");
    expect(err.code).toBe("NETWORK");
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("TcPinpointNetworkError");
  });

  it("is instanceof TcPinpointError", () => {
    const err = new TcPinpointNetworkError("x");
    expect(err).toBeInstanceOf(TcPinpointError);
  });

  it("preserves the message", () => {
    const err = new TcPinpointNetworkError("timed out after 10s");
    expect(err.message).toBe("timed out after 10s");
  });
});

describe("TcPinpointValidationError", () => {
  it("has code VALIDATION and is not retryable", () => {
    const err = new TcPinpointValidationError("bad shape");
    expect(err.code).toBe("VALIDATION");
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("TcPinpointValidationError");
  });

  it("is instanceof TcPinpointError", () => {
    const err = new TcPinpointValidationError("x");
    expect(err).toBeInstanceOf(TcPinpointError);
  });

  it("carries the HTTP status a response gave it", async () => {
    const err = await errorFromResponse(new Response("{}", { status: 409 }), "Failed");
    expect(err).toBeInstanceOf(TcPinpointValidationError);
    expect((err as TcPinpointValidationError).status).toBe(409);
    expect(new TcPinpointValidationError("x").status).toBeUndefined();
  });
});

describe("thread failures", () => {
  it("tells a full thread from another failure, whether a store or an endpoint refused", async () => {
    expect(isThreadFull(new StoreLimitError())).toBe(true);
    expect(isThreadFull(await errorFromResponse(new Response("", { status: 409 }), "Failed"))).toBe(true);
    expect(isThreadFull(await errorFromResponse(new Response("", { status: 400 }), "Failed"))).toBe(false);
    expect(isThreadFull(new Error("offline"))).toBe(false);
  });

  it("tells a reply already gone from another failure, whether a store or an endpoint answered", async () => {
    expect(isCommentGone(new StoreNotFoundError())).toBe(true);
    expect(isCommentGone(await errorFromResponse(new Response("", { status: 404 }), "Failed"))).toBe(true);
    expect(isCommentGone(await errorFromResponse(new Response("", { status: 403 }), "Failed"))).toBe(false);
    expect(isCommentGone(new Error("offline"))).toBe(false);
  });

  it("reads the status of a custom source's own errors", () => {
    expect(isCommentGone(Object.assign(new Error("gone"), { status: 404 }))).toBe(true);
    expect(isThreadFull(Object.assign(new Error("full"), { status: 409 }))).toBe(true);
    expect(isThreadFull(Object.assign(new Error("teapot"), { status: 418 }))).toBe(false);
  });

  it("reads a store error's code, as another bundle's copy of core throws it", () => {
    expect(isThreadFull(Object.assign(new Error("full"), { code: "STORE_LIMIT" }))).toBe(true);
    expect(isCommentGone(Object.assign(new Error("gone"), { code: "STORE_NOT_FOUND" }))).toBe(true);
    expect(isCommentGone(Object.assign(new Error("full"), { code: "STORE_LIMIT" }))).toBe(false);
    expect(isThreadFull(Object.assign(new Error("gone"), { code: "STORE_NOT_FOUND" }))).toBe(false);
  });

  it("reads anything thrown, a primitive, null or undefined included", () => {
    for (const thrown of [null, undefined, 404, "409", Symbol("x")]) {
      expect(isThreadFull(thrown)).toBe(false);
      expect(isCommentGone(thrown)).toBe(false);
    }
  });
});

describe("TcPinpointAuthError", () => {
  it("has code AUTH and is not retryable", () => {
    const err = new TcPinpointAuthError("401", 401);
    expect(err.code).toBe("AUTH");
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("TcPinpointAuthError");
  });

  it("is instanceof TcPinpointError", () => {
    const err = new TcPinpointAuthError("x", 403);
    expect(err).toBeInstanceOf(TcPinpointError);
  });

  it("is distinguishable from TcPinpointValidationError despite both not retryable", () => {
    const auth = new TcPinpointAuthError("401", 401);
    const validation = new TcPinpointValidationError("400");
    expect(auth).toBeInstanceOf(TcPinpointAuthError);
    expect(auth).not.toBeInstanceOf(TcPinpointValidationError);
    expect(validation).toBeInstanceOf(TcPinpointValidationError);
    expect(validation).not.toBeInstanceOf(TcPinpointAuthError);
  });
});
