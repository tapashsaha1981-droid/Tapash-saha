import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const OrganisationCard = ({ value, onSave }) => {
  const [name, setName] = useState(value || "TAPASH SIR");

  useEffect(() => { setName(value || "TAPASH SIR"); }, [value, setName]);

  const save = async () => {
    await onSave({ org_name: name.trim() || "TAPASH SIR" });
    toast.success("Organisation name saved");
  };

  return (
    <div className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold text-slate-900 text-base sm:text-lg">🏫 Organisation Name</div>
        <button data-testid="save-org-name" onClick={save} className="btn-press px-4 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 font-semibold text-sm hover:bg-indigo-100">Save</button>
      </div>
      <p className="text-sm text-slate-500 mt-1">This name appears in WhatsApp messages sent to students and parents.</p>
      <Input
        data-testid="org-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-3 rounded-xl"
        placeholder="TAPASH SIR"
      />
    </div>
  );
};

export const AutoAdvanceCard = ({ value, onSave, onPreview }) => {
  const [day, setDay] = useState(value ? String(value) : "");

  useEffect(() => { setDay(value ? String(value) : ""); }, [value, setDay]);

  const save = async () => {
    const d = Number(day);
    if (!Number.isInteger(d) || d < 1 || d > 28) return toast.error("Enter a day between 1 and 28");
    await onSave({ auto_advance_day: d });
    toast.success("Auto month advance saved");
  };

  return (
    <div className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold text-slate-900 text-base sm:text-lg">⚙️ Auto Month Advance</div>
        <button data-testid="save-auto-advance" onClick={save} className="btn-press px-4 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 font-semibold text-sm hover:bg-indigo-100">Save</button>
      </div>
      <p className="text-sm text-slate-500 mt-1">On this day of each month, Students tab will auto-advance to the new month and prompt you.</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-700">Day of month:</span>
        <Input
          data-testid="auto-advance-day-input"
          type="number"
          min={1}
          max={28}
          value={day}
          onChange={(e) => setDay(e.target.value)}
          placeholder="e.g. 1"
          className="w-28 rounded-xl"
        />
      </div>
      <button
        data-testid="monthly-preview-btn"
        onClick={onPreview}
        className="btn-press mt-4 w-full rounded-xl bg-indigo-50 text-indigo-600 font-semibold py-2.5 hover:bg-indigo-100"
      >
        📊 Monthly Preview
      </button>
    </div>
  );
};
