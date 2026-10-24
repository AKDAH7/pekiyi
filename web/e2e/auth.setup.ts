import { test as setup } from "@playwright/test";

import { ROLES } from "@/lib/auth/permissions";

import { storageStatePath } from "./support/accounts";
import { loginAs } from "./support/fixtures";

// Signs every seeded role in once; the specs reuse these sessions.
for (const role of ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await loginAs(page, role);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
