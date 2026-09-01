import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const MoveStudentModal = ({ open, onClose, student, batches, onMove }) => {
  const [target, setTarget] = useState("");
  useEffect(() => { if (open) setTarget(""); }, [open]);
  const current = batches.find((b) => b.id === student?.batch_id);
  const otherBatches = useMemo(() => batches.filter((b) => b.id !== student?.batch_id), [batches, student]);

  const submit = async () => {
    if (!target || target === student.batch_id) return toast.error("Choose a different batch");
    await onMove(student.id, target);
    toast.success("Student moved");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Move {student?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Current Batch</Label>
            <div className="rounded-xl bg-slate-100 px-3 py-2 font-semibold">{current?.name || "—"}</div>
          </div>
          <div>
            <Label>New Batch</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger data-testid="move-target-select"><SelectValue placeholder="Choose new batch" /></SelectTrigger>
              <SelectContent>
                {otherBatches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-slate-500">Historical payment records will remain intact.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-indigo-600 hover:bg-indigo-700" data-testid="move-confirm">Move</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
