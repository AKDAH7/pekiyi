import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, "../../.env") });

// This script runs under plain Node (via tsx), not inside Next.js's bundler,
// so it cannot import anything guarded by `import "server-only"`
// (web/db/index.ts, web/lib/auth/auth.ts) — that guard throws unconditionally
// outside a webpack/turbopack build. Build an equivalent, unguarded db/auth
// setup here instead of sharing those modules.
async function main() {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { eq } = await import("drizzle-orm");
  const schema = await import("./schema");
  const { betterAuth } = await import("better-auth");
  const { drizzleAdapter } = await import("better-auth/adapters/drizzle");
  const { admin } = await import("better-auth/plugins");
  const { ac, roles } = await import("../lib/auth/permissions");

  const queryClient = postgres(process.env.DATABASE_URL!);
  const db = drizzle(queryClient, { schema });

  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      additionalFields: {
        preferredLocale: { type: "string", defaultValue: "tr", input: false },
      },
    },
    plugins: [admin({ ac, roles, defaultRole: "export", adminRoles: ["admin"] })],
  });

  async function createUserIfMissing(options: {
    email: string;
    password: string;
    name: string;
    role: "admin" | "export" | "production";
    preferredLocale: "tr" | "ar" | "en";
  }) {
    const { email, password, name, role, preferredLocale } = options;

    const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);

    if (existing) {
      console.log(`User already exists (${email}) — nothing to do.`);
      return;
    }

    await auth.api.createUser({
      body: { email, password, name, role, data: { preferredLocale } },
    });

    console.log(`Created user: ${email} (role: ${role}, locale: ${preferredLocale})`);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME;

  if (!adminEmail || !adminPassword || !adminName) {
    throw new Error(
      "SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_ADMIN_NAME must be set in .env",
    );
  }

  await createUserIfMissing({
    email: adminEmail,
    password: adminPassword,
    name: adminName,
    role: "admin",
    preferredLocale: "tr",
  });

  if (process.env.SEED_TEST_USERS === "true") {
    const exportEmail = process.env.SEED_EXPORT_EMAIL;
    const exportPassword = process.env.SEED_EXPORT_PASSWORD;
    const exportName = process.env.SEED_EXPORT_NAME;
    const productionEmail = process.env.SEED_PRODUCTION_EMAIL;
    const productionPassword = process.env.SEED_PRODUCTION_PASSWORD;
    const productionName = process.env.SEED_PRODUCTION_NAME;

    if (
      !exportEmail ||
      !exportPassword ||
      !exportName ||
      !productionEmail ||
      !productionPassword ||
      !productionName
    ) {
      throw new Error(
        "SEED_TEST_USERS=true requires SEED_EXPORT_EMAIL/PASSWORD/NAME and " +
          "SEED_PRODUCTION_EMAIL/PASSWORD/NAME to be set in .env",
      );
    }

    await createUserIfMissing({
      email: exportEmail,
      password: exportPassword,
      name: exportName,
      role: "export",
      preferredLocale: "ar",
    });

    await createUserIfMissing({
      email: productionEmail,
      password: productionPassword,
      name: productionName,
      role: "production",
      preferredLocale: "tr",
    });
  }

  // Business reference data + optional fixtures. Insert-only: rows that
  // already exist (edited in the app or not) are never overwritten.
  const { loadSeedData } = await import("./seed/data");
  const { seedReferenceData } = await import("./seed/reference");
  const { seedFixtures } = await import("./seed/fixtures");

  const data = loadSeedData();
  const printReport = (title: string, report: Record<string, number>) => {
    const entries = Object.entries(report).filter(([, inserted]) => inserted > 0);
    console.log(
      entries.length === 0
        ? `${title}: everything already present — nothing inserted.`
        : `${title}: inserted ${entries.map(([table, n]) => `${table}=${n}`).join(", ")}`,
    );
  };

  printReport("Reference data", await seedReferenceData(db, data));

  if (process.env.SEED_FIXTURES === "true") {
    printReport("Fixtures", await seedFixtures(db, data));
  }

  console.log("\nSource-data warnings (fix these in the app; the seed never overwrites):");
  for (const warning of data.catalogWarnings) console.log(`  [catalog] ${warning}`);
  for (const account of data.bank.accounts) {
    if (account.note) console.log(`  [bank ${account.currency}] ${account.note}`);
  }
  for (const order of data.sampleOrders) {
    for (const issue of order.sourceIssues ?? []) console.log(`  [order ${order.number}] ${issue}`);
  }

  await queryClient.end();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
