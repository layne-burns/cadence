// `vitest/config`'s defineConfig re-exports Vite's, plus a typed `test`
// field, so one config file covers both instead of a separate
// vitest.config.ts that could drift from the Vite setup.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `base` gets set to '/cadence/' in Phase 7 when we wire up GitHub Pages —
  // left as default here so `npm run dev` keeps working at the root during
  // local development.
  test: {
    // Engine tests are pure functions (no DOM). If component tests get
    // added in a later phase, give that suite its own project/environment
    // rather than switching everything to jsdom here.
    environment: "node",
  },
});
