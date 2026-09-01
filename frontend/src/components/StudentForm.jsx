import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";

export const StudentForm = ({ open, onClose, initial, batches, defaultBatchId, onSave }) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [batchId, setBatchId] = useState("");
  const [fee, setFee] = useState("");
  const [parent, setParent] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setPhone(initial?.phone || "");
      setBatchId(initial?.batch_id || defaultBatchId || (batches[0]?.id ?? ""));
      setFee(initial?.monthly_fee ? String(initial.monthly_fee) : "");
      setParent(initial?.parent_name || "");
      setNotes(initial?.notes || "");
    }
  }, [open, initial, defaultBatchId, batches]);

  useEffect(() => {
    // Auto-fill fee from batch if empty
    if (!fee && batchId) {
      const b = batches.find((x) => x.id === batchId);
      if (b?.monthly_fee) setFee(String(b.monthly_fee));
    }
    // eslint-disable-next-line
  }, [batchId]);

  const submit = async () => {
    if (!name.trim()) return toast.error("Student name is required");
    if (!batchId) return toast.error("Please select a batch");
    await onSave({
      name: name.trim(),
      phone: phone.trim(),
      batch_id: batchId,
      monthly_fee: Number(fee) || 0,
      parent_name: parent.trim(),
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Student" : "Add Student"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Student Name</Label>
            <Input data-testid="student-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sejati" />
          </div>
          <div>
            <Label>Phone Number</Label>
            <Input data-testid="student-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
          </div>
          <div>
            <Label>Batch</Label>
            <Select value={batchId} onValueChange={setBatchId}>
              <SelectTrigger data-testid="student-batch-select"><SelectValue placeholder="Select batch" /></SelectTrigger>
              <SelectContent>
                {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monthly Fee (₹)</Label>
            <Input data-testid="student-fee-input" type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div>
            <Label>Parent / Guardian Name (optional)</Label>
            <Input data-testid="student-parent-input" value={parent} onChange={(e) => setParent(e.target.value)} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea data-testid="student-notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
