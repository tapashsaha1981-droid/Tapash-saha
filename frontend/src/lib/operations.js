import { useCallback, useMemo } from "react";
import { api } from "./api";

// CRUD operations wrapped with undo/redo recording.
export const useOperations = ({ batches, students, payments, refresh, record, clearStacks }) => {
  const addBatch = useCallback(async (data) => {
    const created = await api.createBatch(data);
    const liveId = { id: created.id };
    record({
      label: "Add batch",
      undo: async () => { await api.deleteBatch(liveId.id); },
      redo: async () => { const recreated = await api.createBatch({ ...data }); liveId.id = recreated.id; },
    });
    await refresh();
    return created;
  }, [record, refresh]);

  const editBatch = useCallback(async (id, data) => {
    const before = batches.find((b) => b.id === id);
    await api.updateBatch(id, data);
    record({
      label: "Edit batch",
      undo: async () => { await api.updateBatch(id, before); },
      redo: async () => { await api.updateBatch(id, data); },
    });
    await refresh();
  }, [batches, record, refresh]);

  const removeBatch = useCallback(async (id) => {
    const before = batches.find((b) => b.id === id);
    const studentsInBatch = students.filter((s) => s.batch_id === id);
    const paymentsInBatch = payments.filter((p) => studentsInBatch.some((s) => s.id === p.student_id));
    await api.deleteBatch(id);
    record({
      label: "Delete batch",
      undo: async () => {
        await api.createBatch(before);
        for (const s of studentsInBatch) await api.createStudent(s);
        for (const p of paymentsInBatch) await api.createPayment(p);
      },
      redo: async () => { await api.deleteBatch(id); },
    });
    await refresh();
  }, [batches, students, payments, record, refresh]);

  const addStudent = useCallback(async (data) => {
    const created = await api.createStudent(data);
    const liveId = { id: created.id };
    record({
      label: "Add student",
      undo: async () => { await api.deleteStudent(liveId.id); },
      redo: async () => { const recreated = await api.createStudent(data); liveId.id = recreated.id; },
    });
    await refresh();
    return created;
  }, [record, refresh]);

  const editStudent = useCallback(async (id, data) => {
    const before = students.find((s) => s.id === id);
    await api.updateStudent(id, data);
    record({
      label: "Edit student",
      undo: async () => { await api.updateStudent(id, before); },
      redo: async () => { await api.updateStudent(id, data); },
    });
    await refresh();
  }, [students, record, refresh]);

  const removeStudent = useCallback(async (id) => {
    const before = students.find((s) => s.id === id);
    const beforePayments = payments.filter((p) => p.student_id === id);
    await api.deleteStudent(id);
    record({
      label: "Delete student",
      undo: async () => {
        await api.createStudent(before);
        for (const p of beforePayments) await api.createPayment(p);
      },
      redo: async () => { await api.deleteStudent(id); },
    });
    await refresh();
  }, [students, payments, record, refresh]);

  const moveStudent = useCallback(async (id, newBatchId) => {
    const before = students.find((s) => s.id === id);
    await api.moveStudent(id, newBatchId);
    record({
      label: "Move student",
      undo: async () => { await api.moveStudent(id, before.batch_id); },
      redo: async () => { await api.moveStudent(id, newBatchId); },
    });
    await refresh();
  }, [students, record, refresh]);

  const addPayment = useCallback(async (data) => {
    const created = await api.createPayment(data);
    const liveId = { id: created.id };
    record({
      label: "Payment",
      undo: async () => { await api.deletePayment(liveId.id); },
      redo: async () => { const recreated = await api.createPayment(data); liveId.id = recreated.id; },
    });
    await refresh();
    return created;
  }, [record, refresh]);
const removePaymentsForMonth = useCallback(async (studentId, month) => {
  const targets = payments.filter(
    (p) => p.student_id === studentId && p.month === month
  );

  if (!targets.length) return;

  const liveIds = targets.map((p) => ({ id: p.id }));

  for (const item of liveIds) {
    await api.deletePayment(item.id);
  }

  record({
    label: "Mark unpaid",
    undo: async () => {
      for (let i = 0; i < targets.length; i++) {
        const recreated = await api.createPayment(targets[i]);
        liveIds[i].id = recreated.id;
      }
    },
    redo: async () => {
      for (const item of liveIds) {
        await api.deletePayment(item.id);
      }
    },
  });

  await refresh();
}, [payments, record, refresh]);
  const addEvent = useCallback(async (data) => {
    const created = await api.createEvent(data);
    await refresh();
    return created;
  }, [refresh]);

  const removeEvent = useCallback(async (id) => {
    await api.deleteEvent(id);
    await refresh();
  }, [refresh]);

  const importAll = useCallback(async (data) => {
    const res = await api.importAll(data);
    clearStacks();
    await refresh();
    return res;
  }, [clearStacks, refresh]);

  return useMemo(() => ({
    addBatch, editBatch, removeBatch,
    addStudent, editStudent, removeStudent, moveStudent,
    addPayment,removePaymentsForMonth,
    addEvent, removeEvent,
    importAll,
  }), [addBatch, editBatch, removeBatch, addStudent, editStudent, removeStudent, moveStudent, addPayment, addEvent, removeEvent, importAll]);
};
