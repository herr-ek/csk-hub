import { GlobalRegistrator } from "@happy-dom/global-registrator"

/**
 * A DOM for the tests that need one — ProseMirror and React both do. Bun may run several
 * test files in one process, and registering Happy DOM twice throws, so every such file
 * asks for the DOM through here rather than registering it itself.
 *
 * Call it above the imports that need a DOM, and reach those through `await import`:
 * static imports are hoisted, and would otherwise evaluate before this runs.
 */
export function registerDom(): void {
  if (GlobalRegistrator.isRegistered) return
  GlobalRegistrator.register({ url: "http://localhost:3000" })
}
