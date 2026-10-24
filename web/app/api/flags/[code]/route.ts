import * as flags from "country-flag-icons/string/3x2";

import { isCountryCode } from "@/lib/domain/countries";

const SVGS: Record<string, string> = flags;

/**
 * Country flags as SVG (from country-flag-icons). Emoji flags aren't an
 * option: Windows shows them as two letters. Public static content, so no
 * session check, and cacheable for a long time.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const svg = isCountryCode(code) ? SVGS[code] : undefined;
  if (!svg) return new Response(null, { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
