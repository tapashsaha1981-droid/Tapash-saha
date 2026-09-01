import React from "react";

export const PaymentOverview = ({ paid, partial, unpaid }) => {
  const total = Math.max(1, paid + partial + unpaid);
  return (
    <div className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow">
      <div className="text-xs font-bold text-slate-500 tracking-wider">PAYMENT OVERVIEW</div>
      <div className="mt-4 flex flex-wrap gap-4">
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /> <span className="font-bold" data-testid="ov-paid">{paid}</span> Paid</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" /> <span className="font-bold" data-testid="ov-partial">{partial}</span> Partial</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" /> <span className="font-bold" data-testid="ov-unpaid">{unpaid}</span> Unpaid</div>
      </div>
      <div className="mt-4 h-3 w-full rounded-full overflow-hidden bg-slate-100 flex">
        <div className="bg-emerald-500 h-full" style={{ width: `${(paid / total) * 100}%` }} />
        <div className="bg-amber-400 h-full" style={{ width: `${(partial / total) * 100}%` }} />
        <div className="bg-rose-500 h-full" style={{ width: `${(unpaid / total) * 100}%` }} />
      </div>
    </div>
  );
};
