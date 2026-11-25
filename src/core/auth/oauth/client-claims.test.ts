import { describe, expect, test } from "bun:test"
import { withReleasedClaims } from "./client-claims"

describe("client claim settings", () => {
  test("writes csk while keeping every other metadata key", () => {
    const merged = withReleasedClaims({ dpop_bound_access_tokens: true, csk: { releasedClaims: [] } }, [
      "website-access"
    ])
    expect(merged).toEqual({
      dpop_bound_access_tokens: true,
      csk: { releasedClaims: ["website-access"] }
    })
    expect(withReleasedClaims(undefined, [])).toEqual({ csk: { releasedClaims: [] } })
  })
})
