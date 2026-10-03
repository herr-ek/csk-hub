import "server-only"

import { AUTHENTICATION_REQUIRED } from "@/core/auth/session.server"
import { getErrorCode } from "@/shared/errors"
import { MessagingAccessError } from "../model/messaging-error"
import type { MessageCommandState } from "./composer/message-command-state"

export function messageCommandErrorState(error: unknown, text: string): MessageCommandState {
  return {
    status: "error",
    text,
    error:
      error instanceof MessagingAccessError
        ? error.kind
        : getErrorCode(error) === AUTHENTICATION_REQUIRED
          ? "sign-in-required"
          : "unexpected"
  }
}
