// `vitest/config`'s defineConfig re-exports Vite's, plus a typed `test`
// field, so one config file covers both instead of a separate
// vitest.config.ts that could drift from the Vite setup.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages serves a project site from `/<repo>/`, not the domain
 * root, so built asset URLs need that prefix. Dev stays at `/` — a dev
 * server that only answers on `/cadence/` is a papercut every time you
 * open it. If this ever moves to a root domain (Netlify, a custom
 * domain), set this to "/" and the manifest's start_url/scope follow
 * automatically, since they're derived from `base` below.
 */
const GITHUB_PAGES_BASE = "/cadence/";

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => {
  // `vite preview` reports command === "serve", so checking `command`
  // alone would serve the built app at "/" while its own HTML asks for
  // "/cadence/…" — preview would 404 on every asset and be useless for
  // catching base-path problems before they ship. `isPreview` is the
  // distinction that actually matters here.
  const base = command === "build" || isPreview ? GITHUB_PAGES_BASE : "/";

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // No "an update is available, reload?" prompt: this is a personal
        // scheduling tool with no unsaved-form state worth protecting, so
        // silently taking the new version on next load is strictly less
        // friction than asking someone with ADHD to service their app.
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: ["icon.svg", "apple-touch-icon.png"],
        manifest: {
          name: "Cadence",
          short_name: "Cadence",
          description:
            "A time-blocked daily schedule with recovery tools, built for ADHD.",
          lang: "en",
          start_url: base,
          scope: base,
          display: "standalone",
          theme_color: "#4f46e5",
          background_color: "#ffffff",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        },
      }),
    ],
    test: {
      // Engine tests are pure functions (no DOM). If component tests get
      // added in a later phase, give that suite its own project/environment
      // rather than switching everything to jsdom here.
      environment: "node",
    },
  };
});
