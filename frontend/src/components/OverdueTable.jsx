import React from "react";
import { Phone } from "lucide-react";
import { inr } from "@/lib/calc";

export const OverdueTable = ({ rows, visibleRows, limit, onShowMore, onRowClick }) => (
  <div className="rounded-3xl bg-white soft-shadow overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 bg-slate-50">
            <th className="px-5 py-3 font-semibold">Student Name</th>
            <th className="px-5 py-3 font-semibold">Phone</th>
            <th className="px-5 py-3 font-semibold text-right">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r.student.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onRowClick(r.student)} data-testid={`overdue-row-${r.student.id}`}>
              <td className="px-5 py-3 font-semibold text-slate-900">{r.student.name}</td>
              <td className="px-5 py-3 text-slate-600">
                <a href={`tel:${r.student.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-indigo-600"><Phone size={12} /> {r.student.phone || "—"}</a>
              </td>
              <td className="px-5 py-3 text-right font-extrabold text-rose-600">{inr(r.overdue)}</td>
            </tr>
          ))}
          {visibleRows.length === 0 && (
            <tr><td colSpan={3} className="text-center py-8 text-slate-500">Nothing overdue. Excellent!</td></tr>
          )}
        </tbody>
      </table>
      {rows.length > limit && (
        <button
          data-testid="show-more-overview"
          onClick={onShowMore}
          className="btn-press w-full py-3 font-semibold text-slate-600 hover:bg-slate-50 border-t border-slate-100"
        >
          Show more ({rows.length - limit} remaining)
        </button>
      )}
    </div>
  </div>
);
