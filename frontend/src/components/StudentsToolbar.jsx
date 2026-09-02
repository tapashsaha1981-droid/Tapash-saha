import React from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { monthLabel } from "@/lib/calc";
import { cn } from "@/lib/utils";

const STATUS_CHIP_ACTIVE = {
  all: "bg-indigo-600",
  unpaid: "bg-rose-500",
  partial: "bg-amber-500",
  paid: "bg-emerald-600",
};

const FilterChip = ({ active, onClick, label, testid }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={cn(
      "btn-press whitespace-nowrap px-4 h-10 rounded-full text-sm font-semibold",
      active ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
    )}
  >{label}</button>
);

export const StudentsToolbar = ({ month, onShiftMonth, batches, batchFilter, onBatchFilter, query, onQuery, statusFilter, onStatusFilter }) => (
  <>
    <div className="inline-flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
      <button data-testid="stu-month-prev" onClick={() => onShiftMonth(-1)} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronLeft size={18} /></button>
      <div className="px-3 font-semibold text-slate-900 min-w-[140px] text-center">{monthLabel(month)}</div>
      <button data-testid="stu-month-next" onClick={() => onShiftMonth(1)} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronRight size={18} /></button>
    </div>

    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      <FilterChip active={batchFilter === "all"} onClick={() => onBatchFilter("all")} label="All Batches" testid="batch-filter-all" />
      {batches.map((b) => (
        <FilterChip key={b.id} active={batchFilter === b.id} onClick={() => onBatchFilter(b.id)} label={b.name} testid={`batch-filter-${b.id}`} />
      ))}
    </div>

    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input data-testid="student-search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search students..." className="pl-9 rounded-xl" />
      </div>
      <div className="flex gap-2">
        {["all", "unpaid", "partial", "paid"].map((s) => (
          <button
            key={s}
            data-testid={`status-filter-${s}`}
            onClick={() => onStatusFilter(s)}
            className={cn(
              "btn-press px-3.5 h-10 rounded-xl text-sm font-semibold capitalize text-white",
              statusFilter === s ? STATUS_CHIP_ACTIVE[s] : "bg-white border border-slate-200 !text-slate-700 hover:bg-slate-50"
            )}
          >{s}</button>
        ))}
      </div>
    </div>
  </>
);
