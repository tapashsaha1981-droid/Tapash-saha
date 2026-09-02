import React from "react";
import { StudentForm } from "@/components/StudentForm";
import { PaymentModal } from "@/components/PaymentModal";
import { PaymentHistoryModal } from "@/components/PaymentHistoryModal";
import { MoveStudentModal } from "@/components/MoveStudentModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export const StudentModals = ({
  formOpen, editing, batches, batchFilter, onCloseForm, onSaveStudent,
  payFor, onClosePay, onConfirmPayment,
  historyFor, payments, onCloseHistory, onHistoryMarkPaid,
  moveFor, onCloseMove, onMove,
  toDelete, onCloseDelete, onDelete,
}) => (
  <>
    <StudentForm
      open={formOpen}
      onClose={onCloseForm}
      initial={editing}
      batches={batches}
      defaultBatchId={batchFilter !== "all" ? batchFilter : undefined}
      onSave={onSaveStudent}
    />
    {payFor && (
      <PaymentModal
        open={!!payFor}
        onClose={onClosePay}
        student={payFor.s}
        month={payFor.month}
        paidThisMonth={payFor.paidThisMonth}
        fee={payFor.fee}
        onSave={onConfirmPayment}
      />
    )}
    {historyFor && (
      <PaymentHistoryModal
        open={!!historyFor}
        onClose={onCloseHistory}
        student={historyFor}
        payments={payments}
        onMarkPaid={onHistoryMarkPaid}
      />
    )}
    {moveFor && (
      <MoveStudentModal
        open={!!moveFor}
        onClose={onCloseMove}
        student={moveFor}
        batches={batches}
        onMove={onMove}
      />
    )}
    <ConfirmDialog
      open={!!toDelete}
      onClose={onCloseDelete}
      title="Delete this student?"
      description="This student and their associated payment records will be removed. This can be undone."
      confirmLabel="Delete"
      danger
      onConfirm={onDelete}
    />
  </>
);
