import React, { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { X } from "lucide-react";
import dayjs from "dayjs";
import { DayCell } from "@/components/calendar/DayCell";
import { EventDialog, colorFor } from "@/components/calendar/EventDialog";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
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
      <CalendarHeader
        cursor={cursor}
        onPrev={() => setCursor(cursor.subtract(1, "month"))}
        onNext={() => setCursor(cursor.add(1, "month"))}
        onToday={() => setCursor(dayjs())}
      />

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
                  <button data-testid={`delete-event-${e.id}`} aria-label="Delete event" onClick={() => removeEvent(e.id)} className="text-slate-400 hover:text-rose-600"><X size={14} /></button>
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
