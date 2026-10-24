import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStorage,
  IMAGE_MAX_BYTES,
  isValidKey,
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

  it("removes an image together with its thumbnail", async () => {
    const key = await storage.saveImage(file(await image("png"), "a.png", "image/png"), "company");
    await storage.remove(key);
    expect(await storage.read(key)).toBeNull();
    expect(await storage.read(thumbnailKey(key))).toBeNull();
  });
});
