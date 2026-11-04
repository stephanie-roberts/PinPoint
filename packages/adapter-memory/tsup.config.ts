import { defineConfig } from "tsup";
import { pinPointLibrary } from "../../tsup.preset.js";

export default defineConfig(pinPointLibrary({ platform: "neutral" }));
