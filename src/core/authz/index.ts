import "server-only"

import { getFreshRequestSession } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { createAuthorization } from "./authorization"

export type { AuthorizationDatabase, RequestAuthorization } from "./authorization"
export { AUTHORIZATION_DENIED, AuthorizationDeniedError, createAuthorization } from "./authorization"
export type { AuthorizationActor, PermissionAction, PermissionContext, PermissionRequest } from "./model"

const authorization = createAuthorization({ database: db, readSession: getFreshRequestSession })

export const { can, requirePermission, forCurrentRequest } = authorization
