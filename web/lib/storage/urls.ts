/** URL of an uploaded file, served by app/api/files/[...key]/route.ts. */
export function fileUrl(key: string, options: { thumb?: boolean } = {}): string {
  return `/api/files/${key}${options.thumb ? "?thumb=1" : ""}`;
}
