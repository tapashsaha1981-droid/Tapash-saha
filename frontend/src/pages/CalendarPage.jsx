import React, { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import dayjs from "dayjs";
import { DayCell } from "@/components/calendar/DayCell";
import { EventDialog, EVENT_TYPES, colorFor } from "@/components/calendar/EventDialog";
import { cn } from "@/lib/utils";

const buildMonthDays = (cursor) => {
  const start = cursor.startOf("month").startOf("week");
  const end = cursor.endOf("month").endOf("week");
  const days = [];
  let d = start;
  while (d.isBefore(end) || d.isSame(end, "day")) { days.push(d); d = d.add(1, "day"); }
  return days;
};

export const CalendarPage = () => {
  const { events, payments, addEvent, removeEvent } = useData();
  const [cursor, setCursor] = useState(dayjs());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const days = buildMonthDays(cursor);

  const paymentEvents = useMemo(() => payments.map((p) => ({
    id: `p-${p.id}`, date: p.payment_date, title: `Payment ${p.amount}`, type: "received",
  })), [payments]);

  const allEvents = useMemo(() => [...events, ...paymentEvents], [events, paymentEvents]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of allEvents) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [allEvents]);

  const evsFor = (date) => eventsByDate[date] || [];

  const openAdd = (date) => {
    setSelectedDate(date);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5" data-testid="calendar-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Calendar</h2>
          <p className="text-slate-500 mt-1">Payments, classes and reminders</p>
        </div>
        <div className="ml-auto inline-flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1">
          <button data-testid="cal-prev" onClick={() => setCursor(cursor.subtract(1, "month"))} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronLeft size={18} /></button>
          <div className="px-3 font-semibold text-slate-900 min-w-[140px] text-center">{cursor.format("MMMM YYYY")}</div>
          <button data-testid="cal-next" onClick={() => setCursor(cursor.add(1, "month"))} className="btn-press h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"><ChevronRight size={18} /></button>
          <button data-testid="cal-today" onClick={() => setCursor(dayjs())} className="btn-press px-3 h-9 rounded-xl text-sm font-semibold hover:bg-slate-100">Today</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-sm">
        {EVENT_TYPES.map((t) => (
          <div key={t.value} className="inline-flex items-center gap-2 bg-white rounded-full px-3 py-1 border border-slate-200">
            <span className={cn("h-2.5 w-2.5 rounded-full", t.color)} /> {t.label}
          </div>
        ))}
      </div>

      <div className="rounded-3xl bg-white soft-shadow p-3 sm:p-5 overflow-hidden">
        <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500 tracking-wider py-2">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map((day) => (
            <DayCell
              key={day.format("YYYY-MM-DD")}
              day={day}
              inMonth={day.month() === cursor.month()}
              isToday={day.isSame(dayjs(), "day")}
              events={evsFor(day.format("YYYY-MM-DD"))}
              colorFor={colorFor}
              onSelect={openAdd}
            />
          ))}
        </div>
      </div>

      {/* Events for selected day */}
      {selectedDate && !dialogOpen && (
        <div className="rounded-3xl bg-white p-5 soft-shadow">
          <div className="font-bold">{dayjs(selectedDate).format("dddd, MMM D")}</div>
          <div className="mt-2 space-y-2">
            {evsFor(selectedDate).map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", colorFor(e.type))} />
                <span className="font-semibold text-slate-800 flex-1">{e.title}</span>
                {!e.id.startsWith("p-") && (
                  <button onClick={() => removeEvent(e.id)} className="text-slate-400 hover:text-rose-600"><X size={14} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        date={selectedDate}
        onSave={addEvent}
      />
    </div>
  );
};
