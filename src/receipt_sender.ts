import { z } from "zod";
import type { InfraiEmailClient } from "./infrai_email.js";

export const receiptRequestSchema = z.object({
  work_order_id: z.string().min(1).max(80),
  customer_email: z.string().email(),
  customer_name: z.string().min(1).max(120),
  dispatch_status: z.enum(["scheduled", "en_route", "on_site", "completed"]),
  amount_cents: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  photos: z.array(
    z.object({
      kind: z.enum(["arrival", "work", "completion"]),
      url: z.string().url(),
    }),
  ).max(20),
  technician_follow_up: z.object({
    required: z.boolean(),
    note: z.string().max(500).optional(),
  }),
});

export type ReceiptRequest = z.infer<typeof receiptRequestSchema>;

export type ReceiptOutcome =
  | { state: "waiting_for_completion"; work_order_id: string }
  | { state: "sent"; work_order_id: string; message_id: string; delivery: unknown };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] as string);
}

export async function sendCompletedWorkOrderReceipt(
  input: ReceiptRequest,
  infrai: InfraiEmailClient,
): Promise<ReceiptOutcome> {
  if (input.dispatch_status !== "completed") {
    return { state: "waiting_for_completion", work_order_id: input.work_order_id };
  }

  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: input.currency,
  }).format(input.amount_cents / 100);
  const followUp = input.technician_follow_up.required
    ? "A technician will contact you for follow-up."
    : "No technician follow-up is scheduled.";
  const sent = await infrai.email.send({
    to: input.customer_email,
    subject: `Receipt for work order ${input.work_order_id}`,
    html: `<h1>Service receipt</h1><p>Hello ${escapeHtml(input.customer_name)},</p><p>Work order <strong>${escapeHtml(input.work_order_id)}</strong> is complete.</p><p>Total: ${escapeHtml(amount)}</p><p>Completion photos recorded: ${input.photos.length}</p><p>${followUp}</p>`,
  }, `work-order-receipt:${input.work_order_id}`);

  const delivery = await infrai.email.get(sent.message_id);
  return {
    state: "sent",
    work_order_id: input.work_order_id,
    message_id: sent.message_id,
    delivery,
  };
}
