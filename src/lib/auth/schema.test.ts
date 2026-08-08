import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { MEMBER_ROLE } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { closeTestDatabase, resetTestDatabase } from "@/test/db";

beforeEach(resetTestDatabase);
afterAll(closeTestDatabase);

describe("the migrated schema", () => {
  it("carries role and deactivation state on the user table", async () => {
    const columns = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'user'`,
    );
    const names = columns.rows.map((row) => row.column_name);

    expect(names).toContain("role");
    expect(names).toContain("banned");
    expect(names).toContain("ban_reason");
    expect(names).toContain("ban_expires");
  });
});

describe("account creation", () => {
  it("defaults new accounts to the member role", async () => {
    await auth.api.signUpEmail({
      body: {
        email: "nybliven@example.com",
        password: "a-long-enough-password",
        name: "Ny Bliven",
      },
    });

    const [created] = await db
      .select()
      .from(user)
      .where(eq(user.email, "nybliven@example.com"));

    expect(created?.role).toBe(MEMBER_ROLE);
  });

  it("defaults new accounts to active", async () => {
    await auth.api.signUpEmail({
      body: {
        email: "aktiv@example.com",
        password: "a-long-enough-password",
        name: "Aktiv Sangare",
      },
    });

    const [created] = await db
      .select()
      .from(user)
      .where(eq(user.email, "aktiv@example.com"));

    expect(created?.banned).toBe(false);
  });
});
