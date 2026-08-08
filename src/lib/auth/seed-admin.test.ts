import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { ADMIN_ROLE, MEMBER_ROLE } from "@/lib/auth/roles";
import { seedAdmin } from "@/lib/auth/seed-admin";
import {
  logOnlyTransport,
  type OutgoingEmail,
  setEmailTransport,
} from "@/lib/email";
import {
  deactivateMember,
  findMemberByEmail,
  listMembers,
} from "@/lib/members";
import { closeTestDatabase, resetTestDatabase } from "@/test/db";
import { createAdmin, createMember } from "@/test/factories";

const ADMIN_EMAIL = "forste.admin@example.com";

let sent: OutgoingEmail[] = [];

beforeEach(async () => {
  await resetTestDatabase();
  sent = [];
  setEmailTransport({
    async send(email) {
      sent.push(email);
    },
  });
});

afterEach(() => setEmailTransport(logOnlyTransport));
afterAll(closeTestDatabase);

describe("seedAdmin against an empty database", () => {
  it("creates an Admin matching ADMIN_EMAIL", async () => {
    const outcome = await seedAdmin(ADMIN_EMAIL);

    expect(outcome.action).toBe("created");
    const created = await findMemberByEmail(ADMIN_EMAIL);
    expect(created?.role).toBe(ADMIN_ROLE);
    expect(created?.isInactive).toBe(false);
  });

  it("dispatches a set-password email", async () => {
    const outcome = await seedAdmin(ADMIN_EMAIL);

    expect(outcome.setPasswordEmailRequested).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(ADMIN_EMAIL);
  });

  it("normalises the address", async () => {
    await seedAdmin("  FORSTE.Admin@Example.com ");

    expect(await findMemberByEmail(ADMIN_EMAIL)).not.toBeNull();
  });
});

describe("seedAdmin run a second time", () => {
  it("succeeds, changes nothing, and says so", async () => {
    await seedAdmin(ADMIN_EMAIL);
    const before = await findMemberByEmail(ADMIN_EMAIL);
    sent = [];

    const outcome = await seedAdmin(ADMIN_EMAIL);

    expect(outcome.action).toBe("unchanged");
    expect(outcome.changes).toEqual([]);
    expect(outcome.setPasswordEmailRequested).toBe(false);
    expect(sent).toEqual([]);
    expect(await listMembers()).toHaveLength(1);
    expect(await findMemberByEmail(ADMIN_EMAIL)).toEqual(before);
  });
});

describe("seedAdmin over an existing account", () => {
  it("promotes a Member to Admin", async () => {
    await createMember({ email: ADMIN_EMAIL });

    const outcome = await seedAdmin(ADMIN_EMAIL);

    expect(outcome.action).toBe("updated");
    expect(outcome.changes).toContain("granted the admin role");
    expect((await findMemberByEmail(ADMIN_EMAIL))?.role).toBe(ADMIN_ROLE);
  });

  it("does not send another set-password email to an existing account", async () => {
    await createMember({ email: ADMIN_EMAIL, role: MEMBER_ROLE });

    await seedAdmin(ADMIN_EMAIL);

    expect(sent).toEqual([]);
  });

  it("reactivates an Inactive Member", async () => {
    const existing = await createAdmin({ email: ADMIN_EMAIL });
    await deactivateMember(existing.id);

    const outcome = await seedAdmin(ADMIN_EMAIL);

    expect(outcome.action).toBe("updated");
    expect(outcome.changes).toContain("reactivated the account");
    expect((await findMemberByEmail(ADMIN_EMAIL))?.isInactive).toBe(false);
  });
});
