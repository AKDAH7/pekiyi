/**
 * Local-disk file storage for uploads (CLAUDE.md: "File uploads").
 *
 * Callers only ever see opaque keys like "models/<uuid>.jpg"; the DB stores
 * the key, never a path or URL. Files live under UPLOAD_DIR (default
 * ./uploads, git-ignored) and are served by the authenticated route handler
 * app/api/files/[...key]/route.ts — never from /public. Swapping this module
 * for S3-compatible storage later keeps the same interface.
 *
 * Images only (JPEG/PNG/WebP, ≤ 10 MB). The type is decided by decoding the
 * file with sharp, not by its name or the browser-sent MIME type, so a
 * renamed .exe or an HTML file can't get in. Each image gets a WebP
 * thumbnail stored next to it.
 *
 * Not `server-only` so the tests can run it against a temporary directory;
 * only server code imports it.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const THUMBNAIL_SIZE = 320;

/** Top-level folders; each maps to a permission in the file route. */
export const STORAGE_FOLDERS = ["models", "company"] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

const FORMATS = {
  jpeg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
  webp: { ext: "webp", contentType: "image/webp" },
} as const;

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const KEY_RE = new RegExp(
  `^(${STORAGE_FOLDERS.join("|")})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\\.thumb)?\\.(jpg|png|webp)$`,
);

export type StorageErrorCode = "empty" | "tooLarge" | "notAnImage";

export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(`Upload rejected: ${code}`);
    this.name = "StorageError";
  }
}

/** Key of the thumbnail stored next to `key`. */
export function thumbnailKey(key: string): string {
  return key.replace(/\.(jpg|png|webp)$/, ".thumb.webp");
}

/** Only keys this module generated are accepted — no "../" tricks. */
export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Validates an upload and returns its detected format. */
async function detectImage(bytes: Buffer): Promise<keyof typeof FORMATS> {
  try {
    const { format } = await sharp(bytes).metadata();
    if (format && Object.hasOwn(FORMATS, format)) return format as keyof typeof FORMATS;
  } catch {
    // Not decodable as an image at all.
  }
  throw new StorageError("notAnImage");
}

export function createStorage(root: string) {
  const resolve = (key: string) => {
    if (!isValidKey(key)) throw new Error(`Invalid storage key "${key}"`);
    return path.join(root, ...key.split("/"));
  };

  return {
    /** Saves an uploaded image under a random name; returns its key. */
    async saveImage(file: Blob, folder: StorageFolder): Promise<string> {
      if (file.size === 0) throw new StorageError("empty");
      if (file.size > IMAGE_MAX_BYTES) throw new StorageError("tooLarge");
      const bytes = Buffer.from(await file.arrayBuffer());
      const format = await detectImage(bytes);

      const key = `${folder}/${randomUUID()}.${FORMATS[format].ext}`;
      const thumbnail = await sharp(bytes)
        .rotate() // honour EXIF orientation from phone photos
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      await mkdir(path.join(root, folder), { recursive: true });
      await writeFile(resolve(key), bytes, { flag: "wx" });
      await writeFile(resolve(thumbnailKey(key)), thumbnail, { flag: "wx" });
      return key;
    },

    /** File contents and type, or null when it doesn't exist. */
    async read(key: string): Promise<{ body: Buffer; contentType: string } | null> {
      if (!isValidKey(key)) return null;
      try {
        const body = await readFile(resolve(key));
        return { body, contentType: CONTENT_TYPES[key.split(".").pop() ?? ""] };
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },

    /** Removes an image and its thumbnail; missing files are ignored. */
    async remove(key: string): Promise<void> {
      if (!isValidKey(key)) return;
      await rm(resolve(key), { force: true });
      await rm(resolve(thumbnailKey(key)), { force: true });
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;

/** The app's storage, rooted at UPLOAD_DIR (relative paths: from the web/ working directory). */
export const storage: Storage = createStorage(path.resolve(process.env.UPLOAD_DIR || "./uploads"));
