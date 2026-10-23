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
