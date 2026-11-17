export type UserCommandState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; action: "activate" | "deactivate" | "delete" | "invite" | "role" }
