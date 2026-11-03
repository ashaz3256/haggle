"use client";
import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import Link from "next/link";

ModuleRegistry.registerModules([AllCommunityModule]);

type Row = {
  id: string; listing: string; buyer: string; asking: number; budget: number; agreed: number | null;
  savedVsAsking: number | null; underBudget: number | null; days: number | null; rounds: number;
  guardBlocks: number; status: string; paypalOrderId: string | null; createdAt: string;
};

const gbp = (p: { value: number | null }) => (p.value == null ? "—" : `£${p.value.toFixed(0)}`);

const theme = themeQuartz.withParams({
  accentColor: "#0070e0",
  headerBackgroundColor: "#f5f7fa",
  headerTextColor: "#001c64",
  borderColor: "#e1e7eb",
  fontFamily: "Inter, system-ui, sans-serif",
  rowHoverColor: "#f5f7fa",
});

export default function DealsGrid() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { fetch("/api/dashboard").then((r) => r.json()).then(setRows); }, []);

  const cols = useMemo<ColDef<Row>[]>(() => ([
    { field: "listing", headerName: "Listing", flex: 2, cellRenderer: (p: { data: Row }) => <Link className="text-blue font-semibold" href={`/deal/${p.data.id}`}>{p.data.listing}</Link> },
    { field: "buyer", flex: 1 },
    { field: "status", width: 120, cellRenderer: (p: { value: string }) => {
      const c: Record<string, string> = { paid: "bg-green text-white", agreed: "bg-green/10 text-green", walked: "bg-red/10 text-red", negotiating: "bg-blue/10 text-blue", pending: "bg-mist text-muted" };
      return <span className={`pill ${c[p.value] ?? ""}`}>{p.value}</span>;
    } },
    { field: "asking", valueFormatter: gbp, width: 100 },
    { field: "budget", headerName: "Buyer max", valueFormatter: gbp, width: 110 },
    { field: "agreed", valueFormatter: gbp, width: 100, cellStyle: { fontWeight: 700, color: "#001c64" } },
    { field: "savedVsAsking", headerName: "Saved vs asking", valueFormatter: gbp, width: 140, cellStyle: { color: "#118d4a" } },
    { field: "underBudget", headerName: "Under max", valueFormatter: gbp, width: 110 },
    { field: "days", width: 80 },
    { field: "rounds", width: 90 },
    { field: "guardBlocks", headerName: "Guard blocks", width: 120 },
    { field: "paypalOrderId", headerName: "PayPal order", flex: 1 },
  ] as ColDef<Row>[]), []);

  const totals = useMemo(() => {
    const done = rows.filter((r) => r.agreed != null);
    return {
      deals: done.length,
      paid: rows.filter((r) => r.status === "paid").length,
      saved: done.reduce((s, r) => s + (r.savedVsAsking ?? 0), 0),
      blocks: rows.reduce((s, r) => s + r.guardBlocks, 0),
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Deals reached" value={String(totals.deals)} />
        <Kpi label="Paid via PayPal" value={String(totals.paid)} />
        <Kpi label="Saved vs asking" value={`£${totals.saved.toFixed(0)}`} />
        <Kpi label="Guard blocks" value={String(totals.blocks)} />
      </div>
      <div className="card overflow-hidden" style={{ height: 520 }}>
        <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} defaultColDef={{ sortable: true, filter: true, resizable: true }} />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-extrabold text-navy mt-1">{value}</div>
    </div>
  );
}
