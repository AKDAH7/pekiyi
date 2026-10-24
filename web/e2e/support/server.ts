/**
 * The Next.js server the e2e run tests against: a production build in its
 * own directory (.next-e2e, so a running `pnpm dev` is never disturbed),
 * started on E2E_PORT with DATABASE_URL pointing at the test database.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

import { WEB_DIR } from "../../test/test-db";

import { BASE_URL, E2E_PORT } from "./accounts";

export const DIST_DIR = ".next-e2e";
export const UPLOAD_DIR = path.join(WEB_DIR, ".e2e-uploads");

/** Env of the build and the server: everything points at test resources. */
export function serverEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: BASE_URL,
    NEXT_PUBLIC_APP_URL: BASE_URL,
    UPLOAD_DIR,
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/** Rejects when something already listens on the port — we never stop other processes. */
export async function assertPortFree(port = E2E_PORT): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(new Error(`Port ${port} is already in use. Stop whatever runs there, then rerun the e2e tests.`)),
    );
    probe.listen(port, () => probe.close(() => resolve()));
  });
}

/**
 * `next build` rewrites next-env.d.ts (and may touch tsconfig.json) to point
 * at its distDir; put them back so the dev setup and `tsc` stay as they are.
 */
export function buildApp(env: NodeJS.ProcessEnv): void {
  const files = ["next-env.d.ts", "tsconfig.json"].map((name) => path.join(WEB_DIR, name));
  const saved = files.map((file) => readFileSync(file, "utf8"));
  try {
    const result = spawnSync("pnpm", ["exec", "next", "build"], { cwd: WEB_DIR, env, stdio: "inherit", shell: true });
    if (result.status !== 0) throw new Error(`next build failed (exit ${result.status}).`);
  } finally {
    files.forEach((file, index) => writeFileSync(file, saved[index]));
  }
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
}

/** Starts `next start` and resolves with a function that stops it once it answers. */
export async function startApp(env: NodeJS.ProcessEnv): Promise<() => Promise<void>> {
  const child = spawn("pnpm", ["exec", "next", "start", "-p", String(E2E_PORT)], {
    cwd: WEB_DIR,
    env,
    stdio: ["ignore", "inherit", "inherit"],
    shell: true,
    detached: process.platform !== "win32",
  });
  const stop = async () => {
    killTree(child);
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited early (exit ${child.exitCode}).`);
    try {
      const response = await fetch(`${BASE_URL}/tr/login`, { redirect: "manual" });
      if (response.status < 500) return stop;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await stop();
  throw new Error(`The e2e server did not answer on ${BASE_URL} within 120 s.`);
}
