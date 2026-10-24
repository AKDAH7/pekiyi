import "server-only";

import { fieldError, type FormState } from "@/lib/forms";
import { storage, StorageError, type StorageFolder } from "@/lib/storage";

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
 * After the transaction: on success the replaced image is deleted, on
 * failure the freshly uploaded one, so no orphan files pile up. `replaced`
 * is the old key only when the image was actually swapped or removed.
 */
export async function settleImages(
  state: FormState,
  images: { uploaded: string | null; replaced: string | null },
): Promise<void> {
  const obsolete = state.status === "success" ? images.replaced : images.uploaded;
  if (obsolete) await storage.remove(obsolete);
}
