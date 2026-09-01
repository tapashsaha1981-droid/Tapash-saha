import React, { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { dashboardStats, monthLabel, shiftMonth, currentMonth, inr, studentMonthStats, reminderMessage, openWhatsApp } from "@/lib/calc";
import { ChevronLeft, ChevronRight, Download, Upload, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatCard } from "@/components/StatCard";
import { PaymentOverview } from "@/components/PaymentOverview";
import { useBackup } from "@/lib/useBackup";
import { toast } from "sonner";

export const Dashboard = () => {
  const { batches, students, payments, events, importAll } = useData();
  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState("monthly");
  const { fileRef, importOpen, setImportOpen, exportJSON, onImportPick, doImport } = useBackup({ batches, students, payments, events, importAll });

  const stats = useMemo(() => dashboardStats(students, batches, payments, month), [students, batches, payments, month]);

  const remindAllUnpaid = () => {
    const unpaid = students.filter((s) => {
      const st = studentMonthStats(s, payments, month);
      return st.status !== "paid" && s.phone;
    });
    if (unpaid.length === 0) return toast.info("No unpaid students with phone numbers");
    unpaid.forEach((s, i) => {
      const st = studentMonthStats(s, payments, month);
      const amount = Math.max(0, st.fee - st.paidThisMonth);
      setTimeout(() => openWhatsApp(s.phone, reminderMessage(s, amount, month)), i * 200);
    });
    toast.success(`Opening WhatsApp for ${unpaid.length} unpaid students`);
  };

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

      <PaymentOverview paid={stats.paid} partial={stats.partial} unpaid={stats.unpaid} />

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
