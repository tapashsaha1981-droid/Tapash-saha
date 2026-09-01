import { useRef, useState } from "react";
import { toast } from "sonner";
import { currentMonth } from "./calc";

const asArray = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

const normalizeBackup = (parsed) => {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const normalized = {
    batches: asArray(parsed.batches),
    students: asArray(parsed.students),
    payments: asArray(parsed.payments),
    events: asArray(parsed.events),
  };
  if (!normalized.batches.length && !normalized.students.length && !normalized.payments.length) return null;
  return normalized;
};

// JSON export/import logic for the Dashboard backup controls.
export const useBackup = ({ batches, students, payments, events, importAll }) => {
  const [importOpen, setImportOpen] = useState(false);
  const pendingImport = useRef(null);
  const fileRef = useRef(null);

  const exportJSON = () => {
    const data = { batches, students, payments, events };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tapash-sir-backup-${currentMonth()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exported");
  };

  const onImportPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const normalized = normalizeBackup(JSON.parse(reader.result));
        if (!normalized) {
          toast.error("Backup file has no batches, students or payments to import");
          return;
        }
        pendingImport.current = normalized;
        setImportOpen(true);
      } catch {
        toast.error("Invalid JSON file — please choose a backup exported from this app");
      }
    };
    reader.onerror = () => toast.error("Could not read the selected file");
    reader.readAsText(file);
    e.target.value = "";
  };

  const doImport = async () => {
    try {
      const res = await importAll(pendingImport.current);
      const c = res?.counts;
      toast.success(c ? `Imported ${c.batches} batches, ${c.students} students, ${c.payments} payments` : "Data imported");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed — please try again");
      throw err;
    }
  };

  return { fileRef, importOpen, setImportOpen, exportJSON, onImportPick, doImport };
};
