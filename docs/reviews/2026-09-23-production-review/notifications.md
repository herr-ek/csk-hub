# Notification findings

Snapshot: 2026-09-23 at `930a2a5`. [Review index](README.md). All probes used fake transport and synthetic keys; no push was delivered.

<a id="notify-01"></a>

## NOTIFY-01 — Subscription endpoints allow authenticated server-side requests to arbitrary hosts

- **Type / priority / confidence:** security risk / **High** / **Confirmed** network destination control; internal-service impact depends on deployment network and TLS trust.
- **Evidence:** `src/features/account/settings/notifications/push-notification-actions.ts:17–28` accepts a TypeScript-only `NotificationSubscription` and exposes an authenticated self-test. `src/core/notifications/subscription.ts:13–34` persists endpoint and keys without runtime validation. `src/core/notifications/send-push-notification.ts:25–28,68–78` passes them directly to web-push. Installed `node_modules/web-push/src/web-push-lib.js:86–95,274–286,348–369` accepts any nonempty endpoint, derives VAPID audience, then forwards parsed hostname/port/path to `https.request`.
- **Observed / inference:** an ordinary signed-in User can supply valid generated subscription keys with an arbitrary endpoint and trigger sending to their stored subscriptions. An in-memory fake `https.request` confirmed HTTPS POST targets `127.0.0.1:8443` from an HTTPS URL and `127.0.0.1:8080` even from an HTTP URL; the library always uses HTTPS transport. No network requests were made. There is no app-controlled destination constraint. This is blind SSRF: app returns only delivery success/failure, not remote response bodies; no evidence of arbitrary HTTP methods, plaintext HTTP, custom headers, or credential theft. Normal TLS certificate validation still applies to completed HTTPS delivery.
- **Why it matters:** association membership must not grant access to the deployment's internal network or arbitrary outbound connections. Broadcasts also process stored hostile endpoints later.
- **Recommendation / owner:** `core/notifications` owns one runtime-validating subscription seam used by all registration and delivery paths. Validate shape, lengths, key encoding, HTTPS-only scheme, no credentials, permitted ports, and actual push-provider destination policy. For this bounded product, a maintained exact/suffix-safe allowlist of supported browser push provider hosts is simpler than accepting all HTTPS URLs. Reject loopback/private/link-local destinations and enforce egress controls where feasible; check existing stored rows at send time as well. DNS/address enforcement must cover resolved connections rather than only checking the URL spelling. Do not log endpoints/auth keys.
- **Alternative:** a generic SSRF-safe HTTPS transport can support arbitrary push providers but costs substantially more than a documented provider list; this is not a reason to trust browser-looking input.
- **Dependencies / effort:** no product-model dependency; coordinate NOTIFY-04 transport deadline. **M**.
- **Acceptance / verification:** malformed or prohibited input rejected before persistence and before transport; direct action calls cannot bypass validation; existing hostile rows do not reach transport; accepted Chrome/Firefox/Safari provider subscriptions still send. Test with mocked transport and local fixture keys, including private IPs, non-HTTPS schemes, alternate ports, lookalike provider suffixes and DNS/address behavior of the selected policy. No production probing required.
- **Sources:** installed web-push **3.6.7** source is authoritative. [Official web-push send API](https://github.com/web-push-libs/web-push#sendnotificationpushsubscription-payload-options) describes subscription/options; the library is a delivery client, not this application's endpoint trust boundary.

<a id="notify-02"></a>

## NOTIFY-02 — Inactive Users continue receiving association notifications

- **Type / priority / confidence:** security risk / **High** / **Confirmed**.
- **Evidence:** `src/core/notifications/send-push-notification.ts:73–84` selects by subscription status and optional user IDs, never User activity. `src/core/notifications/subscription.ts:44–57` includes Inactive Users in the recipient picker. `src/features/user-management/actions.ts:87–103` deactivates via Better Auth and does not change subscriptions. `src/core/db/schema/notifications.ts:10–20` stores status independently from User activity; no delete occurs on ordinary deactivation.
- **Observed / inference:** an Admin can deactivate a User and a later `sendToAll`, `sendToUsers`, or self-test targeting that User still selects their active device rows. The picker continues displaying them. No session is required at push receipt (`public/service-worker.js:1–11` displays the payload). Internal content can therefore reach a former member after access was withdrawn, contrary to Inactive User semantics.
- **Recommendation / owner:** notifications delivery must apply the shared application rule for an active User at recipient selection; apply the same rule to the picker. Keep ordinary deactivation independent from subscription transport health. Optionally retire bindings during deactivation for lifecycle cleanup, but delivery filtering is still needed as the final boundary. Document whether reactivation restores eligible existing subscriptions. Do not promise recall of a notification already handed to a provider before deactivation.
- **Alternative / tradeoff:** disabling all subscription rows during deactivation also stops later sends, but mutation-only cleanup is easy for other callers to bypass and confuses a healthy device with withdrawn account access.
- **Dependencies / effort:** application-owned active-User policy may provide the predicate; this can be fixed before broader authorization migration. **S–M**.
- **Acceptance / verification:** set a User inactive with a valid active subscription; all-user, selected-user and direct-user delivery select no endpoint for them; picker omits them; active Users still receive; test chosen reactivation behavior. Include existing rows whose `banned` is null if current auth semantics treat them as active. Database/transport mocks suffice for selection contract; one disposable-DB check can verify actual join predicate.

<a id="notify-03"></a>

## NOTIFY-03 — Browser subscription state is mistaken for the current User's binding

- **Type / priority / confidence:** bug with conditional privacy impact / **Medium** / **Confirmed** state divergence; cross-user exposure requires shared browser profile/account switching.
- **Evidence:** `src/features/account/settings/notifications/push-notification-settings.tsx:28–40` loads `pushManager.getSubscription()` and sets UI state without consulting the application's binding. Lines 129–155 show enabled solely from that browser object and hide Enable. The only server binding call is explicit subscribe at 63–69. `src/core/notifications/subscription.ts:15–34` associates a unique endpoint with one User. `src/core/navigation/logout-button.tsx:14–18` only signs out/changes location. `public/service-worker.js:1–11` displays every payload without application-user identity.
- **Observed / inference:** A enables notifications, signs out, B signs in using the same browser profile. B's settings show Enabled, yet the endpoint remains A's. B's self-test finds no device if this was their only browser, and selected messages for A can appear while B uses it. The same false Enabled state occurs when browser subscribe succeeds but server storage fails, then settings reload. Browser service-worker subscription existence does not prove the current account owns an active server record.
- **Recommendation / owner:** give `core/notifications` and account settings one explicit binding/reconciliation workflow. Distinguish browser capability, browser subscription, and current User's active binding; show Enabled only after server confirmation. Offer an explicit repair/rebind for orphaned or different-account subscriptions, with consent and no disclosure of the previous owner's identity. Reconcile partially completed enable/disable operations. Integrate the chosen shared-device behavior with ordinary login/logout; avoid transferring binding during impersonation.
- **Product decision / tradeoff:** whether deliberate logout should revoke this browser's binding or allow push while logged out. Recommend revocation on explicit logout for shared-device privacy, but document the decision; fixing false Enabled/account-switch behavior does not depend on permitting cross-user delivery. This is a small lifecycle state machine, not a durable queue or persistent audit project.
- **Dependencies / effort:** subscription validation from NOTIFY-01; account-session transition seam. **M**.
- **Acceptance / verification:** exercise A-enable → A-logout → B-login in one browser profile; B never appears subscribed to A's binding and never silently takes it over. Enable with a failed server write can be repaired after reload; disable with server failure is reconciled; an already disabled server row does not appear enabled; impersonation does not bind an Admin's physical browser to the target User. Use a browser PushManager stub plus controlled server adapter, with one real supported-browser smoke if available.
- **Source:** [W3C Push API](https://www.w3.org/TR/push-api/) associates a push subscription with a service-worker registration, not an application login.

<a id="notify-04"></a>

## NOTIFY-04 — Push delivery has no deadline and conflates provider acceptance with bookkeeping

- **Type / priority / confidence:** bug / **Medium** / **Confirmed** control-flow failure; production frequency unknown.
- **Evidence:** `src/core/notifications/send-push-notification.ts:22–52` waits for all mapped deliveries. `sendNotification` at 25–28 has no timeout options. The same try block includes provider send and DB success update (29–33); failure enters delivery-failure bookkeeping at 34–49. Lines 54–56 declare success only for fully fulfilled send-plus-bookkeeping tasks and discard reasons. Installed web-push source `web-push-lib.js:116,222–223,356–357,395–399` only installs a socket timeout when supplied; no default exists.
- **Observed / inference:** one nonresponding provider/host can hold the full broadcast request until the hosting platform terminates it. If a provider accepted the push but `lastSuccessAt` persistence fails, the action reports failure even though the push was handed off; retrying can send a duplicate. When a partial batch succeeds, the result has no usable failure diagnostics. This does not challenge the documented intentional “one accepted subscription means success” contract; it challenges counting bookkeeping as provider acceptance and losing reasons/deadlines.
- **Recommendation / owner:** core notification delivery should bound provider calls (socket timeout plus an actual overall deadline if needed), use small bounded concurrency, and keep provider outcome separate from best-effort lifecycle/diagnostic persistence. Return or internally retain accepted/failed counts and sanitized failure categories so the feature can truthfully report results. Do not convert metadata failure into “not sent.” Apply atomic failure-count updates if concurrent sends retain those counters. Record operational errors without endpoints, keys or message contents. Durable queues/outbox infrastructure are unnecessary for the current manual broadcast tool.
- **Dependencies / effort:** coordinate NOTIFY-01 transport policy; no product decision. **M**.
- **Acceptance / verification:** one never-finishing provider reaches a defined end state while successful destinations remain counted; accepted push + DB update failure reports acceptance plus diagnostics, never automatic re-send; all-provider failure produces safe UI error and operational reason; 404/410 still disables invalid subscriptions. Use fake timers/mocked provider/database; no external delivery needed.
- **Source:** [Official web-push options](https://github.com/web-push-libs/web-push#sendnotificationpushsubscription-payload-options) states the socket timeout is optional/undefined by default and concerns inactivity, so it should not be mistaken for a total request deadline.

## Disposable verification performed

Ran an inline Node script using installed `web-push@3.6.7`, temporary in-memory VAPID and P-256 keys, and replacement `https.request` that only records options and emits a synthetic error. No application env imported, no files changed and no network/DB writes.

```json
{"endpoint":"https://127.0.0.1:8443/review-no-network","captured":{"hostname":"127.0.0.1","port":"8443","path":"/review-no-network","method":"POST","timeout":null}}
{"endpoint":"http://127.0.0.1:8080/review-no-network","captured":{"hostname":"127.0.0.1","port":"8080","path":"/review-no-network","method":"POST","timeout":null}}
```

Result validates destination/scheme behavior of the installed library only. App reachability is established from static authenticated action → storage → self-test → transport call flow. No claim of successful connection to an internal service.

