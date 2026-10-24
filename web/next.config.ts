import path from "node:path";
import type { NextConfig } from "next";
import { config } from "dotenv";
import createNextIntlPlugin from "next-intl/plugin";

// Environment variables live in the repo-root `.env` (one level above this
// `web` package), not in `web/.env` — Next.js only auto-loads the latter, so
// load the root file explicitly before anything reads `process.env`.
config({ path: path.resolve(__dirname, "../.env") });

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Enables `forbidden()` + forbidden.tsx, used by requirePermission() to
    // render the "No permission" page instead of redirecting.
    authInterrupts: true,
    // Photo/logo uploads go through server actions: up to 10 MB per image
    // (lib/storage) plus multipart overhead and the other form fields. The
    // proxy buffers request bodies too, so it needs the same headroom.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
