import "server-only";

import { db } from "@/db";
import { fieldError, type FormState } from "@/lib/forms";
import { storage, StorageError, type StorageFolder } from "@/lib/storage";
import { keysInIssuedDocuments } from "@/lib/storage/references";

const ERROR_KEYS = {
  empty: "imageEmpty",
  tooLarge: "imageTooLarge",
  notAnImage: "notAnImage",
} as const;

/**
 * Stores an uploaded image for a form field. Returns its key, or the
 * translated field error when the file is rejected.
 */
export async function saveFormImage(
  file: File,
  folder: StorageFolder,
  field: string,
): Promise<{ key: string } | { error: FormState }> {
  try {
    return { key: await storage.saveImage(file, folder) };
  } catch (error) {
    if (error instanceof StorageError) return { error: await fieldError(field, ERROR_KEYS[error.code]) };
    throw error;
  }
}

/**
 * Deletes images no record uses any more — except those an issued
 * document's snapshot still mentions: issued documents are frozen and must
 * keep their photos and logos. Call after the transaction committed.
 */
export async function removeImages(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const issued = await keysInIssuedDocuments(db, keys);
  for (const key of keys) if (!issued.has(key)) await storage.remove(key);
}

/**
 * After the transaction: on success the replaced image is deleted, on
 * failure the freshly uploaded one, so no orphan files pile up. `replaced`
 * is the old key only when the image was actually swapped or removed.
 */
export async function settleImages(
  state: FormState,
  images: { uploaded: string | null; replaced: string | null },
): Promise<void> {
  const obsolete = state.status === "success" ? images.replaced : images.uploaded;
  if (obsolete) await removeImages([obsolete]);
}
