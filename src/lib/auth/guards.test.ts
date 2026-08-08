import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
  AuthorizationError,
  getCurrentSession,
  requireAdmin,
} from "@/lib/auth/guards";
import { ADMIN_ROLE } from "@/lib/auth/roles";
import { closeTestDatabase, resetTestDatabase } from "@/test/db";
import { createAdmin, createMember, signInAs } from "@/test/factories";

beforeEach(resetTestDatabase);
afterAll(closeTestDatabase);

describe("requireAdmin", () => {
  it("rejects an anonymous caller", async () => {
    const error = await requireAdmin(new Headers()).catch((e) => e);

    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.reason).toBe("unauthenticated");
    expect(error.status).toBe(401);
  });

  it("rejects a Member", async () => {
    await createMember({ email: "medlem@example.com" });
    const headers = await signInAs("medlem@example.com");

    const error = await requireAdmin(headers).catch((e) => e);

    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.reason).toBe("not-admin");
    expect(error.status).toBe(403);
  });

  it("permits an Admin and hands back the session", async () => {
    await createAdmin({ email: "chef@example.com" });
    const headers = await signInAs("chef@example.com");

    const session = await requireAdmin(headers);

    expect(session.user.email).toBe("chef@example.com");
    expect(session.user.role).toBe(ADMIN_ROLE);
  });
});

describe("getCurrentSession", () => {
  it("returns null for an anonymous caller", async () => {
    expect(await getCurrentSession(new Headers())).toBeNull();
  });

  it("returns the session for a signed-in Member", async () => {
    await createMember({ email: "sangare@example.com" });
    const headers = await signInAs("sangare@example.com");

    const session = await getCurrentSession(headers);

    expect(session?.user.email).toBe("sangare@example.com");
  });
});
