// Business logic calculations for TAPASH SIR
import dayjs from "dayjs";

export const monthKey = (d) => dayjs(d).format("YYYY-MM");

export const monthLabel = (m) =>
  dayjs(m + "-01").format("MMMM YYYY");

export const shiftMonth = (m, delta) =>
  dayjs(m + "-01")
    .add(delta, "month")
    .format("YYYY-MM");

export const currentMonth = () =>
  dayjs().format("YYYY-MM");

// How many months elapsed between join_month and month (inclusive)
export const monthsElapsed = (joinMonth, upto) => {
  if (!joinMonth) return 1;

  const a = dayjs(joinMonth + "-01");
  const b = dayjs(upto + "-01");

  const d = b.diff(a, "month") + 1;

  return Math.max(1, d);
};

export const inr = (n) =>
  "₹" +
  Math.round(n || 0).toLocaleString("en-IN");

// Payment status per month
export const monthStatus = (fee, paidThisMonth) => {
  if (paidThisMonth >= fee && fee > 0) {
    return "paid";
  }

  if (paidThisMonth > 0) {
    return "partial";
  }

  return "unpaid";
};

// Aggregate student stats for a given month.
//
// Optimized:
// Process the student's payments only once instead of
// reducing the entire array and then filtering it again.
export const studentMonthStats = (
  student,
  studentPayments,
  month
) => {
  const fee = student.monthly_fee || 0;

  const elapsed = monthsElapsed(
    student.join_month || month,
    month
  );

  const totalDue = fee * elapsed;

  let totalPaid = 0;
  let paidThisMonth = 0;

  for (const p of studentPayments) {
    const amount = p.amount || 0;

    totalPaid += amount;

    if (p.month === month) {
      paidThisMonth += amount;
    }
  }

  const outstanding = Math.max(
    0,
    totalDue - totalPaid
  );

  const status = monthStatus(
    fee,
    paidThisMonth
  );

  return {
    fee,
    elapsed,
    totalDue,
    totalPaid,
    paidThisMonth,
    outstanding,
    status,
  };
};

// Index payments by student_id once:
// O(P) instead of repeated O(S × P) searches.
export const indexPayments = (payments) => {
  const map = new Map();

  for (const p of payments) {
    const arr = map.get(p.student_id);

    if (arr) {
      arr.push(p);
    } else {
      map.set(p.student_id, [p]);
    }
  }

  return map;
};

const EMPTY_ARR = [];

export const paysFor = (
  index,
  studentId
) => index.get(studentId) || EMPTY_ARR;

// Dashboard stats for a month
export const dashboardStats = (
  students,
  batches,
  paymentsIndex,
  month
) => {
  let paid = 0;
  let partial = 0;
  let unpaid = 0;
  let collected = 0;
  let pending = 0;

  const activeStudents = students.filter(
    (s) =>
      (s.join_month || month) <= month
  );

  for (const s of activeStudents) {
    const st = studentMonthStats(
      s,
      paysFor(paymentsIndex, s.id),
      month
    );

    if (st.status === "paid") {
      paid++;
    } else if (st.status === "partial") {
      partial++;
    } else {
      unpaid++;
    }

    collected += st.paidThisMonth;

    pending += Math.max(
      0,
      st.fee - st.paidThisMonth
    );
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
export const lifetimeOverdue = (
  students,
  paymentsIndex,
  upto
) => {
  const rows = students.map((s) => {
    const st = studentMonthStats(
      s,
      paysFor(paymentsIndex, s.id),
      upto
    );

    return {
      student: s,
      overdue: st.outstanding,
    };
  });

  rows.sort(
    (a, b) => b.overdue - a.overdue
  );

  return rows;
};

// Filter students by batch and free-text query
export const filterStudents = (
  students,
  batches,
  { batchFilter, query }
) => {
  let filtered = students;

  if (batchFilter !== "all") {
    filtered = filtered.filter(
      (s) => s.batch_id === batchFilter
    );
  }

  const q = (query || "")
    .trim()
    .toLowerCase();

  if (!q) {
    return filtered;
  }

  // Build batch lookup once instead of calling
  // batches.find() for every student.
  const batchNameById = new Map(
    batches.map((b) => [b.id, b.name])
  );

  return filtered.filter((s) => {
    const batchName =
      batchNameById.get(s.batch_id) || "";

    return (
      s.name.toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      batchName.toLowerCase().includes(q)
    );
  });
};

export const reminderMessage = (
  student,
  amount,
  month,
  orgName = "TAPASH SIR"
) =>
  `Hello ${student.name}, this is a reminder from ${orgName} regarding the tuition fee of ${inr(amount)} for ${monthLabel(month)}. Please make the payment at your convenience. Thank you.`;

export const paymentConfirmationMessage = (
  student,
  amount,
  month,
  orgName = "TAPASH SIR"
) =>
  `Hello ${student.name}, payment of ${inr(amount)} for ${monthLabel(month)} tuition fee has been received successfully. Thank you. — ${orgName}`;

// Normalise to international format;
// Indian 10-digit numbers get +91
export const normalizePhone = (phone) => {
  let d = (phone || "").replace(/\D/g, "");

  if (d.startsWith("00")) {
    d = d.slice(2);
  }

  if (
    d.length === 11 &&
    d.startsWith("0")
  ) {
    d = d.slice(1);
  }

  if (d.length === 10) {
    d = "91" + d;
  }

  return d;
};

export const openWhatsApp = (
  phone,
  message
) => {
  const num = normalizePhone(phone);

  window.location.href =
    `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
};
