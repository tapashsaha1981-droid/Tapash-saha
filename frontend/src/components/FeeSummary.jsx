import React from "react";
import { monthLabel, inr } from "@/lib/calc";

export const FeeSummary = ({ student, month, fee, paidThisMonth, remaining }) => (
  <div className="rounded-xl bg-indigo-50 p-4">
    <div className="font-bold text-slate-900">{student?.name}</div>
    <div className="text-sm text-slate-600">{monthLabel(month)}</div>
    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
      <div className="rounded-lg bg-white p-2">
        <div className="text-[11px] text-slate-500">Fee</div>
        <div className="font-bold">{inr(fee)}</div>
      </div>
      <div className="rounded-lg bg-white p-2">
        <div className="text-[11px] text-slate-500">Paid</div>
        <div className="font-bold text-emerald-600">{inr(paidThisMonth)}</div>
      </div>
      <div className="rounded-lg bg-white p-2">
        <div className="text-[11px] text-slate-500">Remaining</div>
        <div className="font-bold text-rose-600">{inr(remaining)}</div>
      </div>
    </div>
  </div>
);
