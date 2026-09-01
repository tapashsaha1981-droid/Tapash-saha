import { api } from "./api";

// CRUD operations wrapped with undo/redo recording.
export const useOperations = ({ batches, students, payments, refresh, record, clearStacks }) => {
  const addBatch = async (data) => {
    const created = await api.createBatch(data);
    record({
      label: "Add batch",
      undo: async () => { await api.deleteBatch(created.id); },
      redo: async () => { await api.createBatch({ ...data }); },
    });
    await refresh();
    return created;
  };

  const editBatch = async (id, data) => {
    const before = batches.find((b) => b.id === id);
    await api.updateBatch(id, data);
    record({
      label: "Edit batch",
      undo: async () => { await api.updateBatch(id, before); },
      redo: async () => { await api.updateBatch(id, data); },
    });
    await refresh();
  };

  const removeBatch = async (id) => {
    const before = batches.find((b) => b.id === id);
    const studentsInBatch = students.filter((s) => s.batch_id === id);
    const paymentsInBatch = payments.filter((p) => studentsInBatch.some((s) => s.id === p.student_id));
    await api.deleteBatch(id);
    record({
      label: "Delete batch",
      undo: async () => {
        await api.createBatch({ name: before.name, subject: before.subject, class_time: before.class_time, monthly_fee: before.monthly_fee });
        for (const s of studentsInBatch) await api.createStudent(s);
        for (const p of paymentsInBatch) await api.createPayment(p);
      },
      redo: async () => { await api.deleteBatch(id); },
    });
    await refresh();
  };

  const addStudent = async (data) => {
    const created = await api.createStudent(data);
    record({
      label: "Add student",
      undo: async () => { await api.deleteStudent(created.id); },
      redo: async () => { await api.createStudent(data); },
    });
    await refresh();
    return created;
  };

  const editStudent = async (id, data) => {
    const before = students.find((s) => s.id === id);
    await api.updateStudent(id, data);
    record({
      label: "Edit student",
      undo: async () => { await api.updateStudent(id, before); },
      redo: async () => { await api.updateStudent(id, data); },
    });
    await refresh();
  };

  const removeStudent = async (id) => {
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
  };

  const moveStudent = async (id, newBatchId) => {
    const before = students.find((s) => s.id === id);
    await api.moveStudent(id, newBatchId);
    record({
      label: "Move student",
      undo: async () => { await api.moveStudent(id, before.batch_id); },
      redo: async () => { await api.moveStudent(id, newBatchId); },
    });
    await refresh();
  };

  const addPayment = async (data) => {
    const created = await api.createPayment(data);
    record({
      label: "Payment",
      undo: async () => { await api.deletePayment(created.id); },
      redo: async () => { await api.createPayment(data); },
    });
    await refresh();
    return created;
  };

  const addEvent = async (data) => {
    const created = await api.createEvent(data);
    await refresh();
    return created;
  };

  const removeEvent = async (id) => {
    await api.deleteEvent(id);
    await refresh();
  };

  const importAll = async (data) => {
    const res = await api.importAll(data);
    clearStacks();
    await refresh();
    return res;
  };

  return {
    addBatch, editBatch, removeBatch,
    addStudent, editStudent, removeStudent, moveStudent,
    addPayment,
    addEvent, removeEvent,
    importAll,
  };
};
