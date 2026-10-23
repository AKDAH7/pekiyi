import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";

import { ac, roles } from "./permissions";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // No public self-registration — every user is created by an admin.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      preferredLocale: {
        type: "string",
        defaultValue: "tr",
        input: false,
      },
    },
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "export",
      adminRoles: ["admin"],
    }),
    // Must stay last: makes auth.api.* calls from server actions/components
    // write session cookies via next/headers automatically.
    nextCookies(),
  ],
});
