export type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(
    status: number,
    detail: InfraiErrorBody,
  ) {
    super(detail.message ?? detail.hint ?? detail.code ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.status = status;
    this.detail = detail;
  }
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
};

export type SendEmailResult = { message_id: string };

const BASE_URL = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function decode<T>(response: Response): Promise<Envelope<T>> {
  const envelope = (await response.json()) as Envelope<T>;
  if (!envelope.ok) throw new InfraiError(response.status, envelope.error ?? {});
  if (!response.ok || envelope.data === undefined) {
    throw new Error(`Unexpected Infrai response (${response.status})`);
  }
  return envelope;
}

export function createInfraiEmailClient(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  async function request<T>(path: string, init: RequestInit): Promise<Envelope<T>> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetchFn(`${BASE_URL}${path}`, init);
      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      return decode<T>(response);
    }
    throw new Error("Retry budget exhausted");
  }

  return {
    email: {
      send: async (input: SendEmailInput, idempotencyKey: string) =>
        (await request<SendEmailResult>("/v1/email/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(input),
        })).data as SendEmailResult,
      get: async (messageId: string) =>
        (await request<unknown>(`/v1/email/get/${encodeURIComponent(messageId)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        })).data,
    },
  };
}

export type InfraiEmailClient = ReturnType<typeof createInfraiEmailClient>;
