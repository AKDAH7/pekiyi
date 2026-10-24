/**
 * `pnpm files:cleanup [--apply]` — removes uploaded files nothing uses any
 * more: files under UPLOAD_DIR older than 24 h that no table references and
 * no issued document's snapshot mentions (lib/storage/references.ts).
 * Such orphans come from uploads whose form was never saved, or from a
 * removal that failed half-way.
 *
 * Dry run by default: lists what it would delete. `--apply` deletes.
 * Runs against DATABASE_URL and the app's UPLOAD_DIR, like the app itself.
 */
import path from "node:path";

import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const schema = await import("../db/schema");
  const { storage } = await import("../lib/storage");
  const { findOrphans, loadReferencedKeys } = await import("../lib/storage/references");

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    const [files, referenced] = await Promise.all([storage.list(), loadReferencedKeys(db)]);
    const orphans = findOrphans(files, referenced, new Date());

    console.log(`${files.length} files in ${path.resolve(process.env.UPLOAD_DIR || "./uploads")}, ${orphans.length} unused and older than 24 h.`);
    for (const key of orphans) console.log(`  ${apply ? "deleting" : "would delete"} ${key}`);
    if (apply) {
      for (const key of orphans) await storage.removeFile(key);
      console.log(`Deleted ${orphans.length} files.`);
    } else if (orphans.length > 0) {
      console.log("Dry run — nothing deleted. Run with --apply to delete them.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
