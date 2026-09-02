import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "./api";
import { useOperations } from "./operations";
import { useStacks } from "./useStacks";

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
  }, [api, setBatches, setStudents, setPayments, setEvents, setSettings, setActivities]);

  const retryLoad = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      
      await refresh();
    } catch (err) {
      if (process.env.NODE_ENV === "development") console.error("Initial data load failed", err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [refresh, api, setLoading, setLoadError]);

  useEffect(() => {
    retryLoad();
  }, [retryLoad]);

  const { undoStack, redoStack, record, clearStacks, doUndo, doRedo } = useStacks(refresh);

  const saveSettings = useCallback(async (data) => {
    const res = await api.updateSettings(data);
    await refresh();
    return res;
  }, [refresh, api]);

  const ops = useOperations({ batches, students, payments, refresh, record, clearStacks });

  const value = useMemo(() => ({
    batches, students, payments, events, settings, activities,
    loading, loadError, retryLoad,
    refresh, saveSettings,
    ...ops,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    doUndo, doRedo,
  }), [batches, students, payments, events, settings, activities, loading, loadError, retryLoad, refresh, saveSettings, ops, undoStack, redoStack, doUndo, doRedo]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
};

export const useData = () => {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
};
