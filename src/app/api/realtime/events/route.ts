import { connection } from "next/server"
import { handleActivityStream } from "../delivery"

export const maxDuration = 300
export async function GET(request: Request) {
  await connection()
  return handleActivityStream(request)
}
