import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStorage,
  documentKey,
  IMAGE_MAX_BYTES,
  isValidKey,
  MEDIUM_WIDTH,
  mediumKey,
  StorageError,
  thumbnailKey,
  type Storage,
} from "./index";

// A throw-away directory under web/uploads (git-ignored), removed afterwards.
const TMP_PARENT = path.resolve(import.meta.dirname, "../../uploads");
let root: string;
let storage: Storage;

beforeAll(async () => {
  await mkdir(TMP_PARENT, { recursive: true });
  root = await mkdtemp(path.join(TMP_PARENT, "test-"));
  storage = createStorage(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function image(format: "png" | "jpeg" | "webp" | "gif", width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: "#c0a080" } })
    .toFormat(format)
    .toBuffer();
}

function file(bytes: Uint8Array | string, name: string, type: string) {
  return new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name, { type });
}

async function rejectionCode(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(StorageError);
  return error instanceof StorageError ? error.code : null;
}

describe("storage.saveImage", () => {
  it("stores JPEG, PNG and WebP under a random key with a WebP thumbnail", async () => {
    const formats = [
      ["jpeg", "jpg"],
      ["png", "png"],
      ["webp", "webp"],
    ] as const;
    for (const [format, ext] of formats) {
      // The browser-sent name and type are ignored; the content decides.
      const upload = file(await image(format), "photo.bin", "application/octet-stream");
      const key = await storage.saveImage(upload, "models");
      expect(key).toMatch(new RegExp(`^models/[0-9a-f-]{36}\\.${ext}$`));
      expect(isValidKey(key)).toBe(true);

      const thumb = await storage.read(thumbnailKey(key));
      expect(thumb?.contentType).toBe("image/webp");
      const meta = await sharp(thumb!.body).metadata();
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(320);
    }

    const png = await image("png");
    const first = await storage.saveImage(file(png, "a.png", "image/png"), "models");
    const second = await storage.saveImage(file(png, "a.png", "image/png"), "models");
    expect(first).not.toBe(second);
  });

  it("rejects a text file, even named .jpg with an image MIME type", async () => {
    expect(await rejectionCode(storage.saveImage(file("hello", "notes.txt", "text/plain"), "models"))).toBe(
      "notAnImage",
    );
    const disguised = file("<script>alert(1)</script>", "photo.jpg", "image/jpeg");
    expect(await rejectionCode(storage.saveImage(disguised, "models"))).toBe("notAnImage");
  });

  it("rejects image formats we don't accept, including SVG", async () => {
    const gif = file(await image("gif"), "a.gif", "image/gif");
    expect(await rejectionCode(storage.saveImage(gif, "models"))).toBe("notAnImage");
    const svg = file(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      "logo.svg",
      "image/svg+xml",
    );
    expect(await rejectionCode(storage.saveImage(svg, "company"))).toBe("notAnImage");
  });

  it("rejects empty and oversized files", async () => {
    expect(await rejectionCode(storage.saveImage(file("", "a.png", "image/png"), "models"))).toBe("empty");
    const huge = file(new Uint8Array(IMAGE_MAX_BYTES + 1), "a.png", "image/png");
    expect(await rejectionCode(storage.saveImage(huge, "models"))).toBe("tooLarge");
  });

  it("writes nothing for rejected uploads", async () => {
    const before = await readdir(root, { recursive: true });
    await storage.saveImage(file("nope", "x.jpg", "image/jpeg"), "company").catch(() => {});
    expect(await readdir(root, { recursive: true })).toEqual(before);
  });
});

describe("storage keys", () => {
  it("only accepts keys the storage generated", async () => {
    expect(isValidKey("models/../../.env")).toBe(false);
    expect(isValidKey("models/0b5e3c1a-1111-4222-8333-944455556666.exe")).toBe(false);
    expect(isValidKey("secret/0b5e3c1a-1111-4222-8333-944455556666.png")).toBe(false);
    expect(await storage.read("../.env")).toBeNull();
    expect(await storage.read("models/0b5e3c1a-1111-4222-8333-944455556666.png")).toBeNull();
  });

  it("removes an image together with its thumbnail and medium variant", async () => {
    const key = await storage.saveImage(file(await image("png"), "a.png", "image/png"), "company");
    await storage.readMedium(key);
    await storage.remove(key);
    expect(await storage.read(key)).toBeNull();
    expect(await storage.read(thumbnailKey(key))).toBeNull();
    expect(await storage.read(mediumKey(key))).toBeNull();
  });
});

describe("storage.readMedium", () => {
  it("generates a JPEG at most 600 px wide on first use, keeps the aspect ratio, and reuses it", async () => {
    const key = await storage.saveImage(file(await image("png", 1800, 1200), "a.png", "image/png"), "models");
    // Images uploaded before the variant existed have none yet.
    expect(await storage.read(mediumKey(key))).toBeNull();

    const medium = await storage.readMedium(key);
    expect(medium).toMatchObject({ width: MEDIUM_WIDTH, height: 400 });
    expect((await sharp(medium!.body).metadata()).format).toBe("jpeg");
    expect((await storage.read(mediumKey(key)))?.body.equals(medium!.body)).toBe(true);
    expect((await storage.readMedium(key))?.body.equals(medium!.body)).toBe(true);
  });

  it("never enlarges small images and returns null for missing ones", async () => {
    const key = await storage.saveImage(file(await image("jpeg", 300, 500), "a.jpg", "image/jpeg"), "orders");
    expect(await storage.readMedium(key)).toMatchObject({ width: 300, height: 500 });
    expect(await storage.readMedium("orders/0b5e3c1a-1111-4222-8333-944455556666.png")).toBeNull();
    expect(await storage.readMedium(thumbnailKey(key))).toBeNull();
  });
});

describe("rendered documents", () => {
  const issue = "0b5e3c1a-1111-4222-8333-944455556666";

  it("stores one file per issue, language and format; the first write wins", async () => {
    const key = documentKey(issue, "en-ar", "pdf");
    expect(await storage.readDocument(key)).toBeNull();
    await storage.saveDocument(key, Buffer.from("first"));
    await storage.saveDocument(key, Buffer.from("second"));
    expect((await storage.readDocument(key))?.toString()).toBe("first");
    // Not an image: the files route never serves it, and the orphan cleanup never lists it.
    expect(isValidKey(key)).toBe(false);
    expect((await storage.list()).some((entry) => entry.key.startsWith("documents/"))).toBe(false);
  });

  it("refuses keys it didn't derive", async () => {
    await expect(storage.saveDocument("documents/../../.env", Buffer.from("x"))).rejects.toThrow();
    expect(await storage.readDocument(`documents/${issue}.de.pdf`)).toBeNull();
  });
});
