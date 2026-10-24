# Document fonts

Embedded into every generated PDF via `@font-face` data URIs (`lib/documents/proforma/html.ts`) —
never fetched from the internet at render time.

| File | Font | Covers | License |
| --- | --- | --- | --- |
| `noto-sans-latin-*.woff2` | Noto Sans | Basic Latin, digits | SIL OFL 1.1 (`OFL-NotoSans.txt`) |
| `noto-sans-latin-ext-*.woff2` | Noto Sans | Latin Extended (Turkish ğ ş ı İ …) | SIL OFL 1.1 (`OFL-NotoSans.txt`) |
| `ibm-plex-sans-arabic-arabic-*.woff2` | IBM Plex Sans Arabic | Arabic | SIL OFL 1.1 (`OFL-IBMPlexSansArabic.txt`) |

Weights 400 and 700, from the `@fontsource/*` 5.3.0 packages. IBM Plex Sans Arabic rather than
Noto Sans Arabic: Noto draws the dots as separate mark glyphs, which makes the Arabic text of a
PDF come out as dotless letters when it is copied or searched.
