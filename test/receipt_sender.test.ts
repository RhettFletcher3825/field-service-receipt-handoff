import assert from "node:assert/strict";
import test from "node:test";
import type { InfraiEmailClient } from "../src/infrai_email.js";
import { sendCompletedWorkOrderReceipt, type ReceiptRequest } from "../src/receipt_sender.js";

const scheduledOrder: ReceiptRequest = {
  work_order_id: "WO-1042",
  customer_email: "patient@example.test",
  customer_name: "Taylor Kim",
  dispatch_status: "scheduled",
  amount_cents: 9500,
  currency: "USD",
  photos: [],
  technician_follow_up: { required: false },
};

test("a scheduled work order does not send a receipt", async () => {
  let sendCount = 0;
  const client = {
    email: {
      send: async () => {
        sendCount += 1;
        return { message_id: "msg_unused" };
      },
      get: async () => ({}),
    },
  } as InfraiEmailClient;

  const outcome = await sendCompletedWorkOrderReceipt(scheduledOrder, client);
  assert.deepEqual(outcome, { state: "waiting_for_completion", work_order_id: "WO-1042" });
  assert.equal(sendCount, 0);
});

test("a completed order sends once and hands message_id to status lookup", async () => {
  const lookedUp: string[] = [];
  const client = {
    email: {
      send: async () => ({ message_id: "msg_1042" }),
      get: async (messageId: string) => {
        lookedUp.push(messageId);
        return { status: "accepted" };
      },
    },
  } as InfraiEmailClient;

  const outcome = await sendCompletedWorkOrderReceipt(
    { ...scheduledOrder, dispatch_status: "completed" },
    client,
  );
  assert.equal(outcome.state, "sent");
  assert.deepEqual(lookedUp, ["msg_1042"]);
});
