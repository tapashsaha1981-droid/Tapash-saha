import React, { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import dayjs from "dayjs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  { value: "due", label: "Payment Due", color: "bg-rose-500" },
  { value: "received", label: "Payment Received", color: "bg-emerald-500" },
  { value: "class", label: "Class / Batch", color: "bg-indigo-500" },
  { value: "note", label: "Reminder", color: "bg-amber-500" },
];
const colorFor = (t) => EVENT_TYPES.find((x) => x.value === t)?.color || "bg-slate-400";

export const CalendarPage = () => {
  const { events, payments, addEvent, removeEvent } = useData();
  const [cursor, setCursor] = useState(dayjs());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("note");

  const start = cursor.startOf("month").startOf("week");
  const end = cursor.endOf("month").endOf("week");
  const days = [];
  let d = start;
  while (d.isBefore(end) || d.isSame(end, "day")) { days.push(d); d = d.add(1, "day"); }

  const paymentEvents = useMemo(() => payments.map((p) => ({
    id: `p-${p.id}`, date: p.payment_date, title: `Payment ${p.amount}`, type: "received",
  })), [payments]);

  const allEvents = useMemo(() => [...events, ...paymentEvents], [events, paymentEvents]);

  const evsFor = (date) => allEvents.filter((e) => e.date === date);

  const openAdd = (date) => {
    setSelectedDate(date);
    setTitle("");
    setType("note");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!title.trim()) return;
    await addEvent({ date: selectedDate, title: title.trim(), type });
    setDialogOpen(false);
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
          {days.map((day) => {
            const inMonth = day.month() === cursor.month();
            const isToday = day.isSame(dayjs(), "day");
            const key = day.format("YYYY-MM-DD");
            const evs = evsFor(key);
            return (
              <button
                key={key}
                data-testid={`cal-day-${key}`}
                onClick={() => openAdd(key)}
                className={cn(
                  "text-left rounded-xl p-2 min-h-[70px] sm:min-h-[90px] border transition-colors",
                  inMonth ? "bg-white hover:bg-slate-50 border-slate-100" : "bg-slate-50/50 text-slate-400 border-transparent",
                  isToday && "ring-2 ring-indigo-500"
                )}
              >
                <div className={cn("text-sm font-bold", isToday && "text-indigo-600")}>{day.date()}</div>
                <div className="mt-1 space-y-0.5">
                  {evs.slice(0, 2).map((e) => (
                    <div key={e.id} className={cn("truncate text-[10px] px-1.5 py-0.5 rounded-md text-white font-semibold", colorFor(e.type))}>
                      {e.title}
                    </div>
                  ))}
                  {evs.length > 2 && <div className="text-[10px] text-slate-500 font-semibold">+{evs.length - 2} more</div>}
                </div>
              </button>
            );
          })}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Event · {selectedDate && dayjs(selectedDate).format("MMM D, YYYY")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input data-testid="event-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Class · Reminder · Note" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="event-save" className="bg-indigo-600 hover:bg-indigo-700"><Plus size={14} /> Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
