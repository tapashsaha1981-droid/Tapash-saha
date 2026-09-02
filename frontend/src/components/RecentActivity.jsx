import React from "react";

const timeAgo = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

export const RecentActivity = ({ activities = [] }) => (
  <div className="rounded-3xl bg-white p-5 sm:p-6 soft-shadow" data-testid="recent-activity">
    <div className="font-bold text-slate-900 text-base sm:text-lg">Recent Activity</div>
    <div className="mt-3 divide-y divide-slate-100">
      {activities.slice(0, 20).map((a) => (
        <div key={a.id} className="flex items-center gap-3 py-2.5">
          <div className="h-9 w-9 rounded-full bg-indigo-50 flex items-center justify-center text-sm shrink-0">🐾</div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 text-sm truncate">{a.msg}</div>
            <div className="text-xs text-slate-400">{timeAgo(a.time)}</div>
          </div>
        </div>
      ))}
      {activities.length === 0 && (
        <div className="text-sm text-slate-400 py-6 text-center">No activity yet</div>
      )}
    </div>
  </div>
);
