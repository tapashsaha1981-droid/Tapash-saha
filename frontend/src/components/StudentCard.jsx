import React, { useMemo } from "react";
import { Phone } from "lucide-react";
import dayjs from "dayjs";
import { StatusBadge } from "@/components/StatusBadge";
import { inr, openWhatsApp, currentMonth, monthLabel } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { useData } from "@/lib/store";
import { toast } from "sonner";

const ActionBtn = ({ onClick, icon, label, tint, testid }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={cn(
      "btn-press inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold",
      tint || "bg-slate-100 text-slate-700 hover:bg-slate-200"
    )}
  >
    <span aria-hidden>{icon}</span> {label}
  </button>
);

const AVATAR_BY_STATUS = {
  paid: "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200",
  partial: "bg-amber-100 text-amber-700 ring-2 ring-amber-200",
  unpaid: "bg-rose-100 text-rose-600 ring-2 ring-rose-200",
};

const ACCENT_BY_STATUS = {
  paid: "border-t-4 border-t-emerald-400",
  partial: "border-t-4 border-t-amber-400",
  unpaid: "border-t-4 border-t-rose-400",
};

export const StudentCard = ({
  student: s,
  stats: st,
  batch,
  onEdit,
  onMarkPaid,
  onMarkUnpaid,
  onRemind,
  onPaymentConfirmation,
  onMove,
  onHistory,
  onDelete,
}) => {
  const { payments = [] } = useData();
  const initial = s.name.charAt(0).toUpperCase();

  const remaining = Math.max(0, st.fee - st.paidThisMonth);
  const unpaid = st.status !== "paid";

  // Normally show current + previous month.
  // If ANY month is pending, show every month from join month to current month.
  const paymentRows = useMemo(() => {
    const fee = Number(s.monthly_fee) || 0;
    const endMonth = currentMonth();
    const startMonth = s.join_month || endMonth;

    const start = dayjs(`${startMonth}-01`);
    const end = dayjs(`${endMonth}-01`);

    if (fee <= 0 || start.isAfter(end)) return [];

    const rows = [];
    const studentPayments = payments.filter(
      (p) => p.student_id === s.id
    );

    let cursor = start;

    while (cursor.isBefore(end) || cursor.isSame(end, "month")) {
      const key = cursor.format("YYYY-MM");

      const paid = studentPayments.reduce(
        (sum, p) =>
          p.month === key ? sum + (Number(p.amount) || 0) : sum,
        0
      );

      const pending = Math.max(0, fee - paid);

      rows.push({
        month: key,
        label: monthLabel(key),
        paid,
        pending,
      });

      cursor = cursor.add(1, "month");
    }

    return rows;
  }, [payments, s.id, s.monthly_fee, s.join_month]);

  const hasAnyPending = paymentRows.some((row) => row.pending > 0);

  const displayedPaymentRows = hasAnyPending
    ? paymentRows
    : paymentRows.slice(-2);

  const totalPending = paymentRows.reduce(
    (sum, row) => sum + row.pending,
    0
  );

  const totalBalance = Math.max(
    0,
    Number(st.totalDue || 0) - Number(st.totalPaid || 0)
  );

  const handleJoinGroup = () => {
    const groupLink = batch?.whatsapp_group_link?.trim();
    const phone = s.phone?.trim();

    if (!groupLink) {
      toast.error("Please add the WhatsApp Group Link in this batch first");
      return;
    }

    if (!phone) {
      toast.error("No student phone number is saved");
      return;
    }

    openWhatsApp(
      phone,
      `Hello ${s.name}, welcome to ${batch.name}.

Please join our class WhatsApp group using this link:

${groupLink}

Thank you.
TAPASH SIR`
    );
  };

  return (
    <div
      data-testid={`student-card-${s.id}`}
      className={cn(
        "rounded-3xl bg-white p-5 soft-shadow card-hover",
        ACCENT_BY_STATUS[st.status]
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-12 w-12 rounded-full font-bold flex items-center justify-center shrink-0",
            AVATAR_BY_STATUS[st.status]
          )}
        >
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-slate-900">{s.name}</div>

          <a
            href={`tel:${s.phone}`}
            className="text-sm text-slate-500 inline-flex items-center gap-1 hover:text-indigo-600"
          >
            <Phone size={12} />
            {s.phone || "—"}
          </a>

          {batch && (
            <div className="text-xs text-slate-400 mt-0.5">
              {batch.name}
            </div>
          )}
        </div>

        <StatusBadge status={st.status} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2">
          <div className="text-[11px] text-slate-500">
            Total ({st.elapsed}m)
          </div>
          <div className="font-bold text-slate-900">
            {inr(st.totalDue)}
          </div>
        </div>

        <div className="rounded-xl bg-emerald-50 p-2">
          <div className="text-[11px] text-emerald-700">
            Already Paid
          </div>
          <div className="font-bold text-emerald-700">
            {inr(st.totalPaid)}
          </div>
        </div>

        <div className="rounded-xl bg-rose-50 p-2">
          <div className="text-[11px] text-rose-700">
            To Be Paid
          </div>
          <div className="font-bold text-rose-700">
            {inr(remaining)}
          </div>
        </div>
      </div>

      {displayedPaymentRows.length > 0 && (
        <div className="mt-4">
          <div className="font-bold text-slate-800 mb-2">
            Recent Payments
          </div>

          <div className="grid grid-cols-2 gap-2">
            {displayedPaymentRows.map((row) => (
              <div
                key={row.month}
                className={cn(
                  "rounded-xl p-2.5 border",
                  row.pending > 0
                    ? "bg-rose-50 border-rose-100"
                    : "bg-emerald-50 border-emerald-100"
                )}
              >
                <div className="text-[11px] text-slate-600 truncate">
                  {row.label}
                </div>

                <div
                  className={cn(
                    "text-xs font-semibold mt-1",
                    row.pending > 0
                      ? "text-rose-600"
                      : "text-emerald-700"
                  )}
                >
                  {row.pending > 0 ? "● Pending" : "● Paid"}
                </div>

                <div
                  className={cn(
                    "font-bold mt-0.5",
                    row.pending > 0
                      ? "text-rose-600"
                      : "text-emerald-700"
                  )}
                >
                  {inr(row.pending > 0 ? row.pending : row.paid)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-slate-600">
              Total Pending{" "}
              <b className="text-rose-600">
                {inr(totalPending)}
              </b>
            </span>

            <span className="text-slate-600">
              Total Balance{" "}
              <b className="text-blue-600">
                {inr(totalBalance)}
              </b>
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionBtn
          testid={`edit-${s.id}`}
          onClick={onEdit}
          icon="✏️"
          label="Edit"
        />

        {unpaid && (
          <ActionBtn
            testid={`mark-paid-${s.id}`}
            onClick={onMarkPaid}
            icon="✅"
            label="Mark Paid"
            tint="bg-emerald-600 text-white hover:bg-emerald-700"
          />
        )}

        {!unpaid && (
          <ActionBtn
            testid={`mark-unpaid-${s.id}`}
            onClick={onMarkUnpaid}
            icon="↩️"
            label="Mark Unpaid"
            tint="bg-rose-600 text-white hover:bg-rose-700"
          />
        )}

        <ActionBtn
          testid={`remind-${s.id}`}
          onClick={onRemind}
          icon="💬"
          label="Remind"
        />

        <ActionBtn
          testid={`payment-confirmation-${s.id}`}
          onClick={onPaymentConfirmation}
          icon="💰"
          label="Payment Confirmation"
          tint="bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        />

        <ActionBtn
          testid={`join-group-${s.id}`}
          onClick={handleJoinGroup}
          icon="👥"
          label="Group"
          tint="bg-green-50 text-green-700 hover:bg-green-100"
        />

        {unpaid && (
          <ActionBtn
            testid={`move-${s.id}`}
            onClick={onMove}
            icon="⇄"
            label="Move"
          />
        )}

        <ActionBtn
          testid={`history-${s.id}`}
          onClick={onHistory}
          icon="📄"
          label="History"
        />

        <ActionBtn
          testid={`delete-${s.id}`}
          onClick={onDelete}
          icon="🗑️"
          label="Delete"
          tint="bg-rose-50 text-rose-600 hover:bg-rose-100"
        />
      </div>
    </div>
  );
};
