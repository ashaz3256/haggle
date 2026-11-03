"use client";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useState } from "react";

export default function PayPalCheckout({ negotiationId, amount, onPaid }: { negotiationId: string; amount: number; onPaid: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) return <p className="text-xs text-red">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable checkout.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted text-center">Checkout for £{amount.toFixed(2)} · PayPal sandbox</p>
      <PayPalScriptProvider options={{ clientId, currency: "GBP", intent: "capture" }}>
        <PayPalButtons
          style={{ layout: "vertical", shape: "pill", label: "pay" }}
          createOrder={async () => {
            const r = await fetch("/api/paypal/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ negotiationId }) });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "Could not create order");
            return j.id;
          }}
          onApprove={async (data) => {
            const r = await fetch("/api/paypal/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ negotiationId, orderId: data.orderID }) });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "Capture failed");
            onPaid();
          }}
          onError={(e) => setErr(String(e))}
        />
      </PayPalScriptProvider>
      {err && <p className="text-xs text-red">{err}</p>}
    </div>
  );
}
