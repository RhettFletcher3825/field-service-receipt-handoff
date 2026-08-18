import { createServer } from "node:http";
import { ZodError } from "zod";
import { createInfraiEmailClient, InfraiError } from "./infrai_email.js";
import { receiptRequestSchema, sendCompletedWorkOrderReceipt } from "./receipt_sender.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const infrai = createInfraiEmailClient(apiKey);

function statusFor(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/work-orders/receipt") {
    response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = receiptRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const outcome = await sendCompletedWorkOrderReceipt(input, infrai);
    response.writeHead(outcome.state === "sent" ? 201 : 202).end(JSON.stringify(outcome));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request" }));
      return;
    }
    if (error instanceof InfraiError) {
      response.writeHead(statusFor(error)).end(JSON.stringify({ error: error.detail }));
      return;
    }
    response.writeHead(500).end(JSON.stringify({ error: "internal_error" }));
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Receipt service listening on http://localhost:${process.env.PORT ?? 3000}`);
});
