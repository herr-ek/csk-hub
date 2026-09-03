import { beforeEach, describe, expect, mock, test } from "bun:test"

type MockSignInResponse = {
  data: {
    user?: { id: string; role?: string }
    twoFactorRedirect?: boolean
    twoFactorMethods?: unknown
  } | null
  error: null | { message: string }
}

const signInEmail = mock(
  async (): Promise<MockSignInResponse> => ({
    data: { user: { id: "user-member", role: "user" } },
    error: null
  })
)
const signInUsername = mock(
  async (): Promise<MockSignInResponse> => ({
    data: { user: { id: "user-member", role: "user" } },
    error: null
  })
)
const signInPasskey = mock(
  async (): Promise<MockSignInResponse> => ({
    data: { user: { id: "user-member", role: "user" } },
    error: null
  })
)
mock.module("@/core/auth/auth-client", () => ({
  authClient: { signIn: { email: signInEmail, username: signInUsername, passkey: signInPasskey } }
}))

import { signInWithEmailPassword, signInWithIdentifier, signInWithPasskey, signInWithUsernamePassword } from "./service"

beforeEach(() => {
  signInEmail.mockReset()
  signInUsername.mockReset()
  signInPasskey.mockReset()
})

describe("login service", () => {
  test("signs in with a username when the identifier is not an email", async () => {
    signInUsername.mockResolvedValue({ data: { user: { id: "user-member", role: "user" } }, error: null })

    await expect(
      signInWithIdentifier({
        identifier: "member_name",
        password: "correct horse battery staple",
        rememberMe: true
      })
    ).resolves.toEqual({ success: true, role: "user" })

    expect(signInUsername).toHaveBeenCalledWith({
      username: "member_name",
      password: "correct horse battery staple",
      rememberMe: true
    })
  })

  test("signs in with an email when the identifier contains an at sign", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "user-member", role: "user" } }, error: null })

    await expect(
      signInWithIdentifier({
        identifier: "member@example.com",
        password: "correct horse battery staple",
        rememberMe: false
      })
    ).resolves.toEqual({ success: true, role: "user" })

    expect(signInEmail).toHaveBeenCalledWith({
      email: "member@example.com",
      password: "correct horse battery staple",
      rememberMe: false
    })
  })

  test("returns the member role after sign-in", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "user-member", role: "user" } }, error: null })
    await expect(
      signInWithEmailPassword({
        email: "member@example.com",
        password: "correct horse battery staple",
        rememberMe: true
      })
    ).resolves.toEqual({ success: true, role: "user" })

    expect(signInEmail).toHaveBeenCalledWith({
      email: "member@example.com",
      password: "correct horse battery staple",
      rememberMe: true
    })
  })

  test("returns the admin role after sign-in", async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: "user-admin", role: "admin" } }, error: null })
    await expect(
      signInWithEmailPassword({
        email: "admin@example.com",
        password: "correct horse battery staple",
        rememberMe: true
      })
    ).resolves.toEqual({ success: true, role: "admin" })

    expect(signInEmail).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "correct horse battery staple",
      rememberMe: true
    })
  })

  test("returns the email sign-in error from the auth client", async () => {
    signInEmail.mockResolvedValue({
      data: { user: { id: "user-member", role: "user" } },
      error: { message: "Invalid email or password." }
    })
    await expect(
      signInWithEmailPassword({
        email: "member@example.com",
        password: "wrong password",
        rememberMe: false
      })
    ).resolves.toEqual({
      success: false,
      error: "Invalid email or password."
    })
  })

  test("returns the username sign-in error from the auth client", async () => {
    signInUsername.mockResolvedValue({
      data: { user: { id: "user-member", role: "user" } },
      error: { message: "Invalid username or password." }
    })

    await expect(
      signInWithUsernamePassword({
        username: "member_name",
        password: "wrong password",
        rememberMe: false
      })
    ).resolves.toEqual({
      success: false,
      error: "Invalid username or password."
    })
  })

  test("normalizes unexpected auth failures", async () => {
    signInEmail.mockRejectedValue(new Error("database details should not reach the client"))

    await expect(
      signInWithEmailPassword({
        email: "member@example.com",
        password: "correct horse battery staple",
        rememberMe: false
      })
    ).resolves.toEqual({
      success: false,
      error: "Unable to sign in right now. Check your connection and try again."
    })
  })

  test("normalizes unexpected username auth failures", async () => {
    signInUsername.mockRejectedValue(new Error("database details should not reach the client"))

    await expect(
      signInWithUsernamePassword({
        username: "member_name",
        password: "correct horse battery staple",
        rememberMe: false
      })
    ).resolves.toEqual({
      success: false,
      error: "Unable to sign in right now. Check your connection and try again."
    })
  })

  test("returns the available two-factor methods", async () => {
    signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true, twoFactorMethods: ["totp", 42, "otp"] },
      error: null
    })

    await expect(
      signInWithEmailPassword({
        email: "member@example.com",
        password: "correct horse battery staple",
        rememberMe: false
      })
    ).resolves.toEqual({
      success: false,
      requiresTwoFactor: true,
      methods: ["totp", "otp"]
    })
  })

  test("returns an empty two-factor method list when metadata is missing", async () => {
    signInUsername.mockResolvedValue({
      data: { twoFactorRedirect: true, twoFactorMethods: null },
      error: null
    })

    await expect(
      signInWithUsernamePassword({
        username: "member_name",
        password: "correct horse battery staple",
        rememberMe: false
      })
    ).resolves.toEqual({
      success: false,
      requiresTwoFactor: true,
      methods: []
    })
  })

  test("returns the member role after passkey sign-in", async () => {
    signInPasskey.mockResolvedValue({ data: { user: { id: "user-member", role: "user" } }, error: null })

    await expect(signInWithPasskey()).resolves.toEqual({
      success: true,
      role: "user"
    })

    expect(signInPasskey).toHaveBeenCalledWith()
  })

  test("returns the passkey error from the auth client", async () => {
    signInPasskey.mockResolvedValue({
      data: { user: { id: "user-member", role: "user" } },
      error: { message: "Passkey not found." }
    })

    await expect(signInWithPasskey()).resolves.toEqual({
      success: false,
      error: "Passkey not found."
    })
  })

  test("normalizes unexpected passkey auth failures", async () => {
    signInPasskey.mockRejectedValue(new Error("webauthn details should not reach the client"))

    await expect(signInWithPasskey()).resolves.toEqual({
      success: false,
      error: "Unable to sign in with a passkey right now. Check your connection and try again."
    })
  })
})
