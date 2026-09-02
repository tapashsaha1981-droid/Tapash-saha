import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus } from "lucide-react";

export const EVENT_TYPES = [
  { value: "due", label: "Payment Due", color: "bg-rose-500" },
  { value: "received", label: "Payment Received", color: "bg-emerald-500" },
  { value: "class", label: "Class / Batch", color: "bg-indigo-500" },
  { value: "note", label: "Reminder", color: "bg-amber-500" },
];

export const colorFor = (t) => EVENT_TYPES.find((x) => x.value === t)?.color || "bg-slate-400";

export const EventDialog = ({ open, onClose, date, onSave }) => {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("note");

  useEffect(() => {
    if (open) {
      setTitle("");
      setType("note");
    }
  }, [open]);

  const save = async () => {
    if (!title.trim()) return;
    await onSave({ date, title: title.trim(), type });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add Event · {date && dayjs(date).format("MMM D, YYYY")}</DialogTitle>
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
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} data-testid="event-save" className="bg-indigo-600 hover:bg-indigo-700"><Plus size={14} /> Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
