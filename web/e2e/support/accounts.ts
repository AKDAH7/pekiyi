/**
 * Fixed accounts the e2e global setup seeds into the test database (passed
 * to db/seed.ts as SEED_* env vars, which win over the repo-root .env). They
 * exist only in DATABASE_URL_TEST, so the passwords are not secrets.
 */
export const ACCOUNTS = {
  admin: { email: "admin@pekiyi.test", password: "e2e-admin-password", name: "E2E Admin" },
  // The seed gives the export user Arabic as preferred language.
  export: { email: "export@pekiyi.test", password: "e2e-export-password", name: "E2E Export" },
  production: {
    email: "production@pekiyi.test",
    password: "e2e-production-password",
    name: "E2E Production",
  },
} as const;

export type AccountRole = keyof typeof ACCOUNTS;

export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;

/** Where each role's signed-in browser state is saved by auth.setup.ts. */
export const storageStatePath = (role: AccountRole) => `e2e/.auth/${role}.json`;

/** Env for db/seed.ts: the accounts above, the test users and the fixtures. */
export function seedEnv(): Record<string, string> {
  return {
    SEED_ADMIN_EMAIL: ACCOUNTS.admin.email,
    SEED_ADMIN_PASSWORD: ACCOUNTS.admin.password,
    SEED_ADMIN_NAME: ACCOUNTS.admin.name,
    SEED_TEST_USERS: "true",
    SEED_EXPORT_EMAIL: ACCOUNTS.export.email,
    SEED_EXPORT_PASSWORD: ACCOUNTS.export.password,
    SEED_EXPORT_NAME: ACCOUNTS.export.name,
    SEED_PRODUCTION_EMAIL: ACCOUNTS.production.email,
    SEED_PRODUCTION_PASSWORD: ACCOUNTS.production.password,
    SEED_PRODUCTION_NAME: ACCOUNTS.production.name,
    SEED_FIXTURES: "true",
  };
}
