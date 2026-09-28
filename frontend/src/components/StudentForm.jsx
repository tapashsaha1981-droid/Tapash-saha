import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import dayjs from "dayjs";

const EMPTY_FORM = {
  name: "",
  phone: "",
  parent_phone: "",
  batch_id: "",
  board: "",
  admission_date: "",
  monthly_fee: "",
  join_month: "",
  parent_name: "",
  notes: "",
};

const formFromStudent = (s) => ({
  name: s.name || "",
  phone: s.phone || "",
  parent_phone: s.parent_phone || "",
  batch_id: s.batch_id || "",
  board: s.board || "",
  admission_date: s.admission_date || "",
  monthly_fee: s.monthly_fee
    ? String(s.monthly_fee)
    : "",
  join_month: s.join_month || "",
  parent_name: s.parent_name || "",
  notes: s.notes || "",
});

export const StudentForm = ({
  open,
  onClose,
  initial,
  batches,
  defaultBatchId,
  onSave,
}) => {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;

    if (initial) {
      setForm(formFromStudent(initial));
    } else {
      const today = dayjs();

      setForm({
        ...EMPTY_FORM,
        batch_id:
          defaultBatchId ||
          batches[0]?.id ||
          "",
        board: "",
        join_month:
          today.format("YYYY-MM"),
        admission_date:
          today.format("YYYY-MM-DD"),
      });
    }
  }, [
    open,
    initial,
    defaultBatchId,
    batches,
  ]);

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.value,
    }));

  const onBatchChange = (batchId) => {
    const batch = batches.find(
      (x) => x.id === batchId
    );

    setForm((f) => ({
      ...f,
      batch_id: batchId,
      monthly_fee:
        f.monthly_fee ||
        (batch?.monthly_fee
          ? String(batch.monthly_fee)
          : ""),
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      return toast.error(
        "Student name is required"
      );
    }

    if (!form.phone.trim()) {
      return toast.error(
        "Student phone number is required"
      );
    }

    if (!form.batch_id) {
      return toast.error(
        "Please select a batch"
      );
    }

    if (!form.board) {
      return toast.error(
        "Please select CBSE or TBSE"
      );
    }

    if (!form.join_month) {
      return toast.error(
        "Join month is required"
      );
    }

    await onSave({
      name: form.name.trim(),
      phone: form.phone.trim(),
      parent_phone:
        form.parent_phone.trim(),
      batch_id: form.batch_id,
      board: form.board,
      admission_date:
        form.admission_date.trim(),
      monthly_fee:
        Number(form.monthly_fee) || 0,
      join_month: form.join_month,
      parent_name:
        form.parent_name.trim(),
      notes: form.notes.trim(),
    });

    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
    >
      <DialogContent
        className="rounded-2xl max-h-[92vh] overflow-hidden p-0 sm:max-w-xl"
        aria-describedby={undefined}
      >
        <div className="border-b bg-muted/30 px-5 py-4 sm:px-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tight">
              {initial ? "Edit Student" : "Add Student"}
            </DialogTitle>

            <p className="mt-1 text-xs text-muted-foreground">
              {initial
                ? "Update the student's details below."
                : "Enter the student's details to create a new record."}
            </p>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(92vh-145px)] overflow-y-auto px-5 py-4 sm:px-6">
          <div className="space-y-5">

            <section className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">
                  Student & Contact
                </h3>

                <p className="text-xs text-muted-foreground">
                  Basic student and communication details
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                <div className="sm:col-span-2">
                  <Label
                    htmlFor="student-name"
                    className="text-xs font-medium"
                  >
                    Student Name
                  </Label>

                  <Input
                    id="student-name"
                    data-testid="student-name-input"
                    value={form.name}
                    onChange={set("name")}
                    placeholder="e.g. Sejati"
                    className="mt-1 h-10"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="student-phone"
                    className="text-xs font-medium"
                  >
                    Student Phone
                  </Label>

                  <Input
                    id="student-phone"
                    data-testid="student-phone-input"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="9876543210"
                    className="mt-1 h-10"
                  />

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    WhatsApp / class updates
                  </p>
                </div>

                <div>
                  <Label
                    htmlFor="student-parent-phone"
                    className="text-xs font-medium"
                  >
                    Parent Phone
                  </Label>

                  <Input
                    id="student-parent-phone"
                    data-testid="student-parent-phone-input"
                    type="tel"
                    value={form.parent_phone}
                    onChange={set("parent_phone")}
                    placeholder="9876543210"
                    className="mt-1 h-10"
                  />

                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Payment reminders
                  </p>
                </div>

              </div>
            </section>

            <section className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">
                  Academic Details
                </h3>

                <p className="text-xs text-muted-foreground">
                  Batch and board used for class separation
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                <div>
                  <Label className="text-xs font-medium">
                    Batch
                  </Label>

                  <Select
                    value={form.batch_id}
                    onValueChange={onBatchChange}
                  >
                    <SelectTrigger
                      data-testid="student-batch-select"
                      className="mt-1 h-10"
                    >
                      <SelectValue placeholder="Select batch" />
                    </SelectTrigger>

                    <SelectContent>
                      {batches.map((b) => (
                        <SelectItem
                          key={b.id}
                          value={b.id}
                        >
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium">
                    Board
                  </Label>

                  <Select
                    value={form.board}
                    onValueChange={(board) =>
                      setForm((f) => ({
                        ...f,
                        board,
                      }))
                    }
                  >
                    <SelectTrigger
                      data-testid="student-board-select"
                      className="mt-1 h-10"
                    >
                      <SelectValue placeholder="Select board" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="CBSE">
                        CBSE
                      </SelectItem>

                      <SelectItem value="TBSE">
                        TBSE
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </div>
            </section>

            <section className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">
                  Fee & Admission
                </h3>

                <p className="text-xs text-muted-foreground">
                  Dates and monthly fee used for fee calculation
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

                <div>
                  <Label
                    htmlFor="student-fee"
                    className="text-xs font-medium"
                  >
                    Monthly Fee (₹)
                  </Label>

                  <Input
                    id="student-fee"
                    data-testid="student-fee-input"
                    type="number"
                    min="0"
                    value={form.monthly_fee}
                    onChange={set("monthly_fee")}
                    placeholder="700"
                    className="mt-1 h-10"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="student-join-month"
                    className="text-xs font-medium"
                  >
                    Join Month
                  </Label>

                  <Input
                    id="student-join-month"
                    data-testid="student-join-month-input"
                    type="month"
                    value={form.join_month}
                    onChange={set("join_month")}
                    className="mt-1 h-10"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="student-admission-date"
                    className="text-xs font-medium"
                  >
                    Admission Date
                  </Label>

                  <Input
                    id="student-admission-date"
                    data-testid="student-admission-date-input"
                    type="date"
                    value={form.admission_date}
                    onChange={set("admission_date")}
                    className="mt-1 h-10"
                  />
                </div>

              </div>
            </section>

            <section className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">
                  Additional Information
                </h3>

                <p className="text-xs text-muted-foreground">
                  Optional details
                </p>
              </div>

              <div className="space-y-3">

                <div>
                  <Label
                    htmlFor="student-parent"
                    className="text-xs font-medium"
                  >
                    Parent / Guardian Name

                    <span className="ml-1 font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>

                  <Input
                    id="student-parent"
                    data-testid="student-parent-input"
                    value={form.parent_name}
                    onChange={set("parent_name")}
                    placeholder="Parent / Guardian name"
                    className="mt-1 h-10"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="student-notes"
                    className="text-xs font-medium"
                  >
                    Notes

                    <span className="ml-1 font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>

                  <Textarea
                    id="student-notes"
                    data-testid="student-notes-input"
                    value={form.notes}
                    onChange={set("notes")}
                    placeholder="Any additional information..."
                    rows={2}
                    className="mt-1 resize-none"
                  />
                </div>

              </div>
            </section>

          </div>
        </div>

        <DialogFooter className="border-t bg-background px-5 py-3 sm:px-6">

          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="student-cancel"
            className="h-10"
          >
            Cancel
          </Button>

          <Button
            onClick={submit}
            data-testid="student-save"
            className="h-10 bg-indigo-600 px-6 hover:bg-indigo-700"
          >
            {initial ? "Save Student" : "Add Student"}
          </Button>

        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};
