import DealsGrid from "@/components/DealsGrid";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">Deals dashboard</h1>
        <p className="text-sm text-muted">Every negotiation, what the agents agreed, and what PayPal settled.</p>
      </div>
      <DealsGrid />
    </div>
  );
}
