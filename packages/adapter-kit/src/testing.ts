/**
 * The `TcPinpointStore` conformance suite, published for third-party adapter
 * authors (requires `vitest` — an optional peer dependency of this
 * package).
 *
 * @example
 * ```ts
 * import { testTcPinpointStore } from "@tc-pinpoint/adapter-kit/testing";
 * import { DrizzleStore } from "../src/index.js";
 *
 * testTcPinpointStore(() => new DrizzleStore(db));
 * ```
 */

export type { StoreConformanceOptions } from "@tc-pinpoint/core/testing";
export { testTcPinpointStore } from "@tc-pinpoint/core/testing";
