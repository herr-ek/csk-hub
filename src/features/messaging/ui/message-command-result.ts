import "server-only"

import { AuthorizationDeniedError } from "@/core/authz"
import { MessagingAccessError } from "../model/messaging-error"
import type { MessageCommandState } from "./composer/message-command-state"

export function messageCommandErrorState(error: unknown, text: string): MessageCommandState {
  return {
    status: "error",
    text,
    error:
      error instanceof MessagingAccessError
        ? error.kind
        : error instanceof AuthorizationDeniedError
          ? error.actor?.impersonatedBy
            ? "impersonation-unavailable"
            : "sign-in-required"
          : "unexpected"
  }
}
