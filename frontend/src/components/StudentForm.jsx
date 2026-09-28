import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialForm = {
  name: "",
  phone: "",
  parent_phone: "",
  parent_name: "",
  batch_id: "",
  board: "",
  monthly_fee: "",
  join_month: "",
  admission_date: "",
  notes: "",
};

export default function StudentForm({
  open,
  onClose,
  onSave,
  initial,
  batches = [],
}) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (initial) {
      setForm({
        ...initialForm,
        ...initial,
        monthly_fee:
          initial.monthly_fee !== undefined && initial.monthly_fee !== null
            ? String(initial.monthly_fee)
            : "",
        join_month: initial.join_month || "",
        admission_date: initial.admission_date || "",
      });
    } else {
      setForm(initialForm);
    }
  }, [initial, open]);

  const set = (field) => (e) => {
    setForm((f) => ({
      ...f,
      [field]: e.target.value,
    }));
  };

  const onBatchChange = (batch_id) => {
    setForm((f) => ({
      ...f,
      batch_id,
    }));
  };

  const submit = () => {
    onSave(form);
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

            {/* STUDENT & CONTACT */}
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

            {/* ACADEMIC DETAILS */}
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

            {/* FEE & ADMISSION */}
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

            {/* ADDITIONAL INFORMATION */}
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

        {/* STICKY ACTIONS */}
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
}
