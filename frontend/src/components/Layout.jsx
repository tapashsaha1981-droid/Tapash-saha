import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { GraduationCap, Undo2, Redo2, CheckCircle2, Home, BookOpen, Users, ClipboardList, CalendarDays } from "lucide-react";
import { useData } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Layout = ({ children }) => {
  const { canUndo, canRedo, doUndo, doRedo } = useData();
  const loc = useLocation();

  const nav = [
    { to: "/", label: "Dashboard", icon: Home, testid: "nav-dashboard", emoji: "🏠" },
    { to: "/batches", label: "Batches", icon: BookOpen, testid: "nav-batches", emoji: "📚" },
    { to: "/students", label: "Students", icon: Users, testid: "nav-students", emoji: "👩‍🏫" },
    { to: "/overview", label: "Overview", icon: ClipboardList, testid: "nav-overview", emoji: "📋" },
    { to: "/calendar", label: "Calendar", icon: CalendarDays, testid: "nav-calendar", emoji: "📅" },
  ];

  return (
    <div className="min-h-screen bg-[#F5F6FA] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
            <GraduationCap className="text-white" size={22} strokeWidth={2.5} />
          </div>
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900" data-testid="app-title">TAPASH SIR</h1>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-semibold" data-testid="license-pill">
            <CheckCircle2 size={14} /> Licensed
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              data-testid="undo-btn"
              onClick={doUndo}
              disabled={!canUndo}
              className="btn-press h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
              aria-label="Undo"
            >
              <Undo2 size={18} />
            </button>
            <button
              data-testid="redo-btn"
              onClick={doRedo}
              disabled={!canRedo}
              className="btn-press h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"
              aria-label="Redo"
            >
              <Redo2 size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-slate-200/60">
        <div className="max-w-3xl mx-auto grid grid-cols-5 px-2 py-2">
          {nav.map((n) => {
            const active = loc.pathname === n.to;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={n.testid}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl mx-1 btn-press",
                  active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <span className="text-lg leading-none" aria-hidden>{n.emoji}</span>
                <span className={cn("text-[11px] font-semibold", active ? "text-white" : "text-slate-700")}>{n.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
