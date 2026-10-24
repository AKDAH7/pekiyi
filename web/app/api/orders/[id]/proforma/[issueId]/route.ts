import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { fileResponse, mayReadProformas } from "@/lib/documents/http";
import { RenderTimeoutError } from "@/lib/documents/pdf";
import { issuedProformaFile } from "@/lib/documents/proforma/service";
import { proformaFileSchema } from "@/lib/validation/orders";

/**
 * Downloads an issued proforma revision: `?format=pdf|xlsx&lang=en|tr|ar|en-ar`
 * (default: the language picked when it was issued). Rendered on the first
 * request per (issue, language, format) and stored; later requests get the
 * same file.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string; issueId: string }> }) {
  const parsed = proformaFileSchema
    .required({ issueId: true })
    .safeParse({ ...(await ctx.params), ...Object.fromEntries(request.nextUrl.searchParams) });
  if (!parsed.success) return new Response(null, { status: 404 });

  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  if (!mayReadProformas(session.user.role)) return new Response(null, { status: 403 });

  const { id, issueId, format, lang } = parsed.data;
  try {
    const file = await issuedProformaFile(id, issueId, lang, format);
    if (!file) return new Response(null, { status: 404 });
    return fileResponse(file, "attachment", "private");
  } catch (error) {
    if (error instanceof RenderTimeoutError) return new Response(null, { status: 503 });
    throw error;
  }
}
