import { authClient } from "@/core/auth/auth-client"

export type EmailPasswordSignInInput = {
  email: string
  password: string
  rememberMe: boolean
}

export type UsernamePasswordSignInInput = Omit<EmailPasswordSignInInput, "email"> & { username: string }
export type IdentifierPasswordSignInInput = Omit<EmailPasswordSignInInput, "email"> & { identifier: string }

export type LoginResult =
  | { success: true; role?: string | null }
  | { success: false; error: string }
  | { success: false; requiresTwoFactor: true; methods: string[] }

function requiresTwoFactor(result: { data: unknown }) {
  return (
    typeof result.data === "object" &&
    result.data !== null &&
    "twoFactorRedirect" in result.data &&
    result.data.twoFactorRedirect === true
  )
}

function getTwoFactorMethods(result: { data: unknown }) {
  if (typeof result.data !== "object" || result.data === null || !("twoFactorMethods" in result.data)) return []
  return Array.isArray(result.data.twoFactorMethods)
    ? result.data.twoFactorMethods.filter((method): method is string => typeof method === "string")
    : []
}

function getAuthErrorMessage(error: { message?: string }, fallback: string) {
  return error.message ?? fallback
}

export async function signInWithEmailPassword(input: EmailPasswordSignInInput): Promise<LoginResult> {
  try {
    const result = await authClient.signIn.email({
      email: input.email,
      password: input.password,
      rememberMe: input.rememberMe
    })

    if (result.error) {
      return {
        success: false,
        error: getAuthErrorMessage(result.error, "Unable to sign in. Check your email and password and try again.")
      }
    }

    if (requiresTwoFactor(result)) {
      return {
        success: false,
        requiresTwoFactor: true,
        methods: getTwoFactorMethods(result)
      }
    }

    return { success: true, role: result.data.user?.role }
  } catch {
    return {
      success: false,
      error: "Unable to sign in right now. Check your connection and try again."
    }
  }
}

export async function signInWithUsernamePassword(input: UsernamePasswordSignInInput): Promise<LoginResult> {
  try {
    const result = await authClient.signIn.username({
      username: input.username,
      password: input.password,
      rememberMe: input.rememberMe
    })

    if (result.error) {
      return {
        success: false,
        error: getAuthErrorMessage(
          result.error,
          "Unable to sign in. Check your email or username and password and try again."
        )
      }
    }

    if (requiresTwoFactor(result)) {
      return {
        success: false,
        requiresTwoFactor: true,
        methods: getTwoFactorMethods(result)
      }
    }

    return { success: true, role: result.data.user?.role }
  } catch {
    return {
      success: false,
      error: "Unable to sign in right now. Check your connection and try again."
    }
  }
}

export function signInWithIdentifier(input: IdentifierPasswordSignInInput): Promise<LoginResult> {
  return input.identifier.includes("@")
    ? signInWithEmailPassword({ ...input, email: input.identifier })
    : signInWithUsernamePassword({ ...input, username: input.identifier })
}

export async function signInWithPasskey(): Promise<LoginResult> {
  try {
    const result = await authClient.signIn.passkey()

    if (result.error) {
      return {
        success: false,
        error: getAuthErrorMessage(
          result.error,
          "Unable to sign in with your passkey. Try again or use your email and password."
        )
      }
    }

    const role = (result.data.user as { role?: string }).role
    return { success: true, role }
  } catch {
    return {
      success: false,
      error: "Unable to sign in with a passkey right now. Check your connection and try again."
    }
  }
}
