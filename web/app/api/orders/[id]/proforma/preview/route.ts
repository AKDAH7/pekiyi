import type { NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { fileResponse, mayReadProformas } from "@/lib/documents/http";
import { RenderTimeoutError } from "@/lib/documents/pdf";
import { draftProformaPdf } from "@/lib/documents/proforma/service";
import { proformaFileSchema } from "@/lib/validation/orders";

/**
 * Draft preview of an order's proforma (`?lang=`, default: the customer's
 * document language): built from the saved order right now, marked DRAFT,
 * never stored. Opens in the browser tab.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const parsed = proformaFileSchema
    .omit({ issueId: true, format: true })
    .safeParse({ ...(await ctx.params), ...Object.fromEntries(request.nextUrl.searchParams) });
  if (!parsed.success) return new Response(null, { status: 404 });

  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  if (!mayReadProformas(session.user.role)) return new Response(null, { status: 403 });

  const { id, lang } = parsed.data;
  try {
    const file = await draftProformaPdf(id, lang);
    if (!file) return new Response(null, { status: 404 });
    return fileResponse(file, "inline", "no-store");
  } catch (error) {
    if (error instanceof RenderTimeoutError) return new Response(null, { status: 503 });
    throw error;
  }
}
