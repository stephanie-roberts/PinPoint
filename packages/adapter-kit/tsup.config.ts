import { defineConfig } from "tsup";
import { tcPinpointLibrary } from "../../tsup.preset.js";

// vitest stays external automatically (optional peer, only needed by ./testing).
export default defineConfig(
  tcPinpointLibrary({
    platform: "neutral",
    entry: ["src/index.ts", "src/testing.ts"],
  }),
);
