import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { DataProvider, useData } from "@/lib/store";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Batches } from "@/pages/Batches";
import { Students } from "@/pages/Students";
import { Overview } from "@/pages/Overview";
import { CalendarPage } from "@/pages/CalendarPage";

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
    <div className="text-center">
      <div className="h-12 w-12 mx-auto rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl animate-pulse">🎓</div>
      <div className="mt-3 font-bold text-slate-700">Loading TAPASH SIR…</div>
    </div>
  </div>
);

const ErrorScreen = ({ onRetry }) => (
  <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] px-6">
    <div className="text-center max-w-sm">
      <div className="h-12 w-12 mx-auto rounded-2xl bg-rose-100 flex items-center justify-center text-2xl">⚠️</div>
      <div className="mt-3 font-bold text-slate-900 text-lg">Could not load data</div>
      <p className="mt-1 text-sm text-slate-500">Please check your internet connection and try again.</p>
      <button
        data-testid="retry-load-btn"
        onClick={onRetry}
        className="btn-press mt-4 px-6 h-11 rounded-2xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
      >
        Retry
      </button>
    </div>
  </div>
);

const Shell = () => {
  const { loading, loadError, retryLoad } = useData();
  if (loading) return <LoadingScreen />;
  if (loadError) return <ErrorScreen onRetry={retryLoad} />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/batches" element={<Batches />} />
        <Route path="/students" element={<Students />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </Layout>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <DataProvider>
          <Shell />
          <Toaster position="top-center" richColors />
        </DataProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
