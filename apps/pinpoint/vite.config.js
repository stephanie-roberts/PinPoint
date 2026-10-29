import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The inbox is served by server.js: through Vite in `npm run dev`, from dist/ after `npm run build`.
export default defineConfig({
  plugins: [tailwindcss()],
});
