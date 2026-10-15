import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ChevronDown, Check } from "lucide-react";
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


const BatchSelector = ({ batches, batchFilter, onBatchFilter }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);

  const sortedBatches = useMemo(() => {
    const classNumber = (name) => {
      const match = String(name || "").match(/(?:class|grade)\s*(\d+)/i);
      return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    };

    const timeRank = (name) => {
      const value = String(name || "").toLowerCase();
      if (value.includes("morning")) return 1;
      if (value.includes("afternoon")) return 2;
      if (value.includes("evening")) return 3;
      if (value.includes("night")) return 4;
      return 0;
    };

    return [...batches].sort((a, b) => {
      const gradeDifference = classNumber(a.name) - classNumber(b.name);
      if (gradeDifference !== 0) return gradeDifference;

      const timeDifference = timeRank(a.name) - timeRank(b.name);
      if (timeDifference !== 0) return timeDifference;

      return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [batches]);

  const filteredBatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sortedBatches;
    return sortedBatches.filter((batch) =>
      String(batch.name || "").toLowerCase().includes(term)
    );
  }, [sortedBatches, search]);

  const selectedName =
    batchFilter === "all"
      ? "All Batches"
      : batches.find((batch) => batch.id === batchFilter)?.name || "Select Batch";

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const chooseBatch = (id) => {
    onBatchFilter(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={rootRef} className="relative z-30 w-full max-w-sm pb-1">
      <button
        type="button"
        data-testid="batch-selector"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="btn-press flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-white px-4 text-left font-semibold text-slate-800 shadow-sm hover:bg-indigo-50"
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="relative mb-2">
            <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="batch-search"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search batches..."
              className="h-12 rounded-xl pl-11 text-base"
            />
          </div>

          <div className="max-h-[min(55vh,420px)] overflow-y-auto overscroll-contain" role="listbox" aria-label="Choose a batch">
            <button
              type="button"
              role="option"
              aria-selected={batchFilter === "all"}
              data-testid="batch-filter-all"
              onClick={() => chooseBatch("all")}
              className={cn(
                "flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold",
                batchFilter === "all"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-700 hover:bg-slate-50"
              )}
            >
              <span>All Batches</span>
              {batchFilter === "all" && <Check size={17} />}
            </button>

            {filteredBatches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                role="option"
                aria-selected={batchFilter === batch.id}
                data-testid={`batch-filter-${batch.id}`}
                onClick={() => chooseBatch(batch.id)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold",
                  batchFilter === batch.id
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-700 hover:bg-slate-50"
                )}
              >
                <span className="truncate pr-3">{batch.name}</span>
                {batchFilter === batch.id && <Check size={17} className="shrink-0" />}
              </button>
            ))}

            {filteredBatches.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-500">
                No batches found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const StudentsToolbar = ({ month, onShiftMonth, batches, batchFilter, onBatchFilter, query, onQuery, statusFilter, onStatusFilter }) => (
  <>
    <div className="inline-flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
      <button data-testid="stu-month-prev" onClick={() => onShiftMonth(-1)} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronLeft size={18} /></button>
      <div className="px-3 font-semibold text-slate-900 min-w-[140px] text-center">{monthLabel(month)}</div>
      <button data-testid="stu-month-next" onClick={() => onShiftMonth(1)} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronRight size={18} /></button>
    </div>

    <BatchSelector
      batches={batches}
      batchFilter={batchFilter}
      onBatchFilter={onBatchFilter}
    />

    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input data-testid="student-search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search students..." className="h-12 pl-11 rounded-xl text-base" />
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
