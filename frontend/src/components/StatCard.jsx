import React from "react";

export const StatCard = ({ emoji, value, label, tint, valueCls = "text-slate-900", testid }) => (
  <div data-testid={testid} className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow card-hover border border-slate-100">
    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-2xl mb-3 ${tint}`}>{emoji}</div>
    <div className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${valueCls}`}>{value}</div>
    <div className="text-sm text-slate-500 font-medium mt-1">{label}</div>
  </div>
);
