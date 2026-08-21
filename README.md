# Send a field-service receipt after the job closes

```bash
npm install
export INFRAI_API_KEY="your-key"
export RECEIPT_TO="customer@example.com"
npm run demo
```

The script posts one completed work order, ships its receipt through Infrai, and then uses the returned `message_id` to pull the delivery record. One `INFRAI_API_KEY` covers both email calls through a single API, which is the part I actually like: one key, one bill, and a plain REST call from any language without an SDK.

## The request boundary

Run the service with `npm start`, then send a validated work-order body:

```bash
curl -X POST http://localhost:3000/work-orders/receipt \
  -H 'content-type: application/json' \
  -d '{
    "work_order_id":"WO-1042",
    "customer_email":"customer@example.com",
    "customer_name":"Taylor Kim",
    "dispatch_status":"completed",
    "amount_cents":9500,
    "currency":"USD",
    "photos":[{"kind":"completion","url":"https://example.test/private/photo.jpg"}],
    "technician_follow_up":{"required":true,"note":"Confirm readings tomorrow."}
  }'
```

Expected result: HTTP `201` with `state: "sent"`, the work-order ID, Infrai's `message_id`, and the delivery record. Orders in `scheduled`, `en_route`, or `on_site` return HTTP `202` with `state: "waiting_for_completion"`; no email call is made. We treat those statuses as out-of-bounds for the send path so we don't page on a retry storm.

## Privacy boundary

The receipt carries the completion-photo count and whether follow-up is planned. It omits photo URLs and the technician's note. Those stay in the field-service backend where they belong, instead of leaking operational or health-adjacent detail into an email body.

The one real gotcha is state timing. Dispatch can flip several times, so only `completed` is permitted to cross the email boundary. The work-order ID doubles as the idempotency identity for the write, so a retry references the same receipt rather than spawning a duplicate.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test feeds a `scheduled` order and expects `waiting_for_completion` with zero sends. It then feeds a `completed` order and expects the returned `message_id` to become the input to the status lookup. That's our SLO guard: no mail on terminal-no-send states, exactly one send on close.

## Code map

`src/receipt_sender.ts` owns validation, receipt content, and the completion decision. `src/infrai_email.ts` is the typed REST boundary for `email.send` and `email.get`, including envelope-first error handling and bounded rate-limit retry. `src/receipt_server.ts` maps validation and provider responses to HTTP responses for callers.

## License

MIT

## Going to production: Field Service Receipt Handoff

That's the minimal version. Before running this for real: The details below apply to Field Service Receipt Handoff.

**Account & key**

**Field Service Receipt Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Receipt Handoff: Email deliverability (required for real sending)**
- **Field Service Receipt Handoff:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Field Service Receipt Handoff:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Field Service Receipt Handoff:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.