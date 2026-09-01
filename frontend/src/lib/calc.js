// Business logic calculations for TAPASH SIR
import dayjs from "dayjs";

export const monthKey = (d) => dayjs(d).format("YYYY-MM");
export const monthLabel = (m) => dayjs(m + "-01").format("MMMM YYYY");
export const shiftMonth = (m, delta) => dayjs(m + "-01").add(delta, "month").format("YYYY-MM");
export const currentMonth = () => dayjs().format("YYYY-MM");

// how many months elapsed between join_month and month (inclusive)
export const monthsElapsed = (joinMonth, upto) => {
  if (!joinMonth) return 1;
  const a = dayjs(joinMonth + "-01");
  const b = dayjs(upto + "-01");
  const d = b.diff(a, "month") + 1;
  return Math.max(1, d);
};

export const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

// Payment status per month
export const monthStatus = (fee, paidThisMonth) => {
  if (paidThisMonth >= fee && fee > 0) return "paid";
  if (paidThisMonth > 0) return "partial";
  return "unpaid";
};

// Aggregate student stats for a given month view
export const studentMonthStats = (student, payments, month) => {
  const fee = student.monthly_fee || 0;
  const elapsed = monthsElapsed(student.join_month || month, month);
  const totalDue = fee * elapsed;
  const studentPayments = payments.filter((p) => p.student_id === student.id);
  const totalPaid = studentPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const paidThisMonth = studentPayments
    .filter((p) => p.month === month)
    .reduce((s, p) => s + (p.amount || 0), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);
  const status = monthStatus(fee, paidThisMonth);
  return { fee, elapsed, totalDue, totalPaid, paidThisMonth, outstanding, status };
};

// Dashboard stats for a month
export const dashboardStats = (students, batches, payments, month) => {
  let paid = 0, partial = 0, unpaid = 0, collected = 0, pending = 0;
  const activeStudents = students.filter((s) => (s.join_month || month) <= month);
  for (const s of activeStudents) {
    const st = studentMonthStats(s, payments, month);
    if (st.status === "paid") paid++;
    else if (st.status === "partial") partial++;
    else unpaid++;
    collected += st.paidThisMonth;
    pending += Math.max(0, st.fee - st.paidThisMonth);
  }
  return {
    students: activeStudents.length,
    batches: batches.length,
    collected,
    pending,
    paid,
    partial,
    unpaid,
  };
};

// Lifetime overdue for each student
export const lifetimeOverdue = (students, payments, upto) => {
  const rows = students.map((s) => {
    const st = studentMonthStats(s, payments, upto);
    return { student: s, overdue: st.outstanding };
  });
  rows.sort((a, b) => b.overdue - a.overdue);
  return rows;
};

// Filter students by batch and free-text query (name / phone / batch name)
export const filterStudents = (students, batches, { batchFilter, query }) => {
  let filtered = students;
  if (batchFilter !== "all") filtered = filtered.filter((s) => s.batch_id === batchFilter);
  const q = (query || "").trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((s) => {
      const b = batches.find((b) => b.id === s.batch_id);
      return s.name.toLowerCase().includes(q) || (s.phone || "").includes(q) || (b?.name || "").toLowerCase().includes(q);
    });
  }
  return filtered;
};

export const reminderMessage = (student, amount, month) =>
  `Hello ${student.name}, this is a reminder regarding the tuition fee of ${inr(amount)} for ${monthLabel(month)}. Please make the payment at your convenience. Thank you.`;

export const openWhatsApp = (phone, message) => {
  window.open(`https://wa.me/${(phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
};
