import { auth } from "@/lib/auth";
import { ADMIN_ROLE, type Role } from "@/lib/auth/roles";
import { findMemberByEmail, type Member, setMemberRole } from "@/lib/members";

export const TEST_PASSWORD = "a-long-enough-password";

interface MemberInput {
  email: string;
  name?: string;
  password?: string;
  role?: Role;
}

/** Creates a Member through the ordinary sign-up path, then applies the role. */
export async function createMember({
  email,
  name = email.split("@")[0] ?? email,
  password = TEST_PASSWORD,
  role,
}: MemberInput): Promise<Member> {
  await auth.api.signUpEmail({ body: { email, password, name } });

  const created = await findMemberByEmail(email);
  if (!created) throw new Error(`Member ${email} was not created`);

  if (!role || role === created.role) return created;

  await setMemberRole(created.id, role);
  return { ...created, role };
}

export function createAdmin(input: Omit<MemberInput, "role">) {
  return createMember({ ...input, role: ADMIN_ROLE });
}

/**
 * Signs in and returns headers shaped like an incoming request's — what a route
 * handler or server component would hand to the guards.
 */
export async function signInAs(
  email: string,
  password = TEST_PASSWORD,
): Promise<Headers> {
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });

  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0) {
    throw new Error(`Sign-in for ${email} returned no session cookie`);
  }

  const headers = new Headers();
  headers.set("cookie", cookies.map((c) => c.split(";")[0]).join("; "));
  return headers;
}
