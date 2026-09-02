import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";

const EMPTY_FORM = { name: "", phone: "", batch_id: "", monthly_fee: "", parent_name: "", notes: "" };

const formFromStudent = (s) => ({
  name: s.name || "",
  phone: s.phone || "",
  batch_id: s.batch_id || "",
  monthly_fee: s.monthly_fee ? String(s.monthly_fee) : "",
  parent_name: s.parent_name || "",
  notes: s.notes || "",
});

export const StudentForm = ({ open, onClose, initial, batches, defaultBatchId, onSave }) => {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? formFromStudent(initial) : { ...EMPTY_FORM, batch_id: defaultBatchId || batches[0]?.id || "" });
  }, [open, initial, defaultBatchId, batches, setForm]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onBatchChange = (batchId) => {
    const batch = batches.find((x) => x.id === batchId);
    setForm((f) => ({
      ...f,
      batch_id: batchId,
      monthly_fee: f.monthly_fee || (batch?.monthly_fee ? String(batch.monthly_fee) : ""),
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Student name is required");
    if (!form.batch_id) return toast.error("Please select a batch");
    await onSave({
      name: form.name.trim(),
      phone: form.phone.trim(),
      batch_id: form.batch_id,
      monthly_fee: Number(form.monthly_fee) || 0,
      parent_name: form.parent_name.trim(),
      notes: form.notes.trim(),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Student" : "Add Student"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Student Name</Label>
            <Input data-testid="student-name-input" value={form.name} onChange={set("name")} placeholder="e.g. Sejati" />
          </div>
          <div>
            <Label>Phone Number</Label>
            <Input data-testid="student-phone-input" value={form.phone} onChange={set("phone")} placeholder="9876543210" />
          </div>
          <div>
            <Label>Batch</Label>
            <Select value={form.batch_id} onValueChange={onBatchChange}>
              <SelectTrigger data-testid="student-batch-select"><SelectValue placeholder="Select batch" /></SelectTrigger>
              <SelectContent>
                {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monthly Fee (₹)</Label>
            <Input data-testid="student-fee-input" type="number" value={form.monthly_fee} onChange={set("monthly_fee")} />
          </div>
          <div>
            <Label>Parent / Guardian Name (optional)</Label>
            <Input data-testid="student-parent-input" value={form.parent_name} onChange={set("parent_name")} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea data-testid="student-notes-input" value={form.notes} onChange={set("notes")} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="student-cancel">Cancel</Button>
          <Button onClick={submit} data-testid="student-save" className="bg-indigo-600 hover:bg-indigo-700">Save Student</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
