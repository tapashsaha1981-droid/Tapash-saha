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
  admission_date: "",
  monthly_fee: "",
  join_month: "",
  parent_name: "",
  whatsapp_group_link: "",
  notes: "",
};

const formFromStudent = (s) => ({
  name: s.name || "",
  phone: s.phone || "",
  parent_phone: s.parent_phone || "",
  batch_id: s.batch_id || "",
  admission_date: s.admission_date || "",
  monthly_fee: s.monthly_fee
    ? String(s.monthly_fee)
    : "",
  join_month: s.join_month || "",
  parent_name: s.parent_name || "",
  whatsapp_group_link: s.whatsapp_group_link || "",
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
        join_month: today.format("YYYY-MM"),
        admission_date: today.format("YYYY-MM-DD"),
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

    if (!form.batch_id) {
      return toast.error(
        "Please select a batch"
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
      parent_phone: form.parent_phone.trim(),
      batch_id: form.batch_id,
      admission_date:
        form.admission_date.trim(),
      monthly_fee:
        Number(form.monthly_fee) || 0,
      join_month: form.join_month,
      parent_name:
        form.parent_name.trim(),
      whatsapp_group_link:
        form.whatsapp_group_link.trim(),
      notes: form.notes.trim(),
    });

    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) =>
        !v && onClose()
      }
    >
      <DialogContent
        className="
          rounded-2xl
          max-h-[90vh]
          overflow-y-auto
          sm:max-w-lg
        "
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {initial
              ? "Edit Student"
              : "Add Student"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Student Name */}
          <div>
            <Label>
              Student Name
            </Label>

            <Input
              data-testid="student-name-input"
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. Sejati"
              className="mt-1.5"
            />
          </div>


          {/* Student Phone */}
          <div>
            <Label>
              Student's Phone Number
            </Label>

            <p className="text-xs text-muted-foreground mt-1">
              For WhatsApp Group / Class Updates
            </p>

            <Input
              data-testid="student-phone-input"
              type="tel"
              value={form.phone}
              onChange={set("phone")}
              placeholder="9876543210"
              className="mt-1.5"
            />
          </div>


          {/* Parent Phone */}
          <div>
            <Label>
              Parent's Phone Number
            </Label>

            <p className="text-xs text-muted-foreground mt-1">
              For Payment Reminders
            </p>

            <Input
              data-testid="student-parent-phone-input"
              type="tel"
              value={form.parent_phone}
              onChange={set("parent_phone")}
              placeholder="9876543210"
              className="mt-1.5"
            />
          </div>


          {/* Batch */}
          <div>
            <Label>
              Batch
            </Label>

            <Select
              value={form.batch_id}
              onValueChange={onBatchChange}
            >
              <SelectTrigger
                data-testid="student-batch-select"
                className="mt-1.5"
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


          {/* Admission Date */}
          <div>
            <Label>
              Admission Date
            </Label>

            <Input
              data-testid="student-admission-date-input"
              type="date"
              value={form.admission_date}
              onChange={set("admission_date")}
              className="mt-1.5"
            />
          </div>


          {/* Monthly Fee */}
          <div>
            <Label>
              Monthly Fee (₹)
            </Label>

            <Input
              data-testid="student-fee-input"
              type="number"
              min="0"
              value={form.monthly_fee}
              onChange={set("monthly_fee")}
              placeholder="700"
              className="mt-1.5"
            />
          </div>


          {/* Join Month */}
          <div>
            <Label>
              Join Month
            </Label>

            <p className="text-xs text-muted-foreground mt-1">
              Used for fee calculation
            </p>

            <Input
              data-testid="student-join-month-input"
              type="month"
              value={form.join_month}
              onChange={set("join_month")}
              className="mt-1.5"
            />
          </div>


          {/* Parent / Guardian Name */}
          <div>
            <Label>
              Parent / Guardian Name
              <span className="text-muted-foreground font-normal">
                {" "} (optional)
              </span>
            </Label>

            <Input
              data-testid="student-parent-input"
              value={form.parent_name}
              onChange={set("parent_name")}
              placeholder="Parent / Guardian name"
              className="mt-1.5"
            />
          </div>


          {/* WhatsApp Group Link */}
          <div>
            <Label>
              WhatsApp Group Link
              <span className="text-muted-foreground font-normal">
                {" "} (optional)
              </span>
            </Label>

            <p className="text-xs text-muted-foreground mt-1">
              Used to invite the student to the class WhatsApp group
            </p>

            <Input
              data-testid="student-whatsapp-group-input"
              type="url"
              value={form.whatsapp_group_link}
              onChange={set("whatsapp_group_link")}
              placeholder="https://chat.whatsapp.com/..."
              className="mt-1.5"
            />
          </div>


          {/* Notes */}
          <div>
            <Label>
              Notes
              <span className="text-muted-foreground font-normal">
                {" "} (optional)
              </span>
            </Label>

            <Textarea
              data-testid="student-notes-input"
              value={form.notes}
              onChange={set("notes")}
              placeholder="Any additional information..."
              rows={3}
              className="mt-1.5"
            />
          </div>

        </div>


        <DialogFooter className="mt-5">
          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="student-cancel"
          >
            Cancel
          </Button>

          <Button
            onClick={submit}
            data-testid="student-save"
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {initial
              ? "Save Student"
              : "Add Student"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};
