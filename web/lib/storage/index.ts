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
 * thumbnail stored next to it, and documents use a medium-size JPEG
 * variant (generated on first use, also next to it).
 *
 * Rendered documents (issued proforma PDFs/Excels) are stored under
 * documents/, with keys derived from the issue — never listed by the orphan
 * cleanup and never served by the files route.
 *
 * Not `server-only` so the tests can run it against a temporary directory;
 * only server code imports it.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const THUMBNAIL_SIZE = 320;
/** Width of the image variant embedded in PDFs and Excel files: sharp on paper, small files. */
export const MEDIUM_WIDTH = 600;

/** Top-level folders; each maps to a permission in the file route. */
export const STORAGE_FOLDERS = ["models", "company", "customers", "orders"] as const;
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
  `^(${STORAGE_FOLDERS.join("|")})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\\.thumb|\\.medium)?\\.(jpg|png|webp)$`,
);

/** documents/<issue id>.<language>.<pdf|xlsx> — one rendered file per issue, language and format. */
const DOCUMENT_KEY_RE =
  /^documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(tr|en|ar|en-ar)\.(pdf|xlsx)$/;

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

/** Key of the medium-size JPEG variant stored next to `key` (documents embed it). */
export function mediumKey(key: string): string {
  return key.replace(/\.(jpg|png|webp)$/, ".medium.jpg");
}

/** Key of a rendered document file. */
export function documentKey(issueId: string, language: string, format: "pdf" | "xlsx"): string {
  return `documents/${issueId}.${language}.${format}`;
}

export function isValidDocumentKey(key: string): boolean {
  return DOCUMENT_KEY_RE.test(key);
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
    if (!isValidKey(key) && !isValidDocumentKey(key)) throw new Error(`Invalid storage key "${key}"`);
    return path.join(root, ...key.split("/"));
  };

  const readIfExists = async (key: string): Promise<Buffer | null> => {
    try {
      return await readFile(resolve(key));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  };

  /** Writes a file that may be written concurrently by another request: the first one wins. */
  const writeOnce = async (key: string, bytes: Buffer) => {
    await mkdir(path.dirname(resolve(key)), { recursive: true });
    try {
      await writeFile(resolve(key), bytes, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
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
      const body = await readIfExists(key);
      return body && { body, contentType: CONTENT_TYPES[key.split(".").pop() ?? ""] };
    },

    /**
     * The medium-size JPEG of an image (MEDIUM_WIDTH wide at most, on white),
     * generated and stored on first use — also for images uploaded before
     * the variant existed. Null when the image doesn't exist.
     */
    async readMedium(key: string): Promise<{ body: Buffer; width: number; height: number } | null> {
      if (!isValidKey(key) || key.includes(".thumb.") || key.includes(".medium.")) return null;
      let body = await readIfExists(mediumKey(key));
      if (!body) {
        const original = await readIfExists(key);
        if (!original) return null;
        body = await sharp(original)
          .rotate()
          .resize({ width: MEDIUM_WIDTH, withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        await writeOnce(mediumKey(key), body);
      }
      const { width = 0, height = 0 } = await sharp(body).metadata();
      return { body, width, height };
    },

    /** A rendered document file, or null when it hasn't been rendered yet. */
    async readDocument(key: string): Promise<Buffer | null> {
      if (!isValidDocumentKey(key)) return null;
      return readIfExists(key);
    },

    /** Stores a rendered document file; when two requests render it at once, the first write wins. */
    async saveDocument(key: string, bytes: Buffer): Promise<void> {
      if (!isValidDocumentKey(key)) throw new Error(`Invalid document key "${key}"`);
      await writeOnce(key, bytes);
    },

    /**
     * Every stored file (images and their variants) with its modification time,
     * for the orphan cleanup (scripts/files-cleanup.ts). Files whose name
     * isn't a key this module generates are left out — never touched.
     */
    async list(): Promise<{ key: string; modifiedAt: Date }[]> {
      const files: { key: string; modifiedAt: Date }[] = [];
      for (const folder of STORAGE_FOLDERS) {
        let names: string[];
        try {
          names = await readdir(path.join(root, folder));
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
          throw error;
        }
        for (const name of names) {
          const key = `${folder}/${name}`;
          if (!isValidKey(key)) continue;
          const info = await stat(resolve(key));
          if (info.isFile()) files.push({ key, modifiedAt: info.mtime });
        }
      }
      return files;
    },

    /** Removes one stored file exactly (an image or a thumbnail); missing files are ignored. */
    async removeFile(key: string): Promise<void> {
      if (!isValidKey(key)) return;
      await rm(resolve(key), { force: true });
    },

    /** Removes an image and its variants (thumbnail, medium); missing files are ignored. */
    async remove(key: string): Promise<void> {
      if (!isValidKey(key)) return;
      await rm(resolve(key), { force: true });
      await rm(resolve(thumbnailKey(key)), { force: true });
      await rm(resolve(mediumKey(key)), { force: true });
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;

/** The app's storage, rooted at UPLOAD_DIR (relative paths: from the web/ working directory). */
export const storage: Storage = createStorage(path.resolve(process.env.UPLOAD_DIR || "./uploads"));
