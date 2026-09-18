import "server-only"

import { AUTHENTICATION_REQUIRED } from "@/core/auth/session.server"
import { getErrorCode } from "@/shared/errors"
import { MessagingAccessError } from "./errors"
import type { MessageCommandState } from "./shared/message-command-state"

export function messageCommandErrorState(error: unknown): MessageCommandState {
  return {
    status: "error",
    error:
      error instanceof MessagingAccessError
        ? error.kind
        : getErrorCode(error) === AUTHENTICATION_REQUIRED
          ? "sign-in-required"
          : "unexpected"
  }
}
