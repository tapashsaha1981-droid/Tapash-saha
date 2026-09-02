import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";
import { useOperations } from "./operations";

const DataCtx = createContext(null);

export const DataProvider = ({ children }) => {
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // undo/redo stacks: entries = { undo: async ()=>{}, redo: async ()=>{}, label }
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const refresh = useCallback(async () => {
    const [b, s, p, e, st, ac] = await Promise.all([
      api.listBatches(),
      api.listStudents(),
      api.listPayments(),
      api.listEvents(),
      api.getSettings(),
      api.listActivities(),
    ]);
    setBatches(b);
    setStudents(s);
    setPayments(p);
    setEvents(e);
    setSettings(st);
    setActivities(ac);
  }, []);

  const retryLoad = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await api.seed();
      await refresh();
    } catch (err) {
      console.error("Initial data load failed", err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    retryLoad();
  }, [retryLoad]);

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

  const clearStacks = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const saveSettings = useCallback(async (data) => {
    const res = await api.updateSettings(data);
    await refresh();
    return res;
  }, [refresh]);

  const ops = useOperations({ batches, students, payments, refresh, record, clearStacks });

  return (
    <DataCtx.Provider
      value={{
        batches, students, payments, events, settings, activities,
        loading, loadError, retryLoad,
        refresh, saveSettings,
        ...ops,
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
