import React, { useState } from "react";
import { useData } from "@/lib/store";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BatchForm } from "@/components/BatchForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { inr } from "@/lib/calc";

export const Batches = () => {
  const { batches, students, addBatch, editBatch, removeBatch } = useData();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (b) => { setEditing(b); setFormOpen(true); };

  const onSave = async (data) => {
    if (editing) await editBatch(editing.id, data);
    else await addBatch(data);
  };

  const countIn = (id) => students.filter((s) => s.batch_id === id).length;

  return (
    <div className="space-y-5" data-testid="batches-page">
      <div className="flex items-start gap-3">
        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Batches</h2>
          <p className="text-slate-500 mt-1">Manage your classes</p>
        </div>
        <button
          onClick={openAdd}
          data-testid="add-batch-btn"
          className="ml-auto btn-press h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md hover:bg-indigo-700"
          aria-label="Add batch"
        >
          <Plus size={22} />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {batches.map((b) => (
          <div key={b.id} data-testid={`batch-card-${b.id}`} className="rounded-3xl bg-white p-5 soft-shadow card-hover flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-2xl shrink-0">📚</div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-slate-900 text-lg truncate">{b.name}</div>
              <div className="text-sm text-slate-500 truncate">{b.subject}{b.class_time ? ` · ${b.class_time}` : ""}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-full text-slate-700 font-semibold">{countIn(b.id)} Students</span>
                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">{inr(b.monthly_fee)} Fees</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button data-testid={`edit-batch-${b.id}`} onClick={() => openEdit(b)} className="btn-press h-10 w-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center" aria-label="Edit"><Pencil size={16} /></button>
              <button data-testid={`delete-batch-${b.id}`} onClick={() => setToDelete(b)} className="btn-press h-10 w-10 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center" aria-label="Delete"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {batches.length === 0 && (
          <div className="col-span-full rounded-3xl bg-white p-10 text-center text-slate-500 soft-shadow">
            <BookOpen className="mx-auto mb-3" />
            No batches yet. Tap the + button to add your first batch.
          </div>
        )}
      </div>

      <BatchForm open={formOpen} onClose={() => setFormOpen(false)} initial={editing} onSave={onSave} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete this batch?"
        description="Students and payment history in this batch will also be removed. This can be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => { await removeBatch(toDelete.id); }}
      />
    </div>
  );
};
