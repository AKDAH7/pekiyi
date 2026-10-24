import "server-only";

import { can } from "@/lib/auth/permissions";

/** Proformas carry prices: the roles that read proformas and see prices (admin, export). Production: 403. */
export function mayReadProformas(role: string | null | undefined): boolean {
  return can(role, "proformas", "read") && can(role, "prices", "read");
}

/** A generated document as the response: `inline` opens it in the browser tab, `attachment` downloads it. */
export function fileResponse(
  file: { body: Buffer; fileName: string; contentType: string },
  disposition: "inline" | "attachment",
  cache: "private" | "no-store",
): Response {
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.length),
      // File names are ASCII already (proformaFileName); filename* for completeness.
      "Content-Disposition": `${disposition}; filename="${file.fileName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": cache === "private" ? "private, max-age=3600" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
