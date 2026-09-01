import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const BatchForm = ({ open, onClose, initial, onSave }) => {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [classTime, setClassTime] = useState("");
  const [fee, setFee] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setSubject(initial?.subject || "");
      setClassTime(initial?.class_time || "");
      setFee(initial?.monthly_fee ? String(initial.monthly_fee) : "");
    }
  }, [open, initial]);

  const submit = async () => {
    if (!name.trim()) return toast.error("Batch name is required");
    await onSave({
      name: name.trim(),
      subject: subject.trim(),
      class_time: classTime.trim(),
      monthly_fee: Number(fee) || 0,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Batch" : "Add Batch"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Batch Name</Label>
            <Input data-testid="batch-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CLASS 10 EVENING" />
          </div>
          <div>
            <Label>Subject</Label>
            <Input data-testid="batch-subject-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Math" />
          </div>
          <div>
            <Label>Class / Time</Label>
            <Input data-testid="batch-time-input" value={classTime} onChange={(e) => setClassTime(e.target.value)} placeholder="e.g. 6:30 PM" />
          </div>
          <div>
            <Label>Monthly Fee (₹)</Label>
            <Input data-testid="batch-fee-input" type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="700" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="batch-cancel">Cancel</Button>
          <Button onClick={submit} data-testid="batch-save" className="bg-indigo-600 hover:bg-indigo-700">Save Batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
