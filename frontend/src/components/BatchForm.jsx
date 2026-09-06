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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const BatchForm = ({
  open,
  onClose,
  initial,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [classTime, setClassTime] = useState("");
  const [fee, setFee] = useState("");
  const [whatsappGroupLink, setWhatsappGroupLink] =
    useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setSubject(initial?.subject || "");
      setClassTime(initial?.class_time || "");
      setFee(
        initial?.monthly_fee
          ? String(initial.monthly_fee)
          : ""
      );
      setWhatsappGroupLink(
        initial?.whatsapp_group_link || ""
      );
    }
  }, [open, initial]);

  const submit = async () => {
    if (!name.trim()) {
      return toast.error(
        "Batch name is required"
      );
    }

    await onSave({
      name: name.trim(),
      subject: subject.trim(),
      class_time: classTime.trim(),
      monthly_fee: Number(fee) || 0,
      whatsapp_group_link:
        whatsappGroupLink.trim(),
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
        "
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {initial
              ? "Edit Batch"
              : "Add Batch"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Batch Name */}
          <div>
            <Label>Batch Name</Label>

            <Input
              data-testid="batch-name-input"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              placeholder="e.g. CLASS 10 EVENING"
              className="mt-1.5"
            />
          </div>


          {/* Subject */}
          <div>
            <Label>Subject</Label>

            <Input
              data-testid="batch-subject-input"
              value={subject}
              onChange={(e) =>
                setSubject(e.target.value)
              }
              placeholder="e.g. Math"
              className="mt-1.5"
            />
          </div>


          {/* Class / Time */}
          <div>
            <Label>Class / Time</Label>

            <Input
              data-testid="batch-time-input"
              value={classTime}
              onChange={(e) =>
                setClassTime(e.target.value)
              }
              placeholder="e.g. 6:30 PM"
              className="mt-1.5"
            />
          </div>


          {/* Monthly Fee */}
          <div>
            <Label>Monthly Fee (₹)</Label>

            <Input
              data-testid="batch-fee-input"
              type="number"
              min="0"
              value={fee}
              onChange={(e) =>
                setFee(e.target.value)
              }
              placeholder="700"
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
              One group link for all students in this batch
            </p>

            <Input
              data-testid="batch-whatsapp-group-input"
              type="url"
              value={whatsappGroupLink}
              onChange={(e) =>
                setWhatsappGroupLink(
                  e.target.value
                )
              }
              placeholder="https://chat.whatsapp.com/..."
              className="mt-1.5"
            />
          </div>

        </div>


        <DialogFooter className="mt-5">
          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="batch-cancel"
          >
            Cancel
          </Button>

          <Button
            onClick={submit}
            data-testid="batch-save"
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Save Batch
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};
