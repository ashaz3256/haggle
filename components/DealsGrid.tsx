"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import Link from "next/link";

ModuleRegistry.registerModules([AllCommunityModule]);

type Turn = { idx: number; role: string; action: string; price: number | null; days: number | null; message: string; reason: string | null };

type Row = {
  id: string; listing: string; buyer: string; asking: number; budget: number; agreed: number | null;
  savedVsAsking: number | null; underBudget: number | null; days: number | null; rounds: number;
  guardBlocks: number; status: string; paypalOrderId: string | null; createdAt: string;
  mode?: string; endReason?: string | null; turns: Turn[];
};

const gbp = (p: { value: number | null | undefined }) => (p.value == null ? "—" : `£${p.value.toFixed(0)}`);

const theme = themeQuartz.withParams({
  accentColor: "#0070e0",
  headerBackgroundColor: "#f5f7fa",
  headerTextColor: "#001c64",
  borderColor: "#e1e7eb",
  fontFamily: "Inter, system-ui, sans-serif",
  rowHoverColor: "#f5f7fa",
  selectedRowBackgroundColor: "#e8f1fc",
});

const STATUS_CLASS: Record<string, string> = { paid: "bg-green text-white", agreed: "bg-green/10 text-green", walked: "bg-red/10 text-red", negotiating: "bg-blue/10 text-blue", pending: "bg-mist text-muted", needs_human: "bg-amber/15 text-amber" };
const ROLE_CLASS: Record<string, string> = { buyer: "bg-blue/10 text-blue", seller: "bg-navy/10 text-navy", system: "bg-amber/15 text-amber" };

// Offers that carried a price, in order: the buyer and seller lines converging is the story of the deal.
const priced = (r: Row) => (r.turns ?? []).filter((t) => t.price != null && (t.role === "buyer" || t.role === "seller"));

function PricePath(p: ICellRendererParams<Row>) {
  const r = p.data;
  if (!r || p.node.rowPinned) return null;
  const pts = priced(r);
  if (pts.length === 0) return <span className="text-muted text-xs">no offers yet</span>;
  const W = 150, H = 30, pad = 3;
  const vals = [...pts.map((t) => t.price as number), r.budget];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (i: number) => pad + (pts.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (pts.length - 1));
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad);
  const line = (role: string) => pts.map((t, i) => [t, i] as const).filter(([t]) => t.role === role).map(([t, i]) => `${x(i)},${y(t.price as number)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} style={{ marginTop: 6 }} aria-label={`Price path: ${pts.map((t) => `${t.role} £${t.price}`).join(", ")}`}>
      <line x1={0} x2={W} y1={y(r.budget)} y2={y(r.budget)} stroke="#d93025" strokeDasharray="3 3" strokeWidth={1} opacity={0.6} />
      <polyline points={line("seller")} fill="none" stroke="#001c64" strokeWidth={2} />
      <polyline points={line("buyer")} fill="none" stroke="#0070e0" strokeWidth={2} />
      <circle cx={x(pts.length - 1)} cy={y(last.price as number)} r={3} fill={r.agreed != null ? "#118d4a" : last.role === "buyer" ? "#0070e0" : "#001c64"} />
    </svg>
  );
}

export default function DealsGrid() {
  const gridRef = useRef<AgGridReact<Row>>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Live: poll so running negotiations update in place (getRowId keeps rows stable, changed cells flash).
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/dashboard").then((r) => r.json()).then((d: Row[]) => { if (alive) setRows(d); }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const cols = useMemo<ColDef<Row>[]>(() => ([
    { field: "listing", headerName: "Listing", flex: 2, minWidth: 180, cellRenderer: (p: ICellRendererParams<Row>) =>
      p.node.rowPinned ? <b className="text-navy">{p.value}</b> : <Link className="text-blue font-semibold" href={`/deal/${p.data!.id}`}>{p.value}</Link> },
    { field: "buyer", flex: 1, minWidth: 110 },
    { field: "status", width: 130, cellRenderer: (p: ICellRendererParams<Row>) =>
      p.node.rowPinned || !p.value ? null : <span className={`pill ${STATUS_CLASS[p.value] ?? ""}`}>{p.value === "needs_human" ? "needs human" : p.value}</span> },
    { colId: "pricePath", headerName: "Price path", width: 170, sortable: false, filter: false, cellRenderer: PricePath,
      // CSV gets the offer sequence as text
      valueGetter: (p) => (p.data && !p.node?.rowPinned ? priced(p.data).map((t) => `${t.role[0]}${t.price}`).join(" > ") : ""),
      headerTooltip: "Buyer offers (blue) vs seller offers (navy); dashed red = buyer's private max" },
    { field: "asking", valueFormatter: gbp, width: 100, filter: "agNumberColumnFilter" },
    { field: "budget", headerName: "Buyer max", valueFormatter: gbp, width: 110, filter: "agNumberColumnFilter" },
    { field: "agreed", valueFormatter: gbp, width: 105, filter: "agNumberColumnFilter", cellStyle: { fontWeight: 700, color: "#001c64" } },
    { field: "savedVsAsking", headerName: "Saved vs asking", valueFormatter: gbp, width: 145, filter: "agNumberColumnFilter", cellStyle: { color: "#118d4a" } },
    { field: "underBudget", headerName: "Under max", valueFormatter: gbp, width: 115, filter: "agNumberColumnFilter" },
    { field: "days", width: 80 },
    { field: "rounds", width: 95, filter: "agNumberColumnFilter" },
    { field: "guardBlocks", headerName: "Guard blocks", width: 125, filter: "agNumberColumnFilter",
      cellStyle: (p) => (p.value > 0 && !p.node.rowPinned ? { color: "#d93025", fontWeight: 700 } : null) },
    { field: "paypalOrderId", headerName: "PayPal order", flex: 1, minWidth: 150 },
  ] as ColDef<Row>[]), []);

  const totals = useMemo(() => {
    const done = rows.filter((r) => r.agreed != null);
    return {
      deals: done.length,
      paid: rows.filter((r) => r.status === "paid").length,
      saved: done.reduce((s, r) => s + (r.savedVsAsking ?? 0), 0),
      under: done.reduce((s, r) => s + (r.underBudget ?? 0), 0),
      agreed: done.reduce((s, r) => s + (r.agreed ?? 0), 0),
      rounds: rows.reduce((s, r) => s + r.rounds, 0),
      blocks: rows.reduce((s, r) => s + r.guardBlocks, 0),
    };
  }, [rows]);

  const pinned = useMemo<Row[]>(() => [{
    id: "__total", listing: `Totals (${rows.length} negotiations)`, buyer: "", asking: null, budget: null, status: "",
    agreed: totals.agreed, savedVsAsking: totals.saved, underBudget: totals.under, days: null,
    rounds: totals.rounds, guardBlocks: totals.blocks, paypalOrderId: `${totals.paid} paid`, createdAt: "", turns: [],
  } as unknown as Row], [rows.length, totals]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Deals reached" value={String(totals.deals)} />
        <Kpi label="Paid via PayPal" value={String(totals.paid)} />
        <Kpi label="Saved vs asking" value={`£${totals.saved.toFixed(0)}`} />
        <Kpi label="Guard blocks" value={String(totals.blocks)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input flex-1 min-w-[200px]" placeholder="Search deals (listing, buyer, status, PayPal order…)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-ghost" onClick={() => gridRef.current?.api.exportDataAsCsv({ fileName: "haggle-deals.csv" })}>Export CSV</button>
      </div>

      <div className="card overflow-hidden" style={{ height: 520 }}>
        <AgGridReact<Row>
          ref={gridRef}
          theme={theme}
          rowData={rows}
          columnDefs={cols}
          getRowId={(p) => p.data.id}
          quickFilterText={search}
          pinnedBottomRowData={pinned}
          rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
          onRowClicked={(e) => { if (!e.node.rowPinned && e.data) setSelectedId(e.data.id); }}
          tooltipShowDelay={300}
          defaultColDef={{ sortable: true, filter: true, resizable: true, enableCellChangeFlash: true }}
        />
      </div>
      <p className="text-xs text-muted">Click a row to see every move the agents made. Updates live every 5 seconds.</p>

      {selected && <TurnLog row={selected} />}
    </div>
  );
}

function TurnLog({ row }: { row: Row }) {
  const cols = useMemo<ColDef<Turn>[]>(() => ([
    { field: "idx", headerName: "#", width: 70 },
    { field: "role", width: 110, cellRenderer: (p: ICellRendererParams<Turn>) => <span className={`pill ${ROLE_CLASS[p.value] ?? ""}`}>{p.value}</span> },
    { field: "action", width: 110, cellStyle: (p) => (p.value === "blocked" ? { color: "#d93025", fontWeight: 700 } : null) },
    { field: "price", valueFormatter: gbp, width: 100 },
    { field: "days", width: 80 },
    { field: "message", flex: 3, minWidth: 260, wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.4", paddingTop: 8, paddingBottom: 8 } },
    { field: "reason", headerName: "Private reason", flex: 2, minWidth: 180, wrapText: true, autoHeight: true, cellStyle: { lineHeight: "1.4", paddingTop: 8, paddingBottom: 8 } },
  ] as ColDef<Turn>[]), []);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold text-navy">Turn log: {row.listing} <span className="text-sm font-normal text-muted">({row.buyer}, {row.status === "needs_human" ? "needs human" : row.status})</span></h2>
        <Link className="text-blue text-sm font-semibold" href={`/deal/${row.id}`}>Open deal room →</Link>
      </div>
      {row.endReason && <p className="text-sm text-muted">Ended: {row.endReason}</p>}
      <div className="card overflow-hidden" style={{ height: 380 }}>
        <AgGridReact<Turn> theme={theme} rowData={row.turns} columnDefs={cols} getRowId={(p) => String(p.data.idx)}
          defaultColDef={{ sortable: true, filter: true, resizable: true, enableCellChangeFlash: true }} />
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
