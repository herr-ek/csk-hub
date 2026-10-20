import "server-only"

import { getFreshRequestSession } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { createAuthorization } from "./authorization"

export type { AuthorizationDatabase } from "./authorization"
export { AUTHORIZATION_DENIED, AuthorizationDeniedError, createAuthorization } from "./authorization"
export type { AuthorizationActor, PermissionRequest } from "./model"

const authorization = createAuthorization({ database: db, readSession: getFreshRequestSession })

export const { can, requirePermission, isCurrentMemberOfGroup, holdsCurrentPosition } = authorization
