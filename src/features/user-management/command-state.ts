export type UserCommandState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; action: "activate" | "deactivate" | "delete" | "invite" | "role" }

export type ImpersonateUserResult = { status: "success" } | { status: "error"; error: string }
