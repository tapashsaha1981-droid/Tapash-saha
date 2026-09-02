import { useState, useCallback } from "react";

const MAX_STACK = 30;

// Undo/redo stacks; entries = { undo: async () => {}, redo: async () => {}, label }
export const useStacks = (refresh) => {
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const record = useCallback((entry) => {
    setUndoStack((s) => [...s, entry].slice(-MAX_STACK));
    setRedoStack([]);
  }, [setUndoStack, setRedoStack]);

  const clearStacks = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [setUndoStack, setRedoStack]);

  const doUndo = useCallback(async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack((p) => p.slice(0, -1));
    setRedoStack((p) => [...p, entry].slice(-MAX_STACK));
    try {
      await entry.undo();
    } finally {
      await refresh();
    }
  }, [undoStack, refresh, setUndoStack, setRedoStack]);

  const doRedo = useCallback(async () => {
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    setRedoStack((p) => p.slice(0, -1));
    setUndoStack((p) => [...p, entry].slice(-MAX_STACK));
    try {
      await entry.redo();
    } finally {
      await refresh();
    }
  }, [redoStack, refresh, setRedoStack, setUndoStack]);

  return { undoStack, redoStack, record, clearStacks, doUndo, doRedo };
};
