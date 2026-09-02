import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { monthLabel, inr } from "@/lib/calc";
import { toast } from "sonner";
import dayjs from "dayjs";

const today = () => dayjs().format("YYYY-MM-DD");

export const PaymentModal = ({ open, onClose, student, month, paidThisMonth, fee, onSave }) => {
  const remaining = Math.max(0, fee - paidThisMonth);
  const [amount, setAmount] = useState(remaining);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(remaining);
      setNote("");
      setDate(today());
      setSaving(false);
    }
  }, [open, remaining]);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a positive amount");
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        student_id: student.id,
        month,
        amount: amt,
        fee_snapshot: fee,
        note,
        payment_date: date,
      });
      toast.success(`Payment of ${inr(amt)} recorded`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-indigo-50 p-4">
            <div className="font-bold text-slate-900">{student?.name}</div>
            <div className="text-sm text-slate-600">{monthLabel(month)}</div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="rounded-lg bg-white p-2">
                <div className="text-[11px] text-slate-500">Fee</div>
                <div className="font-bold">{inr(fee)}</div>
              </div>
              <div className="rounded-lg bg-white p-2">
                <div className="text-[11px] text-slate-500">Paid</div>
                <div className="font-bold text-emerald-600">{inr(paidThisMonth)}</div>
              </div>
              <div className="rounded-lg bg-white p-2">
                <div className="text-[11px] text-slate-500">Remaining</div>
                <div className="font-bold text-rose-600">{inr(remaining)}</div>
              </div>
            </div>
          </div>
          <div>
            <Label>Amount (₹)</Label>
            <Input data-testid="payment-amount-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setAmount(remaining)} data-testid="pay-full">Full</Button>
              <Button variant="outline" size="sm" onClick={() => setAmount(Math.round(remaining / 2))}>Half</Button>
            </div>
          </div>
          <div>
            <Label>Payment Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="payment-date-input" />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="payment-note-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving} data-testid="payment-cancel">Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="payment-save">{saving ? "Saving…" : "Save Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
