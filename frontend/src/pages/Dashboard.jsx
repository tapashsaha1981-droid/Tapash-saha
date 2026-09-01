import React, { useMemo, useRef, useState } from "react";
import { useData } from "@/lib/store";
import { dashboardStats, monthLabel, shiftMonth, currentMonth, inr, studentMonthStats } from "@/lib/calc";
import { ChevronLeft, ChevronRight, Download, Upload, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";

const StatCard = ({ emoji, value, label, tint, testid }) => (
  <div data-testid={testid} className={`rounded-3xl bg-white p-5 sm:p-6 soft-shadow card-hover`}>
    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-2xl mb-3 ${tint}`}>{emoji}</div>
    <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">{value}</div>
    <div className="text-sm text-slate-500 font-medium mt-1">{label}</div>
  </div>
);

export const Dashboard = () => {
  const { batches, students, payments, events, addPayment, importAll, refresh } = useData();
  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState("monthly");
  const [importOpen, setImportOpen] = useState(false);
  const pendingImport = useRef(null);
  const fileRef = useRef(null);

  const stats = useMemo(() => dashboardStats(students, batches, payments, month), [students, batches, payments, month]);

  const remindAllUnpaid = () => {
    const unpaid = students.filter((s) => {
      const st = studentMonthStats(s, payments, month);
      return st.status !== "paid" && s.phone;
    });
    if (unpaid.length === 0) return toast.info("No unpaid students with phone numbers");
    // Compose messages, open WhatsApp for the first, queue rest via prompt
    unpaid.forEach((s, i) => {
      const st = studentMonthStats(s, payments, month);
      const amount = Math.max(0, st.fee - st.paidThisMonth);
      const msg = `Hello ${s.name}, this is a reminder regarding the tuition fee of ${inr(amount)} for ${monthLabel(month)}. Please make the payment at your convenience. Thank you.`;
      const url = `https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
      // stagger new windows slightly to avoid blocking
      setTimeout(() => window.open(url, "_blank", "noopener"), i * 200);
    });
    toast.success(`Opening WhatsApp for ${unpaid.length} unpaid students`);
  };

  const exportJSON = async () => {
    const data = { batches, students, payments, events };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tapash-sir-backup-${currentMonth()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exported");
  };

  const onImportPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("Invalid backup file: expected a JSON object");
          return;
        }
        const asArray = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
        const normalized = {
          batches: asArray(parsed.batches),
          students: asArray(parsed.students),
          payments: asArray(parsed.payments),
          events: asArray(parsed.events),
        };
        if (!normalized.batches.length && !normalized.students.length && !normalized.payments.length) {
          toast.error("Backup file has no batches, students or payments to import");
          return;
        }
        pendingImport.current = normalized;
        setImportOpen(true);
      } catch (err) {
        toast.error("Invalid JSON file — please choose a backup exported from this app");
      }
    };
    reader.onerror = () => toast.error("Could not read the selected file");
    reader.readAsText(file);
    e.target.value = "";
  };

  const doImport = async () => {
    try {
      const res = await importAll(pendingImport.current);
      const c = res?.counts;
      toast.success(c ? `Imported ${c.batches} batches, ${c.students} students, ${c.payments} payments` : "Data imported");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed — please try again");
      throw err;
    }
  };

  const total = Math.max(1, stats.paid + stats.partial + stats.unpaid);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
          <div className="mt-2 inline-flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
            <button data-testid="month-prev" onClick={() => setMonth(shiftMonth(month, -1))} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronLeft size={18} /></button>
            <div className="px-3 font-semibold text-slate-900 min-w-[140px] text-center" data-testid="dashboard-month-label">{monthLabel(month)}</div>
            <button data-testid="month-next" onClick={() => setMonth(shiftMonth(month, 1))} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button data-testid="remind-all" onClick={remindAllUnpaid} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl gap-2">
            <Megaphone size={16} /> Remind All Unpaid
          </Button>
          <Button data-testid="export-json" onClick={exportJSON} variant="outline" className="rounded-xl gap-2"><Download size={16} /> Export JSON</Button>
          <Button data-testid="import-json" onClick={() => fileRef.current?.click()} variant="outline" className="rounded-xl gap-2"><Upload size={16} /> Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="absolute w-px h-px opacity-0 overflow-hidden pointer-events-none" onChange={onImportPick} data-testid="import-file-input" aria-label="Import JSON backup" />
        </div>
      </div>

      <div className="inline-flex bg-white rounded-2xl border border-slate-200 p-1">
        <button data-testid="mode-monthly" onClick={() => setMode("monthly")} className={`px-4 py-1.5 rounded-xl text-sm font-semibold ${mode === "monthly" ? "bg-indigo-600 text-white" : "text-slate-600"}`}>Monthly</button>
        <button data-testid="mode-overall" onClick={() => setMode("overall")} className={`px-4 py-1.5 rounded-xl text-sm font-semibold ${mode === "overall" ? "bg-indigo-600 text-white" : "text-slate-600"}`}>Overall</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testid="stat-students" emoji="🎓" value={stats.students} label="Students This Month" tint="bg-indigo-100" />
        <StatCard testid="stat-batches" emoji="📚" value={stats.batches} label="Total Batches" tint="bg-violet-100" />
        <StatCard testid="stat-collected" emoji="✅" value={inr(stats.collected)} label="Collected This Month" tint="bg-emerald-100" />
        <StatCard testid="stat-pending" emoji="⌛" value={inr(stats.pending)} label="Pending This Month" tint="bg-amber-100" />
      </div>

      <div className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow">
        <div className="text-xs font-bold text-slate-500 tracking-wider">PAYMENT OVERVIEW</div>
        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /> <span className="font-bold" data-testid="ov-paid">{stats.paid}</span> Paid</div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" /> <span className="font-bold" data-testid="ov-partial">{stats.partial}</span> Partial</div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" /> <span className="font-bold" data-testid="ov-unpaid">{stats.unpaid}</span> Unpaid</div>
        </div>
        <div className="mt-4 h-3 w-full rounded-full overflow-hidden bg-slate-100 flex">
          <div className="bg-emerald-500 h-full" style={{ width: `${(stats.paid / total) * 100}%` }} />
          <div className="bg-amber-400 h-full" style={{ width: `${(stats.partial / total) * 100}%` }} />
          <div className="bg-rose-500 h-full" style={{ width: `${(stats.unpaid / total) * 100}%` }} />
        </div>
      </div>

      <ConfirmDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Backup?"
        description="Importing this backup will replace the current data. Continue?"
        confirmLabel="Replace Data"
        onConfirm={doImport}
        danger
      />
    </div>
  );
};
