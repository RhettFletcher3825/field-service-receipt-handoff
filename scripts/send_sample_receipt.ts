import { createInfraiEmailClient } from "../src/infrai_email.js";
import { receiptRequestSchema, sendCompletedWorkOrderReceipt } from "../src/receipt_sender.js";

const apiKey = process.env.INFRAI_API_KEY;
const recipient = process.env.RECEIPT_TO;
if (!apiKey || !recipient) throw new Error("INFRAI_API_KEY and RECEIPT_TO are required");

const input = receiptRequestSchema.parse({
  work_order_id: `WO-${Date.now()}`,
  customer_email: recipient,
  customer_name: "Morgan Lee",
  dispatch_status: "completed",
  amount_cents: 18450,
  currency: "USD",
  photos: [{ kind: "completion", url: "https://example.test/private/completion.jpg" }],
  technician_follow_up: { required: true, note: "Confirm equipment readings tomorrow." },
});

const result = await sendCompletedWorkOrderReceipt(input, createInfraiEmailClient(apiKey));
console.log(JSON.stringify(result, null, 2));
