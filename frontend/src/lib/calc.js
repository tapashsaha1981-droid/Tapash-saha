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

// Aggregate student stats for a given month view.
// Pass the student's OWN payments (use indexPayments + paysFor for speed).
export const studentMonthStats = (student, studentPayments, month) => {
  const fee = student.monthly_fee || 0;
  const elapsed = monthsElapsed(student.join_month || month, month);
  const totalDue = fee * elapsed;
  const totalPaid = studentPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const paidThisMonth = studentPayments
    .filter((p) => p.month === month)
    .reduce((s, p) => s + (p.amount || 0), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);
  const status = monthStatus(fee, paidThisMonth);
  return { fee, elapsed, totalDue, totalPaid, paidThisMonth, outstanding, status };
};

// Index payments by student_id once: O(P) instead of O(S x P) lookups
export const indexPayments = (payments) => {
  const map = new Map();
  for (const p of payments) {
    const arr = map.get(p.student_id);
    if (arr) arr.push(p);
    else map.set(p.student_id, [p]);
  }
  return map;
};

const EMPTY_ARR = [];
export const paysFor = (index, studentId) => index.get(studentId) || EMPTY_ARR;

// Dashboard stats for a month (pass paymentsIndex from indexPayments)
export const dashboardStats = (students, batches, paymentsIndex, month) => {
  let paid = 0, partial = 0, unpaid = 0, collected = 0, pending = 0;
  const activeStudents = students.filter((s) => (s.join_month || month) <= month);
  for (const s of activeStudents) {
    const st = studentMonthStats(s, paysFor(paymentsIndex, s.id), month);
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

// Lifetime overdue for each student (pass paymentsIndex from indexPayments)
export const lifetimeOverdue = (students, paymentsIndex, upto) => {
  const rows = students.map((s) => {
    const st = studentMonthStats(s, paysFor(paymentsIndex, s.id), upto);
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

export const reminderMessage = (student, amount, month, orgName = "TAPASH SIR") =>
  `Hello ${student.name}, this is a reminder from ${orgName} regarding the tuition fee of ${inr(amount)} for ${monthLabel(month)}. Please make the payment at your convenience. Thank you.`;

export const paymentConfirmationMessage = (student, amount, month, orgName = "TAPASH SIR") =>
  `Hello ${student.name}, payment of ${inr(amount)} for ${monthLabel(month)} tuition fee has been received successfully. Thank you. — ${orgName}`;

// Normalise to international format; Indian 10-digit numbers get +91
export const normalizePhone = (phone) => {
  let d = (phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d;
};

export const openWhatsApp = (phone, message) => {
  const num = normalizePhone(phone);
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
};
