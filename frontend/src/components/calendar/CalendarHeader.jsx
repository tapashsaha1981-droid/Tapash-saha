import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EVENT_TYPES } from "@/components/calendar/EventDialog";
import { cn } from "@/lib/utils";

export const CalendarHeader = ({ cursor, onPrev, onNext, onToday }) => (
  <>
    <div className="flex flex-wrap items-center gap-3">
      <div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Calendar</h2>
        <p className="text-slate-500 mt-1">Payments, classes and reminders</p>
      </div>
      <div className="ml-auto inline-flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
        <button data-testid="cal-prev" onClick={onPrev} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronLeft size={18} /></button>
        <div className="px-3 font-semibold text-slate-900 min-w-[140px] text-center">{cursor.format("MMMM YYYY")}</div>
        <button data-testid="cal-next" onClick={onNext} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronRight size={18} /></button>
        <button data-testid="cal-today" onClick={onToday} className="btn-press px-3 h-9 rounded-xl text-sm font-semibold hover:bg-slate-100">Today</button>
      </div>
    </div>
    <div className="flex flex-wrap gap-3 text-sm">
      {EVENT_TYPES.map((t) => (
        <div key={t.value} className="inline-flex items-center gap-2 bg-white rounded-full px-3 py-1 border border-slate-200">
          <span className={cn("h-2.5 w-2.5 rounded-full", t.color)} /> {t.label}
        </div>
      ))}
    </div>
  </>
);
