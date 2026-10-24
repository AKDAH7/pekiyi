import type { NextRequest } from "next/server";

import { can } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { isValidKey, storage, thumbnailKey, type StorageFolder } from "@/lib/storage";

/** Who may read each storage folder. */
const FOLDER_ACCESS: Record<StorageFolder, (role: string | null | undefined) => boolean> = {
  models: (role) => can(role, "catalog", "read"),
  // The company logo appears on every document, so every signed-in user may load it.
  company: () => true,
  // Customer logos (labels with the customer's branding).
  customers: (role) => can(role, "customers", "read"),
  // Per-line photos of an order; the production sheet will show them too.
  orders: (role) => can(role, "orders", "read") || can(role, "production", "read"),
};

/**
 * Serves uploaded files to signed-in users only. `?thumb=1` returns the
 * thumbnail. Keys are random and a file is never overwritten, so responses
 * can be cached for a year — but only by the browser (`private`), since they
 * sit behind a login.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });

  const { key: segments } = await ctx.params;
  let key = segments.join("/");
  if (!isValidKey(key)) return new Response(null, { status: 404 });

  const folder = key.split("/")[0] as StorageFolder;
  if (!FOLDER_ACCESS[folder](session.user.role)) return new Response(null, { status: 403 });

  if (request.nextUrl.searchParams.get("thumb") === "1") key = thumbnailKey(key);
  const file = await storage.read(key);
  if (!file) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
