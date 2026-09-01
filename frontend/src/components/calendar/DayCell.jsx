import React from "react";
import { cn } from "@/lib/utils";

export const DayCell = ({ day, inMonth, isToday, events, colorFor, onSelect }) => {
  const key = day.format("YYYY-MM-DD");
  return (
    <button
      data-testid={`cal-day-${key}`}
      onClick={() => onSelect(key)}
      className={cn(
        "text-left rounded-xl p-2 min-h-[70px] sm:min-h-[90px] border transition-colors",
        inMonth ? "bg-white hover:bg-slate-50 border-slate-100" : "bg-slate-50/50 text-slate-400 border-transparent",
        isToday && "ring-2 ring-indigo-500"
      )}
    >
      <div className={cn("text-sm font-bold", isToday && "text-indigo-600")}>{day.date()}</div>
      <div className="mt-1 space-y-0.5">
        {events.slice(0, 2).map((e) => (
          <div key={e.id} className={cn("truncate text-[10px] px-1.5 py-0.5 rounded-md text-white font-semibold", colorFor(e.type))}>
            {e.title}
          </div>
        ))}
        {events.length > 2 && <div className="text-[10px] text-slate-500 font-semibold">+{events.length - 2} more</div>}
      </div>
    </button>
  );
};
