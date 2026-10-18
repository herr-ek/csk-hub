/** What a form knows about the last run of its command, as a Server Action hands it back. */
export type CommandState<Error extends string> =
  | { status: "idle" }
  // `completedAt` makes two successive successes distinct, so the form reacts to each one.
  | { status: "success"; completedAt: number }
  | { status: "error"; error: Error }

export const IDLE = { status: "idle" } as const satisfies CommandState<never>
