import { auth } from "@/lib/auth";
import { getCurrentSession } from "@/lib/auth/guards";
import {
  deactivateMember,
  findMemberByEmail,
  listMembers,
  reactivateMember,
} from "@/lib/members";
import { closeTestDatabase, resetTestDatabase } from "@/test/db";
import { TEST_PASSWORD, createMember, signInAs } from "@/test/factories";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";

beforeEach(resetTestDatabase);
afterAll(closeTestDatabase);

async function attemptSignIn(email: string) {
  return auth.api
    .signInEmail({ body: { email, password: TEST_PASSWORD } })
    .then(() => "signed-in" as const)
    .catch(() => "rejected" as const);
}

describe("deactivateMember", () => {
  it("stops the Member from establishing a session", async () => {
    const member = await createMember({ email: "avgangen@example.com" });

    await deactivateMember(member.id);

    expect(await attemptSignIn("avgangen@example.com")).toBe("rejected");
  });

  it("revokes sessions the Member already holds", async () => {
    const member = await createMember({ email: "kvarsittande@example.com" });
    const headers = await signInAs("kvarsittande@example.com");
    expect(await getCurrentSession(headers)).not.toBeNull();

    await deactivateMember(member.id);

    expect(await getCurrentSession(headers)).toBeNull();
  });

  it("keeps the record", async () => {
    const member = await createMember({ email: "historik@example.com" });

    await deactivateMember(member.id);

    const found = await findMemberByEmail("historik@example.com");
    expect(found?.id).toBe(member.id);
    expect(found?.isInactive).toBe(true);
  });

  it("is idempotent", async () => {
    const member = await createMember({ email: "tva-ganger@example.com" });

    await deactivateMember(member.id);
    await deactivateMember(member.id);

    expect(await attemptSignIn("tva-ganger@example.com")).toBe("rejected");
  });
});

describe("reactivateMember", () => {
  it("lets the Member sign in again", async () => {
    const member = await createMember({ email: "atervandare@example.com" });
    await deactivateMember(member.id);

    await reactivateMember(member.id);

    expect(await attemptSignIn("atervandare@example.com")).toBe("signed-in");
  });
});

describe("listMembers", () => {
  it("hides Inactive Members by default", async () => {
    await createMember({ email: "aktiv@example.com" });
    const gone = await createMember({ email: "inaktiv@example.com" });
    await deactivateMember(gone.id);

    const listed = await listMembers();

    expect(listed.map((m) => m.email)).toEqual(["aktiv@example.com"]);
  });

  it("includes them on request", async () => {
    await createMember({ email: "aktiv@example.com" });
    const gone = await createMember({ email: "inaktiv@example.com" });
    await deactivateMember(gone.id);

    const listed = await listMembers({ includeInactive: true });

    expect(listed.map((m) => m.email).sort()).toEqual([
      "aktiv@example.com",
      "inaktiv@example.com",
    ]);
  });
});
