#!/usr/bin/env python3
"""Canonical review metadata parser and compatibility build entrypoint.

Run from any directory: python3 path/to/viewer/build-data.py (requires Node and repo dependencies).
Use --json to emit canonical review metadata without writing files.
The dated Markdown is canonical. Summaries and module assignments below are
viewer annotations; they must not be interpreted as implemented resolutions.
"""

import json
import sys
import subprocess
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = [
    "README.md", "handoff.md", "system-map.md", "authentication.md",
    "architecture-operations.md", "access-control.md", "notifications.md",
    "ui-runtime.md",
]


def entry(category, kind, effort, modules, confidence, summary, observed, impact,
          recommendation, before, after):
    return dict(category=category, type=kind, effort=effort, modules=modules.split(),
                confidence=confidence, summary=summary, observed=observed,
                impact=impact, recommendation=recommendation,
                flow=dict(before=before.split(" | "), after=after.split(" | ")))


ANNOTATIONS = {
    "AUTH-001": entry(
        "Authentication", "security", "S · endpoint policy M", "auth email account app",
        "Confirmed in isolated native-handler probe",
        "Public email OTP creates a User and session without an Admin Invite.",
        "The emailOTP plugin has its own signup switch; the configured password and magic-link restrictions do not disable it.",
        "Anyone controlling an email address can cross the Invite-only membership boundary.",
        "Set emailOTP disableSignUp, inventory native sign-in routes, and preserve intended verification and Invite activation.",
        "Unknown email | Public sign-in OTP | New User + session",
        "Unknown email | Registration denied | Admin Invite required"),
    "AUTH-002": entry(
        "Authentication", "security", "S–M", "auth config email account",
        "Confirmed reset callback with token",
        "Wildcard Vercel trust accepts reset callbacks belonging to unrelated tenants.",
        "An emailed legitimate reset URL redirected to an unrelated *.vercel.app origin carrying its reset token.",
        "A victim opening the app's reset link can disclose a password-reset credential to another tenant.",
        "Trust exact app-owned deployment origins and constrain reset and activation callbacks to intended workflows.",
        "Shared Vercel wildcard | Legitimate reset email | Token to unrelated origin",
        "Owned origins only | Callback validated | Token stays in app flow"),
    "AUTH-003": entry(
        "Authentication", "security", "M", "auth account users email",
        "Confirmed endpoints; recovery policy unresolved",
        "Email OTP and magic-link sign-in issue sessions without the enabled 2FA challenge.",
        "Both alternate email-only routes created sessions for a synthetic existing User with twoFactorEnabled; password-route challenge hooks do not cover them.",
        "Mailbox access alone obtains a session despite the account's enabled 2FA setting.",
        "Close unused public email-only sign-in routes, preserve authorized Invite activation, and explicitly ratify recovery semantics.",
        "2FA-enabled User | Email-only endpoint | Session without challenge",
        "Supported sign-in route | Required challenge or approved recovery | Session after policy"),
    "AUTH-004": entry(
        "Authentication", "security", "M", "auth access users messaging app",
        "Confirmed cache after session removal",
        "App identity checks can accept revoked sessions and stale roles for up to five minutes.",
        "A signed 300-second cookie cache is returned before the database lookup; the prior cookie remained authenticated after disposable sessions were deleted.",
        "App-owned private reads and mutations have inconsistent revocation, deactivation and role-change guarantees; native Admin handlers are authoritative.",
        "Resolve an authoritative request actor with current session and User state; disable cookie caching or bypass it for every enforcement boundary.",
        "Session revoked | Cookie cache accepted | App identity remains valid",
        "Request actor lookup | Current session + activity | Immediate enforcement"),
    "AUTH-005": entry(
        "Authentication", "workflow", "S", "account navigation auth",
        "Confirmed by source; no browser repro",
        "Password reset commits, then a normal 2FA challenge becomes a retryable-looking failure.",
        "Reset consumes the token before automatic sign-in; the service collapses requiresTwoFactor into failure and leaves the reset form displayed.",
        "The User loses challenge information and can retry an already consumed token.",
        "Represent password-update completion separately, carry the challenge into the existing 2FA route, and show a terminal completion state for other sign-in errors.",
        "Password changed | 2FA requested | Reset form shows failure",
        "Password changed | Challenge preserved | Continue to 2FA / login"),
    "AUTHZ-001": entry(
        "Authorization", "security", "M–L", "users auth access db app",
        "Confirmed HTTP bypass; concurrent final-Admin loss strongly probable",
        "Native Admin setters bypass target rules, and separate count/write checks cannot preserve the final Admin atomically.",
        "Native role/update routes omit the app's self/target restrictions; the app counts active Admins separately from mutation.",
        "An Admin can bypass app self-demotion rules; concurrent lifecycle changes could leave no active Admin. Ordinary-User escalation was not demonstrated.",
        "Use one lifecycle command with descriptive policies, restrict alternate native writers, and serialize invariant checks and writes with authoritative state.",
        "App target rules | Native alternate writer / separate count | Rules bypassed / race possible",
        "Every entry point | Shared policy + serialized command | Active Admin invariant"),
    "AUTHZ-002": entry(
        "Authorization", "security", "M", "access auth messaging account users",
        "Confirmed gaps/challenge; completed takeover strongly probable",
        "Impersonation restrictions do not follow identity into private commands and native credential operations.",
        "Messaging helpers discard impersonatedBy, and a synthetic impersonated session received passkey registration options; full enrollment was not performed.",
        "Route denial does not protect direct command calls; credential enrollment may grant persistent target access without an impersonation marker.",
        "Keep real and effective identity in the actor, enforce private-workflow restrictions locally, and deny impersonated credential changes under the proposed support policy.",
        "Impersonated session | Identity reduced to User ID | Private / credential gap",
        "Actor retains impersonation | Workflow + native policy | Denial with safe exit"),
    "ARCH-001": entry(
        "Architecture", "architecture", "M", "auth access db config users posts",
        "Confirmed contracts missing; no client-secret leak demonstrated",
        "Sensitive reads and server capabilities rely on callers remembering implicit contracts.",
        "Secret/config, DB and auth leaves lack server-only guards; User/Post reads rely on page/proxy policy; some actions own persistence directly.",
        "Future routes or imports can violate assumptions that are not enforced at the owning module boundary.",
        "Guard server leaves, expose shaped policy-aware reads and focused commands, and preserve universal schemas and legitimate CLI bootstraps.",
        "Caller remembers policy | Unguarded read / server leaf | Implicit safety contract",
        "Guarded feature boundary | Authorized shaped operation | Local enforceable contract"),
    "OPS-001": entry(
        "Operations", "security", "S", "db config docs",
        "Confirmed client TLS configuration defect",
        "The database adapter rewrites explicit SSL verification to no-verify.",
        "Every supplied sslmode, including verify-full, becomes no-verify; a parser probe returned rejectUnauthorized:false.",
        "Encrypted PostgreSQL connections lose server-certificate authentication. No interception was attempted.",
        "Honor verified deployment TLS and provider CA configuration, remove global TLS-disable guidance, and keep local non-TLS setup explicit.",
        "verify-full requested | Rewritten to no-verify | Certificate unauthenticated",
        "Explicit deployment TLS | Trusted CA verification | Wrong certificate rejected"),
    "OPS-002": entry(
        "Operations", "operations", "M", "config email auth notifications tooling docs",
        "Confirmed isolated environment probes",
        "Environment precedence misclassifies non-Vercel production and the documented minimal setup fails validation.",
        "ENVIRONMENT=production can yield isProduction:false and log-mode email; blank sample fields fail validation, empty VAPID keys pass, and seeds lack production refusal.",
        "Production can skip intended policy and log auth credentials instead of delivering email; contributors cannot reliably follow setup.",
        "Normalize one deployment environment, validate enabled capabilities, require real production delivery, align setup, and guard development seeds before writes.",
        "Conflicting environment inputs | Production classified as local | Auth email logged / setup fails",
        "Documented precedence | Capability prerequisites validated | Explicit safe deployment"),
    "OPS-003": entry(
        "Operations", "operations", "S–M", "messaging access auth notifications",
        "Confirmed by source",
        "Unexpected failures lose diagnostics or become indistinguishable from permission denial.",
        "Message-command catches return unexpected without logging, while route policy turns every permission lookup exception into forbidden.",
        "Database outages look like permissions problems and failed writes lack useful server evidence.",
        "Keep domain denial separate from infrastructure unavailability, emit one sanitized operational event, and show safe retry or reconciliation guidance.",
        "Database / command failure | Catch collapses cause | Forbidden or silent unexpected",
        "Typed outcome boundary | Safe diagnostic + unavailable | Useful recovery guidance"),
    "TOOL-001": entry(
        "Tooling", "readiness", "S–M", "tooling db auth account i18n",
        "Confirmed manifest skew; install fragility strongly probable",
        "Runtime imports depend on transitive packages and auth generation uses a substantially older embedded model.",
        "pg and react-form are indirect; a use-intl type bypasses the façade; the installed auth CLI 1.4.21 is behind runtime 1.7.4.",
        "Clean production installs can differ from the hoisted development tree, and generator compatibility is uncertain; no outage or schema corruption was reproduced.",
        "Declare actual runtime packages, align and test the supported generator in disposable output, and remove truly unused dependencies after checking scripts.",
        "Hoisted development tree | Indirect imports + old generator | Install / generation fragility",
        "Explicit runtime dependencies | Aligned disposable generation | Reproducible tool contract"),
    "DOC-001": entry(
        "Documentation", "documentation", "S", "docs tooling users posts messaging notifications",
        "Confirmed source/document mismatch",
        "The root product, route and generation map is stale enough to misdirect future work.",
        "README omits implemented workflows and mislabels /me; structure guidance conflates auth generation with application-owned schema definitions.",
        "A new contributor or agent may duplicate implemented work or edit/regenerate the wrong owned surface.",
        "Refresh README as a concise setup/status/module index, retain local behavioral contracts, and clarify schema ownership after environment decisions.",
        "Stale root inventory | Wrong workflow / generation assumptions | Duplicate or misplaced work",
        "Current route + module index | Canonical owner docs | Correct edit boundary"),
    "NOTIFY-01": entry(
        "Notifications", "security", "M", "notifications account config",
        "Confirmed destination control; internal impact deployment-dependent",
        "Stored push endpoints let signed-in Users choose server-side HTTPS destinations.",
        "Subscription storage lacks runtime validation; fake transport confirmed arbitrary host/port control. No real connection was made; TLS verification still applies.",
        "Membership can trigger blind server-side requests to arbitrary or potentially internal destinations; response bodies and arbitrary methods were not demonstrated.",
        "Validate subscriptions at registration and delivery, constrain supported push providers, and enforce destination/address policy without logging endpoint secrets.",
        "Untrusted endpoint stored | Self-test or broadcast | Arbitrary HTTPS destination",
        "Validated provider binding | Stored rows rechecked | Permitted push transport"),
    "NOTIFY-02": entry(
        "Notifications", "security", "S–M", "notifications users db access",
        "Confirmed selection defect",
        "Inactive Users remain in recipient selection and continue qualifying for push delivery.",
        "Queries filter device health but never account activity; deactivation does not remove subscriptions and receipt needs no live session.",
        "Internal association content can reach a former member after access is withdrawn.",
        "Enforce active-User eligibility at final delivery selection and in the picker; keep device health distinct and define reactivation behavior.",
        "User deactivated | Healthy subscription selected | Later push still eligible",
        "Audience selected | Active-User rule enforced | Inactive endpoints excluded"),
    "NOTIFY-03": entry(
        "Notifications", "workflow", "M", "notifications account navigation auth",
        "Confirmed divergence; privacy impact requires shared profile",
        "A browser push subscription is shown as Enabled without confirming which User owns its server binding.",
        "After A logs out and B logs in, the same browser subscription remains bound to A while B sees Enabled; partial server writes cause similar divergence.",
        "Shared-profile Users can see false subscription state and notifications addressed to the previous account.",
        "Reconcile browser capability, subscription and account binding; show Enabled only after confirmation and offer explicit repair with the chosen logout policy.",
        "A binds browser | A logout → B login | B sees Enabled for A binding",
        "Browser subscription found | Current-account binding checked | Confirmed state / explicit repair"),
    "NOTIFY-04": entry(
        "Notifications", "operations", "M", "notifications db",
        "Confirmed control flow; production frequency unknown",
        "Push requests have no deadline and metadata errors are counted as delivery failures.",
        "Delivery waits for all tasks without timeout; provider acceptance and DB success bookkeeping share a catch boundary.",
        "One stalled host can hold a broadcast, while retrying an accepted-but-unrecorded push may duplicate it.",
        "Bound transport time and concurrency, separate provider acceptance from best-effort bookkeeping, and retain sanitized counts and failure categories.",
        "Provider send | DB bookkeeping in same try | Timeout / outcome ambiguity",
        "Bounded provider call | Acceptance recorded separately | Truthful counts + diagnostics"),
    "WEB-001": entry(
        "UI & runtime", "security", "S", "navigation account",
        "Confirmed URL normalization mismatch",
        "Control characters evade the internal return-path test and resolve to external origins.",
        "Slash-tab/slash-newline variants pass raw prefix checks, but WHATWG URL normalization makes them external; the value survives the 2FA hop.",
        "A crafted login link can redirect a member to an external phishing destination after authentication. Token theft was not established.",
        "Reject control characters and unsafe forms, resolve against a trusted origin, and return one canonical internal pathname/search/hash.",
        "Crafted returnTo | Raw prefix accepted | Router resolves external origin",
        "Strict parser | Origin equality required | Canonical internal destination"),
    "WEB-002": entry(
        "UI & runtime", "workflow", "S", "account",
        "Confirmed source/library behavior; UI not browser-tested",
        "Password forms read pending state without subscribing, leaving feedback and duplicate-submission prevention stale.",
        "Three forms read form.state.isSubmitting from a stable FormApi; a deferred library probe accepted two simultaneous submissions.",
        "Slow requests can leave submit controls active, causing duplicate email or password-changing requests.",
        "Subscribe narrowly to submission state, apply busy/disabled feedback, and guard repeated side-effect entry using the existing local form pattern.",
        "Submit starts | Parent not subscribed | Stale button + repeated request",
        "Reactive pending state | Busy / disabled control | Guarded single submission"),
    "WEB-003": entry(
        "UI & runtime", "workflow", "M", "account auth navigation i18n",
        "Confirmed rejection paths; browser outage untested",
        "Rejected account requests can leave controls stuck or misrepresent uncertain committed changes.",
        "Some 2FA hooks clear pending only after await; password/logout/passkey loading also have missing visible transport-failure handling.",
        "Offline operations can disable a workflow indefinitely, and a lost acknowledgement can leave the true security state unknown.",
        "Return stable unavailable outcomes, clear pending in finally, show localized retry states, and reload authoritative state after ambiguous credential changes.",
        "Security request pending | Transport rejection | Stuck / unknown account state",
        "Stable failure outcome | Pending cleared | Retry or authoritative reconciliation"),
    "WEB-004": entry(
        "UI & runtime", "readiness", "M", "app navigation access posts messaging i18n",
        "Confirmed source inventory",
        "Denied, missing and failed routes lack application-owned localized recovery.",
        "The app has no error/global-error/not-found files, proxy denial is empty 403, and impersonated navigation still links to denied Messages.",
        "Members see blank or technical fallback screens and an impersonating Admin can lose the visible stop-impersonating control.",
        "Provide localized forbidden/not-found/unavailable states with safe navigation and impersonation exit, handling proxy and render failures at their respective boundaries.",
        "Denied / missing / failed route | Empty or framework fallback | No useful recovery",
        "Distinct route outcome | Localized application state | Retry / navigate / end impersonation"),
    "WEB-005": entry(
        "UI & runtime", "workflow", "S", "messaging i18n",
        "Confirmed failure-to-empty; pending concern strongly probable",
        "Failed member search is displayed as a successful search with no matches.",
        "Every rejected search becomes an empty array; there is no failure/retry state. Transition loading duration still needs a browser probe.",
        "A transport failure falsely suggests the intended Conversation partner cannot be found.",
        "Represent pending, empty, results and failed separately, allow retry of the same query, and preserve latest-request protection.",
        "Search rejects | Members set to [] | No matching members",
        "Search outcome identified | Localized failure state | Retry same query"),
    "I18N-001": entry(
        "Internationalization", "workflow", "M", "i18n account shared",
        "Confirmed; all catalogs currently pass parity/ICU checks",
        "Validation, fallback errors, accessible primitive labels and account dates escape the selected locale contract.",
        "English strings leave schemas/services directly; used dialog/toast labels are hardcoded and account dates use browser-default locale.",
        "Swedish and German Users encounter English failure/accessibility copy and dates that ignore their chosen app locale.",
        "Translate stable codes/parameters at the UI edge, supply translated primitive labels, use the formatter façade, and extend the healthy catalog guard to ICU contracts.",
        "Selected app locale | English service / primitive strings | Mixed-language recovery UI",
        "Stable codes + parameters | Presentation translates + formats | Consistent selected locale"),
}


def table_rows(raw, heading):
    section = raw.split("## " + heading + "\n", 1)[1].split("\n## ", 1)[0]
    rows = [line for line in section.splitlines() if line.startswith("| ")]
    return [[part.strip() for part in row.strip("|").split("|")]
            for row in rows[2:]]


documents = []
findings = []
for file in DOCS:
    raw = (ROOT / file).read_text()
    documents.append({"file": file, "title": raw.splitlines()[0].removeprefix("# "), "raw": raw})
    for match in re.finditer(r"^## ([A-Z][A-Z0-9]*-\d+) — (.+)$", raw, re.M):
        finding_id, title = match.groups()
        next_section = re.search(r'\n(?:<a id=|## )', raw[match.end():])
        end = match.end() + next_section.start() if next_section else len(raw)
        body = raw[match.start():end].rstrip() + "\n"
        priority = re.search(r"\*\*(Blocker|High|Medium|Low)\*\*", body).group(1)
        paths = list(dict.fromkeys(path for path in re.findall(r"`([^`\n]+)`", body)
                                  if re.match(r"^(?:src/|node_modules/|public/|scripts/|docs/|better-auth/|@better-auth/|\.?env\.example|\.env\.example|README\.md|CONTEXT\.md|AGENTS\.md|package\.json|messages\.test\.ts|biome\.json)", path)))
        findings.append({"id": finding_id, "title": title, "severity": priority,
                         "source": file, "anchor": finding_id.lower(), "raw": body,
                         "paths": paths, **ANNOTATIONS[finding_id]})

severity_order = {"Blocker": 0, "High": 1, "Medium": 2, "Low": 3}
findings.sort(key=lambda item: (severity_order[item["severity"]], list(ANNOTATIONS).index(item["id"])))
assert len(findings) == 23 and {f["id"] for f in findings} == set(ANNOTATIONS)
by_file = {doc["file"]: doc["raw"] for doc in documents}

decisions = [
    {"id": "D1", "title": "Impersonation powers", "question": "Is impersonation support access, or does it include credential takeover?", "recommendation": "Treat it as support access: exclude private Conversations and credential control, including native Admin password/email powers.", "findings": ["AUTHZ-002", "AUTHZ-001", "AUTH-004"], "source": "handoff.md#product-decisions-awaiting-ratification"},
    {"id": "D2", "title": "Email-only recovery", "question": "What approved recovery protocol, if any, may bypass enabled 2FA?", "recommendation": "Allow no accidental email-only bypass. Explicitly design any intended exception while preserving Admin Invite activation.", "findings": ["AUTH-003", "AUTH-001", "AUTH-005"], "source": "handoff.md#product-decisions-awaiting-ratification"},
    {"id": "D3", "title": "Push after explicit logout", "question": "Should explicit logout revoke this browser's account binding?", "recommendation": "Revoke it for shared-device privacy. Correct false Enabled and account-switch state regardless of the selected logout behavior.", "findings": ["NOTIFY-03", "NOTIFY-02"], "source": "handoff.md#product-decisions-awaiting-ratification"},
    {"id": "D4", "title": "Deployment contract", "question": "Which environment precedence, owned preview origins and local notification prerequisites are supported?", "recommendation": "Use exact app-owned origins, one environment precedence rule, real production delivery, and an explicit mandatory-or-optional local push setup.", "findings": ["OPS-002", "AUTH-002", "OPS-001", "DOC-001"], "source": "handoff.md#product-decisions-awaiting-ratification"},
]

explorations = [
    {"id": "E1", "title": "Measure request identity cost", "description": "Measure proxy session/preferences and duplicate identity lookups; request-local memoization is the first option.", "gate": "Keep authoritative feature enforcement; measure before lighter navigation checks.", "source": "README.md#to-explore-after-concrete-defects"},
    {"id": "E2", "title": "Revisit richer policy tools only when needed", "description": "Consider CASL only if actual resource or field rules outgrow descriptive application policies.", "gate": "No external policy server or generalized organization model is justified now.", "source": "README.md#to-explore-after-concrete-defects"},
    {"id": "E3", "title": "Measure catalog and font cost", "description": "Measure client catalog/font delivery before splitting catalogs or changing the root shell.", "gate": "Full-catalog provision is deliberate and correct; no performance regression was demonstrated.", "source": "README.md#to-explore-after-concrete-defects"},
    {"id": "E4", "title": "Probe first-message retry recovery", "description": "Explore a committed first send with lost acknowledgement followed by an edited retry using the fixed idempotency key.", "gate": "Prove the UI recovery case before expanding the intentional exact-intent send protocol.", "source": "README.md#to-explore-after-concrete-defects"},
    {"id": "E5", "title": "Define deployment readiness", "description": "Define a small readiness and health contract once hosting is settled.", "gate": "Keep this separate from durable audit infrastructure; no generic monitoring platform is proposed.", "source": "README.md#to-explore-after-concrete-defects"},
]

checks = []
for name, detail in table_rows(by_file["system-map.md"], "Verification performed"):
    status = "confirmed" if "Confirmed" in detail else "passed"
    if "Not green" in detail or "**Incomplete**" in detail:
        status = "incomplete"
    checks.append({"name": name.strip("`"), "status": status, "detail": detail})
checks.append({"name": "Live acceptance and deployment verification", "status": "not-run", "detail": "No live DB/catalog/concurrency, authenticated browser, real WebAuthn, SMTP/push delivery, shared-browser service-worker lifecycle, deployed cookies/headers, mobile/keyboard/screen-reader pass, or performance benchmark."})

coverage = [{"area": area, "depth": depth, "inspected": inspected, "remaining": remaining}
            for area, depth, inspected, remaining in table_rows(by_file["README.md"], "Coverage matrix")]

policy = {
    "status": "Proposed target; not an accepted ADR",
    "source": "access-control.md",
    "summary": "Small application-owned policies, authoritative actors and feature-owned commands; Better Auth retains identity mechanisms and selected native grants.",
    "matrix": [{"operation": operation, "rule": rule, "owner": owner} for operation, rule, owner in table_rows(by_file["access-control.md"], "Initial policy matrix")],
    "outcomes": [{"outcome": outcome, "meaning": meaning, "presentation": presentation} for outcome, meaning, presentation in table_rows(by_file["access-control.md"], "Outcomes and disclosure")],
    "options": [{"option": option, "fit": fit, "tradeoff": tradeoff, "decision": decision} for option, fit, tradeoff, decision in table_rows(by_file["access-control.md"], "Library comparison")],
    "sequence": ["Close public registration, unsafe origins and unwanted alternate sign-in paths.", "Introduce authoritative actors retaining impersonation and current session/activity.", "Move one User-management workflow through policy, commands and all native alternatives.", "Adopt actors in messaging, Posts and notifications without relocating feature queries into core.", "Align navigation/error outcomes, remove obsolete permission calls and seek ADR agreement."],
}

retained = [
    {"title": "Feature ownership", "detail": "Thin routes and feature entrypoints are coherent; avoid a broad directory rewrite."},
    {"title": "Messaging transaction boundary", "detail": "Retain membership checks, sequence allocation, pair locking and exact-intent idempotency guarantees."},
    {"title": "Atomic preferences", "detail": "Runtime-validating JSONB preferences have safe defaults and partial updates that preserve other fields."},
    {"title": "Locale foundations", "detail": "Locale routing and override semantics are coherent; all three catalogs have 382 matching, valid ICU leaves."},
    {"title": "Auth mechanism ownership", "detail": "Keep hashing and TOTP, backup-code and passkey cryptography with Better Auth; app policy owns the gaps."},
    {"title": "Existing UI primitives", "detail": "Retain Base UI primitives and good local form/error patterns; no measured contrast defect justifies a broad token rewrite."},
]

data = dict(snapshot={"date": "2026-09-23", "commit": "930a2a527b5f124e9a764b224f32994651a417b6", "branch": "47-send-and-receive-a-message"},
            findings=findings, documents=documents, decisions=decisions, explorations=explorations,
            checks=checks, coverage=coverage, policy=policy, retained=retained)
serialized = json.dumps(data, ensure_ascii=False).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
if "--json" in sys.argv:
    print(serialized)
else:
    subprocess.run(["node", str(ROOT / "viewer" / "build-data.mjs")], check=True)
