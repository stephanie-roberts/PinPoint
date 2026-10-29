import { defineConfig } from "tsup";
import { tcPinpointLibrary } from "../../tsup.preset.js";

export default defineConfig(tcPinpointLibrary({ platform: "browser" }));
