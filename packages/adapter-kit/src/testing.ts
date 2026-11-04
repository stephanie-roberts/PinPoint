/**
 * The `PinPointStore` conformance suite, published for third-party adapter
 * authors (requires `vitest` — an optional peer dependency of this
 * package).
 *
 * @example
 * ```ts
 * import { testPinPointStore } from "@pinpoint/adapter-kit/testing";
 * import { DrizzleStore } from "../src/index.js";
 *
 * testPinPointStore(() => new DrizzleStore(db));
 * ```
 */

export type { StoreConformanceOptions } from "@pinpoint/core/testing";
export { testPinPointStore } from "@pinpoint/core/testing";
