/**
 * Minimal PayPal Orders API v2 client (sandbox).
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

async function accessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

export interface CreateOrderInput {
  amount: number;
  currency?: string;
  description: string;
  referenceId: string;
  /** AUTHORIZE = hold funds, capture on delivery. CAPTURE = take payment now. */
  intent?: "CAPTURE" | "AUTHORIZE";
}

export async function createOrder(input: CreateOrderInput) {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `${input.referenceId}-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: input.intent ?? "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.currency ?? "GBP",
            value: input.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "Haggle",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    }),
  });
  if (!res.ok) throw new Error(`PayPal create order failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string; status: string }>;
}

export async function captureOrder(orderId: string) {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{
    id: string;
    status: string;
    purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
  }>;
}

export async function getOrder(orderId: string) {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal get order failed: ${res.status}`);
  return res.json();
}
