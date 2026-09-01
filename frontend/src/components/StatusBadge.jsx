import React from "react";
import { cn } from "@/lib/utils";

export const StatusBadge = ({ status, size = "md" }) => {
  const map = {
    paid: { emoji: "✅", label: "Paid", cls: "bg-emerald-100 text-emerald-700" },
    partial: { emoji: "🟡", label: "Partial", cls: "bg-amber-100 text-amber-800" },
    unpaid: { emoji: "❌", label: "Unpaid", cls: "bg-rose-100 text-rose-700" },
  };
  const s = map[status] || map.unpaid;
  return (
    <span
      data-testid={`status-${status}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        s.cls
      )}
    >
      <span aria-hidden>{s.emoji}</span> {s.label}
    </span>
  );
};
