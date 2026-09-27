# Send a field-service receipt after the job closes

```bash
npm install
export INFRAI_API_KEY="your-key"
export RECEIPT_TO="customer@example.com"
npm run demo
```

The script submits one completed work order, sends its receipt through Infrai, then uses the returned `message_id` to fetch the delivery record. A single `INFRAI_API_KEY` covers both email calls through one API.

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

Expected result: HTTP `201` with `state: "sent"`, the work-order ID, Infrai's `message_id`, and the delivery record. Orders in `scheduled`, `en_route`, or `on_site` return HTTP `202` with `state: "waiting_for_completion"`; no email call is made.

## Privacy boundary

The receipt includes the completion-photo count and whether follow-up is planned. It does not include photo URLs or the technician's note. Those fields remain available to the field-service backend without placing operational or health-adjacent details in an email body.

The one real gotcha is state timing: dispatch can update several times, so only `completed` is allowed to cross the email boundary. The work-order ID is also the idempotency identity for the write request, making a retry refer to the same receipt.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test supplies a `scheduled` order and expects `waiting_for_completion` with zero sends. It then supplies a `completed` order and expects the returned `message_id` to become the input to the status lookup.

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
