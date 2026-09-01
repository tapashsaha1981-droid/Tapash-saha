import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const DataCtx = createContext(null);

export const DataProvider = ({ children }) => {
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // undo/redo stacks: entries = { undo: async ()=>{}, redo: async ()=>{}, label }
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const refresh = useCallback(async () => {
    const [b, s, p, e] = await Promise.all([
      api.listBatches(),
      api.listStudents(),
      api.listPayments(),
      api.listEvents(),
    ]);
    setBatches(b);
    setStudents(s);
    setPayments(p);
    setEvents(e);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await api.seed();
      } catch (e) { /* ignore */ }
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const record = (entry) => {
    setUndoStack((s) => [...s, entry].slice(-30));
    setRedoStack([]);
  };

  const doUndo = async () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      entry.undo().then(refresh);
      setRedoStack((r) => [...r, entry].slice(-30));
      return prev.slice(0, -1);
    });
  };

  const doRedo = async () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const entry = prev[prev.length - 1];
      entry.redo().then(refresh);
      setUndoStack((u) => [...u, entry].slice(-30));
      return prev.slice(0, -1);
    });
  };

  // wrapped operations that record undo entries
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
  const removeEvent = async (id) => { await api.deleteEvent(id); await refresh(); };

  const importAll = async (data) => {
    const res = await api.importAll(data);
    setUndoStack([]);
    setRedoStack([]);
    await refresh();
    return res;
  };

  return (
    <DataCtx.Provider
      value={{
        batches, students, payments, events, loading,
        refresh,
        addBatch, editBatch, removeBatch,
        addStudent, editStudent, removeStudent, moveStudent,
        addPayment,
        addEvent, removeEvent,
        importAll,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        doUndo, doRedo,
      }}
    >
      {children}
    </DataCtx.Provider>
  );
};

export const useData = () => {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
};
