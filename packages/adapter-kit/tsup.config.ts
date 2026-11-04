import { defineConfig } from "tsup";
import { pinPointLibrary } from "../../tsup.preset.js";

// vitest stays external automatically (optional peer, only needed by ./testing).
export default defineConfig(
  pinPointLibrary({
    platform: "neutral",
    entry: ["src/index.ts", "src/testing.ts"],
  }),
);
