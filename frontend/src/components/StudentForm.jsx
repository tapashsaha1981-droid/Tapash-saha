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
      onOpenChange={(v) =>
        !v && onClose()
      }
    >
      <DialogContent
        className="
          flex
          h-[94vh]
          max-h-[94vh]
          w-[calc(100%-1rem)]
          max-w-2xl
          flex-col
          overflow-hidden
          rounded-3xl
          border-0
          bg-slate-50
          p-0
          shadow-2xl
          sm:w-full
        "
        aria-describedby={undefined}
      >

        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <div
          className="
            shrink-0
            border-b
            border-indigo-100
            bg-gradient-to-r
            from-indigo-600
            via-violet-600
            to-blue-600
            px-5
            py-5
            text-white
            sm:px-7
          "
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">

              <div className="flex items-center gap-3">

                <div
                  className="
                    flex
                    h-11
                    w-11
                    shrink-0
                    items-center
                    justify-center
                    rounded-2xl
                    bg-white/20
                    text-2xl
                    shadow-inner
                    backdrop-blur-sm
                  "
                >
                  🎓
                </div>

                <div>
                  <DialogTitle
                    className="
                      text-xl
                      font-bold
                      tracking-tight
                      text-white
                      sm:text-2xl
                    "
                  >
                    {initial
                      ? "Edit Student"
                      : "Add Student"}
                  </DialogTitle>

                  <p
                    className="
                      mt-1
                      text-xs
                      leading-relaxed
                      text-indigo-100
                      sm:text-sm
                    "
                  >
                    {initial
                      ? "Update the student's details below."
                      : "Enter the student's details to create a new record."}
                  </p>
                </div>

              </div>

            </div>
          </DialogHeader>
        </div>


        {/* ===================================================== */}
        {/* SCROLLABLE FORM AREA */}
        {/* ===================================================== */}

        <div
          className="
            min-h-0
            flex-1
            overflow-y-auto
            overscroll-contain
            px-4
            py-4
            sm:px-6
            sm:py-5
          "
        >

          <div className="space-y-4">


            {/* ================================================= */}
            {/* STUDENT & CONTACT */}
            {/* ================================================= */}

            <section
              className="
                overflow-hidden
                rounded-2xl
                border
                border-blue-100
                bg-white
                shadow-sm
              "
            >

              <div
                className="
                  border-b
                  border-blue-100
                  bg-gradient-to-r
                  from-blue-50
                  to-cyan-50
                  px-4
                  py-3
                  sm:px-5
                "
              >
                <div className="flex items-center gap-3">

                  <div
                    className="
                      flex
                      h-9
                      w-9
                      items-center
                      justify-center
                      rounded-xl
                      bg-blue-100
                      text-lg
                    "
                  >
                    👤
                  </div>

                  <div>
                    <h3
                      className="
                        text-sm
                        font-bold
                        text-slate-800
                        sm:text-base
                      "
                    >
                      Student & Contact
                    </h3>

                    <p
                      className="
                        text-[11px]
                        text-slate-500
                        sm:text-xs
                      "
                    >
                      Basic student and communication details
                    </p>
                  </div>

                </div>
              </div>


              <div className="p-4 sm:p-5">

                <div
                  className="
                    grid
                    grid-cols-1
                    gap-4
                    sm:grid-cols-2
                  "
                >

                  {/* Student Name */}
                  <div className="sm:col-span-2">

                    <Label
                      htmlFor="student-name"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >
                      Student Name
                    </Label>

                    <Input
                      id="student-name"
                      data-testid="student-name-input"
                      value={form.name}
                      onChange={set("name")}
                      placeholder="e.g. Sejati"
                      className="
                        mt-1.5
                        h-11
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                        transition
                        focus:bg-white
                        focus:ring-2
                        focus:ring-blue-200
                      "
                    />

                  </div>


                  {/* Student Phone */}
                  <div>

                    <Label
                      htmlFor="student-phone"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
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
                      className="
                        mt-1.5
                        h-11
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                        transition
                        focus:bg-white
                        focus:ring-2
                        focus:ring-blue-200
                      "
                    />

                    <p
                      className="
                        mt-1
                        text-[11px]
                        text-slate-500
                      "
                    >
                      WhatsApp / class updates
                    </p>

                  </div>


                  {/* Parent Phone */}
                  <div>

                    <Label
                      htmlFor="student-parent-phone"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
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
                      className="
                        mt-1.5
                        h-11
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                        transition
                        focus:bg-white
                        focus:ring-2
                        focus:ring-blue-200
                      "
                    />

                    <p
                      className="
                        mt-1
                        text-[11px]
                        text-slate-500
                      "
                    >
                      Payment reminders
                    </p>

                  </div>

                </div>

              </div>
            </section>


            {/* ================================================= */}
            {/* ACADEMIC DETAILS */}
            {/* ================================================= */}

            <section
              className="
                overflow-hidden
                rounded-2xl
                border
                border-violet-100
                bg-white
                shadow-sm
              "
            >

              <div
                className="
                  border-b
                  border-violet-100
                  bg-gradient-to-r
                  from-violet-50
                  to-purple-50
                  px-4
                  py-3
                  sm:px-5
                "
              >

                <div className="flex items-center gap-3">

                  <div
                    className="
                      flex
                      h-9
                      w-9
                      items-center
                      justify-center
                      rounded-xl
                      bg-violet-100
                      text-lg
                    "
                  >
                    📚
                  </div>

                  <div>

                    <h3
                      className="
                        text-sm
                        font-bold
                        text-slate-800
                        sm:text-base
                      "
                    >
                      Academic Details
                    </h3>

                    <p
                      className="
                        text-[11px]
                        text-slate-500
                        sm:text-xs
                      "
                    >
                      Batch and board used for class separation
                    </p>

                  </div>

                </div>

              </div>


              <div className="p-4 sm:p-5">

                <div
                  className="
                    grid
                    grid-cols-1
                    gap-4
                    sm:grid-cols-2
                  "
                >

                  {/* Batch */}
                  <div>

                    <Label
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >
                      Batch
                    </Label>

                    <Select
                      value={form.batch_id}
                      onValueChange={onBatchChange}
                    >

                      <SelectTrigger
                        data-testid="student-batch-select"
                        className="
                          mt-1.5
                          h-11
                          rounded-xl
                          border-slate-200
                          bg-slate-50
                        "
                      >
                        <SelectValue
                          placeholder="Select batch"
                        />
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


                  {/* Board */}
                  <div>

                    <Label
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >
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
                        className="
                          mt-1.5
                          h-11
                          rounded-xl
                          border-slate-200
                          bg-slate-50
                        "
                      >
                        <SelectValue
                          placeholder="Select board"
                        />
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

                    <p
                      className="
                        mt-1
                        text-[11px]
                        text-slate-500
                      "
                    >
                      Used for EduNotes Pro class separation
                    </p>

                  </div>

                </div>

              </div>
            </section>


            {/* ================================================= */}
            {/* FEE & ADMISSION */}
            {/* ================================================= */}

            <section
              className="
                overflow-hidden
                rounded-2xl
                border
                border-emerald-100
                bg-white
                shadow-sm
              "
            >

              <div
                className="
                  border-b
                  border-emerald-100
                  bg-gradient-to-r
                  from-emerald-50
                  to-teal-50
                  px-4
                  py-3
                  sm:px-5
                "
              >

                <div className="flex items-center gap-3">

                  <div
                    className="
                      flex
                      h-9
                      w-9
                      items-center
                      justify-center
                      rounded-xl
                      bg-emerald-100
                      text-lg
                    "
                  >
                    💰
                  </div>

                  <div>

                    <h3
                      className="
                        text-sm
                        font-bold
                        text-slate-800
                        sm:text-base
                      "
                    >
                      Fee & Admission
                    </h3>

                    <p
                      className="
                        text-[11px]
                        text-slate-500
                        sm:text-xs
                      "
                    >
                      Dates and monthly fee used for fee calculation
                    </p>

                  </div>

                </div>

              </div>


              <div className="p-4 sm:p-5">

                <div
                  className="
                    grid
                    grid-cols-1
                    gap-4
                    sm:grid-cols-3
                  "
                >

                  {/* Monthly Fee */}
                  <div>

                    <Label
                      htmlFor="student-fee"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
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
                      className="
                        mt-1.5
                        h-11
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                      "
                    />

                  </div>


                  {/* Join Month */}
                  <div>

                    <Label
                      htmlFor="student-join-month"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >
                      Join Month
                    </Label>

                    <Input
                      id="student-join-month"
                      data-testid="student-join-month-input"
                      type="month"
                      value={form.join_month}
                      onChange={set("join_month")}
                      className="
                        mt-1.5
                        h-11
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                      "
                    />

                    <p
                      className="
                        mt-1
                        text-[11px]
                        text-slate-500
                      "
                    >
                      Used for fee calculation
                    </p>

                  </div>


                  {/* Admission Date */}
                  <div>

                    <Label
                      htmlFor="student-admission-date"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >
                      Admission Date
                    </Label>

                    <Input
                      id="student-admission-date"
                      data-testid="student-admission-date-input"
                      type="date"
                      value={form.admission_date}
                      onChange={set("admission_date")}
                      className="
                        mt-1.5
                        h-11
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                      "
                    />

                  </div>

                </div>

              </div>
            </section>


            {/* ================================================= */}
            {/* ADDITIONAL INFORMATION */}
            {/* ================================================= */}

            <section
              className="
                overflow-hidden
                rounded-2xl
                border
                border-amber-100
                bg-white
                shadow-sm
              "
            >

              <div
                className="
                  border-b
                  border-amber-100
                  bg-gradient-to-r
                  from-amber-50
                  to-orange-50
                  px-4
                  py-3
                  sm:px-5
                "
              >

                <div className="flex items-center gap-3">

                  <div
                    className="
                      flex
                      h-9
                      w-9
                      items-center
                      justify-center
                      rounded-xl
                      bg-amber-100
                      text-lg
                    "
                  >
                    📝
                  </div>

                  <div>

                    <h3
                      className="
                        text-sm
                        font-bold
                        text-slate-800
                        sm:text-base
                      "
                    >
                      Additional Information
                    </h3>

                    <p
                      className="
                        text-[11px]
                        text-slate-500
                        sm:text-xs
                      "
                    >
                      Optional details
                    </p>

                  </div>

                </div>

              </div>


              <div className="p-4 sm:p-5">

                <div className="space-y-4">

                  {/* Parent / Guardian */}
                  <div>

                    <Label
                      htmlFor="student-parent"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >
                      Parent / Guardian Name

                      <span
                        className="
                          ml-1
                          font-normal
                          text-slate-400
                        "
                      >
                        (optional)
                      </span>
                    </Label>

                    <Input
                      id="student-parent"
                      data-testid="student-parent-input"
                      value={form.parent_name}
                      onChange={set("parent_name")}
                      placeholder="Parent / Guardian name"
                      className="
                        mt-1.5
                        h-11
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                      "
                    />

                  </div>


                  {/* Notes */}
                  <div>

                    <Label
                      htmlFor="student-notes"
                      className="
                        text-xs
                        font-semibold
                        text-slate-700
                      "
                    >
                      Notes

                      <span
                        className="
                          ml-1
                          font-normal
                          text-slate-400
                        "
                      >
                        (optional)
                      </span>
                    </Label>

                    <Textarea
                      id="student-notes"
                      data-testid="student-notes-input"
                      value={form.notes}
                      onChange={set("notes")}
                      placeholder="Any additional information..."
                      rows={3}
                      className="
                        mt-1.5
                        resize-none
                        rounded-xl
                        border-slate-200
                        bg-slate-50
                      "
                    />

                  </div>

                </div>

              </div>
            </section>


            {/* Bottom spacing so last card never touches footer */}
            <div className="h-2" />

          </div>

        </div>


        {/* ===================================================== */}
        {/* FIXED / ALWAYS VISIBLE FOOTER */}
        {/* ===================================================== */}

        <DialogFooter
          className="
            shrink-0
            border-t
            border-slate-200
            bg-white
            px-4
            py-3
            shadow-[0_-4px_12px_rgba(15,23,42,0.06)]
            sm:px-6
            sm:py-4
          "
        >

          <div
            className="
              flex
              w-full
              flex-col-reverse
              gap-2
              sm:flex-row
              sm:justify-end
            "
          >

            <Button
              variant="ghost"
              onClick={onClose}
              data-testid="student-cancel"
              className="
                h-11
                w-full
                rounded-xl
                text-slate-600
                hover:bg-slate-100
                sm:w-auto
                sm:px-6
              "
            >
              Cancel
            </Button>


            <Button
              onClick={submit}
              data-testid="student-save"
              className="
                h-11
                w-full
                rounded-xl
                bg-gradient-to-r
                from-indigo-600
                to-violet-600
                px-7
                font-semibold
                text-white
                shadow-md
                transition-all
                hover:from-indigo-700
                hover:to-violet-700
                hover:shadow-lg
                active:scale-[0.98]
                sm:w-auto
              "
            >
              {initial
                ? "✓ Save Student"
                : "+ Add Student"}
            </Button>

          </div>

        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};
