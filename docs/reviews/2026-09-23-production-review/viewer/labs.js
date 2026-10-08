/* Illustrative review models. These functions never execute the application or make network requests. */
window.createAtlasLabs = ({ e, sourceButton }) => {
  const initial = {
    registration: { route: "otp", invited: false, fixed: false },
    origins: { host: "unrelated", fixed: false },
    alternate: { method: "otp", twoFactor: true, fixed: false },
    cache: { seconds: 90, event: "revoke", fixed: false },
    reset: { after: "challenge", ran: false, fixed: false },
    admins: { step: 0, fixed: false },
    actor: { entry: "command", impersonated: true, fixed: false },
    guards: { leaf: "db", fixed: false },
    tls: { mode: "verify-full", fixed: false },
    environment: { app: "production", vercel: "unset", fixed: false },
    errors: { cause: "database", fixed: false },
    packages: { install: "production", fixed: false },
    docs: { claim: "users", fixed: false },
    endpoint: { destination: "private", fixed: false },
    audience: { active: false, device: true, fixed: false },
    binding: { login: "A", owner: "A", browser: true, fixed: false },
    delivery: { provider: "accepted", metadata: "failed", ran: false, fixed: false },
    return: { sample: "tab", fixed: false },
    pending: { step: 0, calls: 0, fixed: false },
    transport: { failure: "after", ran: false, fixed: false },
    search: { response: "rejected", fixed: false },
    locale: { locale: "sv", surface: "validation", fixed: false }
  }
  const states = structuredClone(initial)
  const select = (field, label, choices, m) =>
    `<label>${e(label)}<select data-lab-field="${field}">${choices.map(([v, t]) => `<option value="${e(v)}" ${String(m[field]) === String(v) ? "selected" : ""}>${e(t)}</option>`).join("")}</select></label>`
  const check = (field, label, m) =>
    `<label class="check-control"><input type="checkbox" data-lab-field="${field}" ${m[field] ? "checked" : ""}>${e(label)}</label>`
  const action = (key, label, disabled = false) =>
    `<button class="primary-button" data-lab-action="${key}" ${disabled ? "disabled" : ""}>${e(label)}</button>`
  const controls = (m, ...items) =>
    `<div class="lab-controls">${items.join("")}<label class="proposal-toggle"><input type="checkbox" data-lab-field="fixed" ${m.fixed ? "checked" : ""}>Explore proposed rule <span>Model only</span></label></div>`
  const flow = (nodes) =>
    `<div class="state-flow">${nodes.map(([title, value, kind], i) => `${i ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""}<div class="state-node ${kind || ""}"><small>${e(title)}</small><strong>${e(value)}</strong></div>`).join("")}</div>`
  const result = (title, text, risk = false) =>
    `<div class="outcome ${risk ? "risk" : "good"}" role="status"><span class="outcome-mark">${risk ? "!" : "✓"}</span><div><strong>${e(title)}</strong><p>${e(text)}</p></div></div>`
  const note = (text) => `<p class="quiet-note model-limit">${e(text)}</p>`
  const code = (text) => `<div class="model-query"><pre><code>${e(text)}</code></pre></div>`
  const stepper = (m, max) =>
    `<div class="step-controls">${action("back", "← Back", m.step === 0)}<span>Step ${m.step} / ${max}</span>${action("advance", "Advance →", m.step === max)}</div>`
  const renderers = {
    registration(m) {
      const creates = !m.invited && m.route === "otp" && !m.fixed
      const allows = m.invited || creates
      return (
        controls(
          m,
          select(
            "route",
            "Public endpoint",
            [
              ["otp", "Email OTP"],
              ["password", "Password registration"],
              ["magic", "Magic-link registration"]
            ],
            m
          ),
          check("invited", "User already created by an Admin Invite", m)
        ) +
        flow([
          ["Entry", m.route],
          ["Signup rule", m.route === "otp" && !m.fixed ? "Plugin default allows" : "Registration disabled"],
          ["User", m.invited ? "Existing invited User" : creates ? "Created without Invite" : "No new User"],
          ["Session", allows ? "Can be issued" : "Not issued", creates ? "amber" : ""]
        ]) +
        result(
          creates ? "Invite boundary bypassed" : allows ? "Existing User path remains" : "Unknown User cannot register",
          creates
            ? "The root password restriction does not govern the emailOTP plugin."
            : m.invited
              ? "Disabling signup alone does not resolve the existing-User 2FA issue."
              : "The proposed rule closes public email-OTP creation while preserving authorized Invite activation.",
          creates
        ) +
        note(
          "Unknown-email OTP creation was confirmed in an isolated native-handler probe. This model assumes control of the email address and completion of its code challenge; it sends no email."
        )
      )
    },
    origins(m) {
      const origins = {
        owned: "https://hub.example.test",
        preview: "https://csk-preview.vercel.app",
        unrelated: "https://unrelated-review-tenant.vercel.app",
        other: "https://outside.example.test"
      }
      const target = origins[m.host],
        trusted = m.host === "owned" || m.host === "preview" || (!m.fixed && m.host === "unrelated")
      return (
        controls(
          m,
          select(
            "host",
            "Requested callback",
            [
              ["owned", "Owned app origin"],
              ["preview", "Owned preview origin"],
              ["unrelated", "Unrelated Vercel tenant"],
              ["other", "Other external origin"]
            ],
            m
          )
        ) +
        flow([
          ["Trust policy", m.fixed ? "Exact owned origins" : "Shared *.vercel.app"],
          ["Callback check", trusted ? "Accepted" : "Rejected"],
          [
            "Reset credential",
            trusted ? target + "/?token=EXAMPLE" : "Remains unissued",
            m.host === "unrelated" && trusted ? "amber" : ""
          ]
        ]) +
        result(
          trusted && m.host === "unrelated"
            ? "Reset token can leave the application"
            : trusted
              ? "Callback belongs to an owned origin"
              : "Callback is refused",
          trusted && m.host === "unrelated"
            ? "The legitimate app email carries a reset link that redirects to the unrelated tenant."
            : "Example origins represent ownership; production must derive exact trusted hosts from deployment configuration.",
          trusted && m.host === "unrelated"
        ) +
        note(
          "The unrelated-origin redirect carrying a token was confirmed with a synthetic User and fake email callback. EXAMPLE is a placeholder, not a credential. No URL shown here is visited."
        )
      )
    },
    alternate(m) {
      const email = m.method === "otp" || m.method === "magic",
        blocked = m.fixed && email,
        challenge = m.twoFactor && m.method === "password"
      return (
        controls(
          m,
          select(
            "method",
            "Authentication mechanism",
            [
              ["password", "Password"],
              ["otp", "Email OTP sign-in"],
              ["magic", "Ordinary magic-link sign-in"],
              ["passkey", "Passkey"]
            ],
            m
          ),
          check("twoFactor", "Existing User enabled 2FA", m)
        ) +
        flow([
          ["Identity", "Existing User"],
          ["Entry", m.method],
          [
            "Outcome",
            blocked ? "HTTP route closed" : challenge ? "2FA challenge" : "Session issued",
            !blocked && email && m.twoFactor ? "amber" : ""
          ]
        ]) +
        result(
          blocked
            ? "Unused email-only sign-in is closed"
            : challenge
              ? "Password proceeds to 2FA"
              : email && m.twoFactor
                ? "Email-only path skips enabled 2FA"
                : "Separate authentication mechanism",
          blocked
            ? "Authorized server-side Invite delivery and activation need a separately verified policy."
            : challenge
              ? "The installed two-factor matcher covers password endpoints."
              : email
                ? "The plugin can create its session directly."
                : "Passkey sign-in is a deliberate distinct mechanism and is not alleged defective.",
          !blocked && email && m.twoFactor
        ) +
        note(
          "Both email-only endpoints were confirmed in isolated probes. The proposed rule reflects the review recommendation; any approved email-only recovery protocol requires an explicit product decision."
        )
      )
    },
    cache(m) {
      const cached = m.seconds < 300 && !m.fixed,
        authorized = cached
      return (
        controls(
          m,
          select(
            "event",
            "Authority changed elsewhere",
            [
              ["revoke", "Session removed"],
              ["demote", "Admin role removed"],
              ["inactive", "User deactivated"]
            ],
            m
          ),
          `<label>Cache age <output>${m.seconds}s</output><input type="range" min="0" max="360" step="15" value="${m.seconds}" data-lab-field="seconds"></label>`
        ) +
        flow([
          ["Authority change", m.event],
          ["App lookup", cached ? "Signed cached identity" : "Current session/User"],
          ["Old authority", authorized ? "Still accepted" : "Rejected", authorized ? "amber" : ""]
        ]) +
        result(
          authorized ? "App identity can remain stale" : "Authority is refreshed",
          authorized
            ? "A signed cookie cache can be returned before authoritative persistence is consulted."
            : "A fresh enforcement seam prevents cross-request cached authority from deciding access.",
          authorized
        ) +
        note(
          "Session removal was reproduced; role/activity implications follow the same source path. Cache populated immediately before the change, no refresh modeled. Native Admin handlers are authoritative and are not all bypassed by stale cookies."
        )
      )
    },
    reset(m) {
      const complete = m.after !== "invalid",
        failure = complete && m.after !== "success" && !m.fixed
      return (
        controls(
          m,
          select(
            "after",
            "Outcome after submit",
            [
              ["success", "Password updated + signed in"],
              ["challenge", "Password updated + 2FA challenge"],
              ["network", "Password updated + sign-in unavailable"],
              ["invalid", "Reset token invalid"]
            ],
            m
          ),
          action("run", "Preview reset outcome →")
        ) +
        (m.ran
          ? flow([
              ["Password update", complete ? "Committed" : "Not committed"],
              ["Token", complete ? "Consumed" : "Invalid"],
              [
                "Presentation",
                !complete
                  ? "Reset failure"
                  : m.fixed
                    ? m.after === "challenge"
                      ? "Continue to 2FA"
                      : m.after === "network"
                        ? "Reset complete + login"
                        : "Signed in"
                    : failure
                      ? "Failure; reset form remains"
                      : "Signed in",
                failure ? "amber" : ""
              ]
            ]) +
            result(
              failure
                ? "A completed reset looks retryable"
                : complete
                  ? "Reset completion is retained"
                  : "Reset did not complete",
              failure
                ? "Retrying the displayed form uses a consumed token. A 2FA challenge is a normal next step."
                : complete
                  ? "Reset and authentication completion have different states; a challenge must retain its methods."
                  : "An invalid token remains a reset failure.",
              failure
            )
          : note("Choose an outcome and preview the two transitions.")) +
        note(
          "The control flow was confirmed by source; the historical review did not run the real browser reset flow. No password or session is changed here."
        )
      )
    },
    admins(m) {
      const descriptions = m.fixed
        ? [
            "Two active Admins.",
            "Writer A locks lifecycle invariant.",
            "A rechecks count and demotes B.",
            "Writer B waits, then reloads actor/target authority.",
            "B cannot demote A; one active Admin remains."
          ]
        : [
            "Two active Admins.",
            "Writer A counts two active Admins.",
            "Writer B also counts two active Admins.",
            "A demotes B after its earlier count.",
            "B demotes A based on its earlier check."
          ]
      const count = m.step < 3 ? 2 : m.fixed || m.step === 3 ? 1 : 0
      return (
        controls(m, stepper(m, 4)) +
        flow([
          ["Writer A", m.step < 1 ? "Ready" : m.fixed ? "Serialized command" : "Count → later write"],
          ["Writer B", m.step < 2 ? "Ready" : m.fixed ? "Wait / recheck" : "Count → later write"],
          ["Active Admins", count, count === 0 ? "amber" : ""]
        ]) +
        result(
          count === 0
            ? "Concurrent schedule loses the final Admin"
            : m.fixed && m.step === 4
              ? "Invariant survives serialization"
              : "Walk the count-and-change gap",
          descriptions[m.step],
          count === 0
        ) +
        note(
          "Concurrent loss is source-probable, not database-reproduced in this review. Native self-demotion bypass was confirmed separately. Every writer must share the policy and transaction protocol, including session revocation."
        )
      )
    },
    actor(m) {
      const restricted = m.impersonated && (m.entry === "route" || m.fixed),
        allows = !restricted
      return (
        controls(
          m,
          select(
            "entry",
            "Entry point",
            [
              ["route", "Messages route"],
              ["command", "Direct private command"],
              ["passkey", "Native passkey registration"]
            ],
            m
          ),
          check("impersonated", "Session is support impersonation", m)
        ) +
        flow([
          ["Real actor", m.impersonated ? "Admin" : "Member"],
          ["Effective User", m.impersonated ? "Target User" : "Same member"],
          ["Context retained", m.fixed ? "Full actor" : m.entry === "route" ? "Route session" : "Effective ID only"],
          ["Boundary", allows ? "Can proceed" : "Denied", allows && m.impersonated ? "amber" : ""]
        ]) +
        result(
          allows && m.impersonated
            ? "Restriction is missing at this boundary"
            : restricted
              ? "Support restriction is enforced"
              : "Ordinary self-service",
          allows && m.impersonated
            ? "Changing the entrypoint can bypass a route-only rule; credential powers need their own native enforcement."
            : "The proposed actor seam keeps real/effective identity and permits ending impersonation.",
          allows && m.impersonated
        ) +
        note(
          "Missing command checks and native registration challenge were confirmed. Full WebAuthn enrollment/takeover was not completed; the model does not prove credential takeover."
        )
      )
    },
    guards(m) {
      const f = {
        db: "src/core/db/index.ts",
        env: "src/core/config/env.ts",
        auth: "src/core/auth/auth.ts",
        read: "src/features/user-management/service.ts"
      }[m.leaf]
      return (
        controls(
          m,
          select(
            "leaf",
            "Hypothetical client reaches",
            [
              ["db", "Database leaf"],
              ["env", "Environment leaf"],
              ["auth", "Auth singleton"],
              ["read", "Sensitive User read"]
            ],
            m
          )
        ) +
        flow([
          ["Client import", "Hypothetical caller"],
          ["Real source leaf", f],
          [
            "Local seam",
            m.fixed ? "Explicit server-only / actor contract" : "No local poisoning contract",
            m.fixed ? "" : "amber"
          ]
        ]) +
        sourceButton(f, "Inspect this exact leaf →") +
        result(
          m.fixed ? "Owning boundary rejects misuse" : "The leaf relies on caller discipline",
          m.fixed
            ? "Sensitive reads should own an actor contract; CLI loading may need a server-context bootstrap."
            : "Other transitive dependencies can still fail a client build. This is a missing local contract, not a demonstrated client-secret leak.",
          !m.fixed
        ) +
        note(
          "This is an architectural import model. It does not compile a client bundle or execute a sensitive module. Existing valid route callers are not asserted unsafe."
        )
      )
    },
    tls(m) {
      const rewritten = m.mode === "unset" ? "Not set" : m.fixed ? m.mode : "no-verify"
      return (
        controls(
          m,
          select(
            "mode",
            "Requested PostgreSQL sslmode",
            [
              ["verify-full", "verify-full"],
              ["verify-ca", "verify-ca"],
              ["require", "require"],
              ["unset", "No sslmode parameter"]
            ],
            m
          )
        ) +
        code(
          "postgresql://EXAMPLE/db" +
            (m.mode === "unset" ? "" : "?sslmode=" + m.mode) +
            "\n→ " +
            (m.mode === "unset" ? "unchanged" : "sslmode=" + rewritten)
        ) +
        result(
          rewritten === "no-verify"
            ? "Certificate verification is overridden"
            : "Requested transport policy is preserved",
          rewritten === "no-verify"
            ? "The application rewrites any supplied sslmode to no-verify before constructing the driver."
            : "Preserving a mode is not proof of deployed trust; certificate/CA and hostname behavior need deployment verification.",
          rewritten === "no-verify"
        ) +
        note(
          "Client parsing/configuration was confirmed without a database connection. The unset case is left unchanged by this source and is not asserted encrypted or certificate-verified."
        )
      )
    },
    environment(m) {
      const resolved = m.app === "unset" ? (m.vercel === "unset" ? "development" : m.vercel) : m.app
      const production = m.fixed ? resolved === "production" : m.vercel === "production"
      return (
        controls(
          m,
          select(
            "app",
            "ENVIRONMENT",
            [
              ["unset", "Unset"],
              ["development", "development"],
              ["preview", "preview"],
              ["production", "production"]
            ],
            m
          ),
          select(
            "vercel",
            "VERCEL_ENV",
            [
              ["unset", "Unset"],
              ["preview", "preview"],
              ["production", "production"]
            ],
            m
          )
        ) +
        flow([
          ["Resolved mode", resolved],
          ["isProduction", String(production), production !== (resolved === "production") ? "amber" : ""],
          ["Behavior", production ? "Production branch" : "Local/dev branch"]
        ]) +
        result(
          production !== (resolved === "production")
            ? "Validated mode and behavior disagree"
            : "Mode and behavior agree",
          "The current environment resolver and isProduction use different authorities. The proposed rule uses one documented precedence.",
          production !== (resolved === "production")
        ) +
        note(
          "The production mismatch was isolated-probed. Blank SMTP values and mandatory local VAPID fields are additional acceptance cases in the canonical finding; this model does not validate actual environment contents."
        )
      )
    },
    errors(m) {
      const unexpected = m.cause === "database",
        unavailable = unexpected && m.fixed
      return (
        controls(
          m,
          select(
            "cause",
            "Injected boundary outcome",
            [
              ["denied", "Genuine permission denial"],
              ["database", "Database exception"],
              ["missing", "Missing private resource"]
            ],
            m
          )
        ) +
        flow([
          ["Operation", m.cause],
          [
            "Presentation",
            unavailable
              ? "Unavailable + retry"
              : m.cause === "missing"
                ? m.fixed
                  ? "App-owned missing state"
                  : "Framework fallback"
                : "Forbidden"
          ],
          [
            "Diagnostics",
            unexpected ? (m.fixed ? "One sanitized event" : "No useful distinction") : "Expected outcome",
            unexpected && !m.fixed ? "amber" : ""
          ]
        ]) +
        result(
          unexpected && !m.fixed
            ? "An outage resembles access denial"
            : unavailable
              ? "Infrastructure failure remains distinct"
              : "Expected outcome stays member-safe",
          unexpected
            ? "A transport boundary should retain one operational signal without exposing tokens, message text or endpoint keys."
            : "The app also needs localized recovery navigation at proxy and render boundaries.",
          unexpected && !m.fixed
        ) +
        note(
          "This abstracts the route-access catch and messaging adapters; not every caught error has the same original handling. The actual exceptions are neither injected into the app nor logged by this explorer."
        )
      )
    },
    packages(m) {
      const guarantee = m.fixed,
        dev = m.install === "development"
      return (
        controls(
          m,
          select(
            "install",
            "Dependency tree",
            [
              ["development", "Full development install"],
              ["production", "Runtime-only install"]
            ],
            m
          )
        ) +
        flow([
          ["App import", "node-postgres adapter"],
          ["Direct pg dependency", guarantee ? "Declared" : "Absent"],
          [
            "Resolution",
            guarantee ? "Explicit runtime guarantee" : dev ? "Present through dev tooling" : "Not guaranteed",
            !guarantee && !dev ? "amber" : ""
          ]
        ]) +
        result(
          guarantee
            ? "Runtime ownership is explicit"
            : dev
              ? "Hoisting can hide missing ownership"
              : "A clean runtime tree may differ",
          "The review found indirect pg/form imports and generator version skew. This graph is a dependency-contract model, not a reproduced production install outage.",
          !guarantee && !dev
        ) +
        code(
          "App auth: 1.7.4\nReviewed CLI: 1.4.21\n" +
            (m.fixed
              ? "Proposed: verify a compatible generator in disposable output."
              : "Current: generator carries its own older auth/Drizzle model.")
        ) +
        note(
          "No packages are installed or removed. Declaring dependencies alone does not prove generator compatibility; the historical recommendation requires a separate disposable output comparison."
        )
      )
    },
    docs(m) {
      const choices = {
        users: [
          "Root says User management is unimplemented.",
          "An implemented Admin users route delegates to its feature.",
          "src/app/[locale]/(app)/admin/users/page.tsx"
        ],
        messages: [
          "Root omits the messaging route inventory.",
          "Direct Conversation routes and sending contracts exist.",
          "src/app/[locale]/(app)/messages/page.tsx"
        ],
        settings: [
          "Root lists /me as settings.",
          "Settings actually live at /me/settings.",
          "src/app/[locale]/(app)/me/settings/page.tsx"
        ]
      }
      const [claim, actual, path] = choices[m.claim]
      return (
        controls(
          m,
          select(
            "claim",
            "Entry-map statement",
            [
              ["users", "User management status"],
              ["messages", "Messages inventory"],
              ["settings", "Account settings route"]
            ],
            m
          )
        ) +
        `<div class="reader-comparison"><div class="reader-card"><div class="eyebrow">ROOT README</div><p>${e(m.fixed ? "Proposed: link to current route and module owner." : claim)}</p>${sourceButton("README.md", "Open historical README →", 86, 111)}</div><div class="reader-card"><div class="eyebrow">SOURCE AT THE SAME COMMIT</div><p>${e(actual)}</p>${sourceButton(path, "Open concrete route →")}</div></div>` +
        result(
          m.fixed ? "Entry map points at its owners" : "Follow the discrepancy in source",
          "The proposed map is navigation; domain vocabulary and behavioral contracts stay with their canonical owners.",
          !m.fixed
        ) +
        note(
          "The source/document mismatch was confirmed. This viewer preserves the original review and README snapshot; it does not rewrite product documentation or declare a new ADR accepted."
        )
      )
    },
    endpoint(m) {
      const urls = {
        provider: "https://push.example.test/send/EXAMPLE",
        private: "https://127.0.0.1:8443/EXAMPLE",
        http: "http://127.0.0.1:8080/EXAMPLE",
        lookalike: "https://push.example.test.attacker.test/EXAMPLE"
      }
      const url = new URL(urls[m.destination]),
        allowed = !m.fixed || m.destination === "provider"
      return (
        controls(
          m,
          select(
            "destination",
            "Stored subscription destination",
            [
              ["provider", "Toy supported provider"],
              ["private", "Loopback + alternate port"],
              ["http", "HTTP spelling + loopback"],
              ["lookalike", "Provider suffix lookalike"]
            ],
            m
          )
        ) +
        code(url.href) +
        flow([
          ["Stored hostname", url.hostname],
          ["Transport", allowed ? "HTTPS POST to " + url.host : "Rejected before transport"],
          [
            "App destination policy",
            m.fixed ? "Exact toy host + HTTPS/port" : "None",
            allowed && m.destination !== "provider" ? "amber" : ""
          ]
        ]) +
        result(
          allowed && m.destination !== "provider"
            ? "Caller controls the outbound destination"
            : allowed
              ? "Toy provider policy permits the shape"
              : "Destination is refused",
          allowed
            ? "The delivery client is not the application’s network trust boundary. The installed library always uses HTTPS transport, even for an HTTP-spelled URL."
            : "Real policy must cover resolved addresses and send-time validation of existing rows.",
          allowed && m.destination !== "provider"
        ) +
        note(
          "Destination control was confirmed with a fake HTTPS request. No connection, remote body or internal-service impact was demonstrated. The toy allowlist is illustrative, not a deployable provider list."
        )
      )
    },
    audience(m) {
      const selected = m.device && (!m.fixed || m.active)
      return (
        controls(m, check("active", "User is active", m), check("device", "Device subscription is active", m)) +
        flow([
          ["User authority", m.active ? "Active" : "Inactive"],
          ["Transport health", m.device ? "Active device" : "Disabled device"],
          ["Selected for push", selected ? "Yes" : "No", selected && !m.active ? "amber" : ""]
        ]) +
        result(
          selected && !m.active ? "Inactive User still receives selection" : "Eligibility is consistent",
          selected && !m.active
            ? "A healthy subscription is independent of withdrawn account access. Receipt needs no logged-in session."
            : "Delivery and the recipient picker must share the active-User predicate.",
          selected && !m.active
        ) +
        note(
          "Selection defect was confirmed in source. Already accepted provider delivery cannot be recalled. Reactivation behavior remains a product contract; device-health state should not become a second User-activity authority."
        )
      )
    },
    binding(m) {
      const bound = m.browser && m.owner === m.login,
        shown = m.browser && (!m.fixed || bound)
      return (
        controls(
          m,
          select(
            "login",
            "Current login",
            [
              ["A", "Member A"],
              ["B", "Member B"]
            ],
            m
          ),
          check("browser", "PushManager still has a subscription", m),
          action("repair", "Explicitly bind to current User →", !m.browser)
        ) +
        flow([
          ["Browser object", m.browser ? "Present" : "Absent"],
          ["Server owner", m.owner],
          ["Current login", m.login],
          ["UI Enabled", shown ? "Yes" : "No", shown && !bound ? "amber" : ""]
        ]) +
        result(
          shown && !bound
            ? "Enabled describes the wrong authority"
            : bound
              ? "Current User has a binding"
              : "A browser object alone is insufficient",
          shown && !bound
            ? "The endpoint remains A’s after B signs in. B’s self-test does not find it; A’s notifications can appear in this browser."
            : "Repair/rebind needs explicit consent and authoritative server confirmation; do not expose previous-owner identity in product UI.",
          shown && !bound
        ) +
        note(
          "A and B are synthetic explanatory labels. Historical source confirms divergence; shared-profile/provider acceptance was not browser-tested. Explicit-logout revocation is a recommendation awaiting a product decision."
        )
      )
    },
    delivery(m) {
      const accepted = m.provider === "accepted",
        hang = m.provider === "hang",
        success = accepted && (m.fixed || m.metadata === "ok")
      return (
        controls(
          m,
          select(
            "provider",
            "Provider outcome",
            [
              ["accepted", "Accepted"],
              ["failed", "Rejected"],
              ["hang", "Never settles"]
            ],
            m
          ),
          select(
            "metadata",
            "Lifecycle metadata update",
            [
              ["ok", "Succeeds"],
              ["failed", "Database write fails"]
            ],
            m
          ),
          action("run", "Preview delivery result →")
        ) +
        (m.ran
          ? flow([
              ["Provider", m.provider],
              ["Metadata", m.metadata],
              [
                "Reported result",
                hang
                  ? m.fixed
                    ? "Deadline ends request"
                    : "Waits without deadline"
                  : success
                    ? "Accepted"
                    : accepted
                      ? "Failure despite acceptance"
                      : "Delivery failed",
                (!success && accepted) || (hang && !m.fixed) ? "amber" : ""
              ]
            ]) +
            result(
              hang && !m.fixed
                ? "One destination can hold the broadcast"
                : accepted && !success
                  ? "Accepted push is reported failed"
                  : success
                    ? "Provider acceptance remains counted"
                    : "A bounded failure is retained",
              m.fixed
                ? "Separate provider outcome from best-effort metadata and retain sanitized diagnostic categories."
                : "Promise.allSettled waits for every task, and fulfillment includes the database bookkeeping.",
              (hang && !m.fixed) || (accepted && !success)
            )
          : note("Choose independent outcomes, then preview.")) +
        note(
          "This is a single-destination control-flow model. The real manual broadcast counts success if at least one full task fulfills. No timers, provider calls or database writes are performed here."
        )
      )
    },
    return(m) {
      const paths = {
        valid: "/news?sort=new#today",
        tab: "/\t/example.test",
        newline: "/\n/example.test",
        relative: "//example.test",
        backslash: "/\\example.test"
      }
      const raw = paths[m.sample],
        parsed = new URL(raw, "https://hub.example.test"),
        sourceAccepted = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")
      const accepts = m.fixed
        ? sourceAccepted &&
          !Array.from(raw).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
          parsed.origin === "https://hub.example.test"
        : sourceAccepted
      return (
        controls(
          m,
          select(
            "sample",
            "Return destination fixture",
            [
              ["valid", "Valid path + query/hash"],
              ["tab", "Slash, tab, slash"],
              ["newline", "Slash, newline, slash"],
              ["relative", "Protocol-relative URL"],
              ["backslash", "Backslash path"]
            ],
            m
          )
        ) +
        code("Raw escaped: " + JSON.stringify(raw) + "\nURL parser: " + parsed.href) +
        flow([
          ["Raw predicate", sourceAccepted ? "Accepts" : "Rejects"],
          ["Selected rule", accepts ? "Accepts" : "Rejects"],
          ["Resolved origin", parsed.origin, accepts && parsed.origin !== "https://hub.example.test" ? "amber" : ""]
        ]) +
        result(
          accepts && parsed.origin !== "https://hub.example.test"
            ? "Internal check accepts an external result"
            : "Destination stays within the intended contract",
          "The browser URL parser removes control characters before interpreting the origin. The proposed seam rejects controls and returns a canonical same-origin destination.",
          accepts && parsed.origin !== "https://hub.example.test"
        ) +
        note(
          "The URL-normalization mismatch was probe-confirmed. These URLs are rendered as escaped text, never navigated. This is not a claim of token/session exfiltration."
        )
      )
    },
    pending(m) {
      const pending = m.step > 0 && m.step < 3,
        shown = m.fixed ? pending : m.step >= 2,
        disabled = shown
      return (
        controls(m, stepper(m, 3), action("submit", "Submit again →", disabled || !pending)) +
        flow([
          ["FormApi state", pending ? "isSubmitting=true" : "isSubmitting=false"],
          ["Parent render", m.step === 2 ? "Unrelated rerender" : m.fixed ? "Subscribed" : "Not subscribed"],
          ["Submit disabled", disabled ? "Yes" : "No", pending && !disabled ? "amber" : ""],
          ["Request calls", m.calls]
        ]) +
        result(
          pending && !disabled
            ? "A pending request lacks UI feedback"
            : shown
              ? m.fixed
                ? "Subscribed pending state is visible"
                : m.step === 3
                  ? "A stale disabled render remains"
                  : "An unrelated render reveals pending"
              : "Ready / completed",
          m.step === 3 && !m.fixed
            ? "After unrelated rerender, completion can also leave a stale disabled render until another update."
            : "A stable form object does not subscribe its parent. Use the existing narrow subscription and guard duplicate entry.",
          pending && !disabled
        ) +
        note(
          "Step 1 starts a slow request; step 2 forces an unrelated render; step 3 completes. Duplicate FormApi submissions were isolated-probed. This does not mount TanStack or run real password requests."
        )
      )
    },
    transport(m) {
      const committed = m.failure === "after"
      return (
        controls(
          m,
          select(
            "failure",
            "Transport failure point",
            [
              ["before", "Reject before server write"],
              ["after", "Response lost after server commit"]
            ],
            m
          ),
          action("run", "Preview rejection →")
        ) +
        (m.ran
          ? flow([
              ["Server setting", committed ? "Changed" : "Unchanged"],
              ["Client pending", m.fixed ? "Cleared in finally" : "Stays true"],
              [
                "Client knowledge",
                m.fixed ? (committed ? "Reload authoritative setting" : "Unavailable + retry") : "Unknown / stale",
                m.fixed ? "" : "amber"
              ]
            ]) +
            result(
              m.fixed ? "Controls recover; uncertainty is explicit" : "Rejected await skips cleanup",
              committed
                ? "An unavailable response does not prove the write failed. Reconcile authoritative setting state instead of replaying secret-changing operations."
                : "The operation needs a localized transport outcome and guaranteed pending cleanup.",
              !m.fixed
            )
          : note("Choose where the response is lost, then preview.")) +
        note(
          "Rejection paths were confirmed in source; real outage/reconciliation acceptance was not run. This model illustrates an ambiguous commit, not a tested guarantee about any specific network request."
        )
      )
    },
    search(m) {
      const failed = m.response === "rejected",
        stale = m.response === "stale"
      return (
        controls(
          m,
          select(
            "response",
            "Search completion",
            [
              ["rejected", "Current query rejects"],
              ["empty", "Current query returns zero"],
              ["results", "Current query finds members"],
              ["stale", "Older query finishes late"]
            ],
            m
          )
        ) +
        flow([
          ["Request", m.response],
          [
            "Presented state",
            stale
              ? "Newer results retained"
              : failed
                ? m.fixed
                  ? "Failed + retry"
                  : "No matching members"
                : m.response === "empty"
                  ? "No matching members"
                  : "Members found",
            failed && !m.fixed ? "amber" : ""
          ]
        ]) +
        result(
          failed && !m.fixed
            ? "Failure is presented as a valid empty result"
            : stale
              ? "Latest-request protection is retained"
              : "Outcomes remain distinct",
          "The proposed state machine keeps loading, failure, empty and results separate and lets the same query retry.",
          failed && !m.fixed
        ) +
        note(
          "Failure-to-empty is source-confirmed. The historical review did not prove the transition loading-duration concern; this model deliberately makes no claim about that React/Next timing."
        )
      )
    },
    locale(m) {
      const supplied = {
          en: "Enter a valid email address.",
          sv: "Ange en giltig e-postadress.",
          de: "Gib eine gültige E-Mail-Adresse ein."
        },
        close = { en: "Close", sv: "Stäng", de: "Schließen" }
      const text =
        m.surface === "primitive"
          ? m.fixed
            ? close[m.locale]
            : "Close"
          : m.fixed
            ? supplied[m.locale]
            : "Please enter a valid email address"
      return (
        controls(
          m,
          select(
            "locale",
            "Selected app locale",
            [
              ["en", "English"],
              ["sv", "Swedish"],
              ["de", "German"]
            ],
            m
          ),
          select(
            "surface",
            "Presentation boundary",
            [
              ["validation", "Validation/service fallback"],
              ["primitive", "Primitive accessible label"]
            ],
            m
          )
        ) +
        flow([
          ["App locale", m.locale],
          ["Contract", m.fixed ? "Code + parameters → UI translation" : "English literal from owner"],
          ["Member sees", text, m.locale !== "en" && !m.fixed ? "amber" : ""]
        ]) +
        result(
          m.locale !== "en" && !m.fixed
            ? "Failure copy bypasses selected locale"
            : "The presentation edge owns the words",
          "Shared primitives should receive translated labels; they should not import the core locale layer.",
          m.locale !== "en" && !m.fixed
        ) +
        note(
          "Proposed wording is illustrative, not reviewed translation copy. The historical catalogs had 382 matching valid ICU leaves. Key parity does not prove every service or primitive uses those catalogs."
        )
      )
    }
  }
  return {
    model(id) {
      return states[id]
    },
    render(id) {
      return renderers[id](states[id])
    },
    change(id, field, value) {
      const m = states[id]
      m[field] = ["seconds", "step"].includes(field) ? Number(value) : value
      if ("ran" in m) m.ran = false
      if (field === "fixed" && "step" in m) {
        m.step = 0
        if ("calls" in m) m.calls = 0
      }
    },
    act(id, key) {
      const m = states[id]
      if (key === "reset") {
        states[id] = structuredClone(initial[id])
        return
      }
      if (key === "advance") {
        m.step = Math.min(id === "admins" ? 4 : 3, m.step + 1)
        if (id === "pending" && m.step === 1) m.calls++
      }
      if (key === "back") m.step = Math.max(0, m.step - 1)
      if (key === "run") m.ran = true
      if (key === "repair") m.owner = m.login
      if (key === "submit" && id === "pending" && !m.fixed && m.step === 1) m.calls++
    },
    ids: Object.keys(renderers)
  }
}
