import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const source = (pkg: string, entry = "index") =>
  fileURLToPath(new URL(`packages/${pkg}/src/${entry}.ts`, import.meta.url));

export default defineConfig({
  esbuild: {
    // Use the automatic JSX runtime so `*.test.tsx` files don't need a `React`
    // import in scope. Matches Next.js / modern React defaults.
    jsx: "automatic",
  },
  resolve: {
    conditions: ["import", "module", "default"],
    // These packages export only their built `dist`. Tests that import one resolve it to
    // source, like `@tc-pinpoint/core`, so they need no prior build.
    alias: {
      "@tc-pinpoint/adapter-memory": source("adapter-memory"),
      "@tc-pinpoint/server": source("server"),
    },
  },
  test: {
    include: ["packages/**/__tests__/**/*.test.{ts,tsx}"],
    // Type-level tests: *.test-d.ts files are statically checked by tsc via
    // vitest's typecheck mode (they never execute). They lock the public
    // contracts — config unions rejecting invalid combos, the store
    // interface, event maps — so a d.ts-breaking refactor fails `test:run`
    // instead of a downstream consumer.
    typecheck: {
      enabled: true,
      include: ["packages/**/__tests__/**/*.test-d.{ts,tsx}"],
      tsconfig: "./tsconfig.typecheck.json",
    },
    // Cap workers so a local run leaves CPU headroom for the editor — on WSL2
    // vscode-server shares the VM and a full-core run freezes it. Don't go
    // lower: jsdom DOMs are retained in the heap, and a worker reused across
    // more files balloons to ~15 GB at 2. No-op in CI (≤4 cores).
    // (vitest 4 replaced poolOptions.forks.maxForks with top-level maxWorkers.)
    maxWorkers: 4,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov", "json-summary"],
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "**/index.ts",
        "**/icons.{ts,tsx}",
        "**/styles/**",
      ],
      thresholds: {
        lines: 95,
        functions: 94,
        branches: 88,
        statements: 95,
      },
    },
  },
});
