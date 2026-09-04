import React, { useEffect, useState } from "react";
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
import { api } from "@/lib/api";

const TOKEN_KEY = "tapash_auth_token";

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
    <div className="text-center">
      <div className="h-12 w-12 mx-auto rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl animate-pulse">
        🎓
      </div>
      <div className="mt-3 font-bold text-slate-700">
        Loading TAPASH SIR…
      </div>
    </div>
  </div>
);

const ErrorScreen = ({ onRetry }) => (
  <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA] px-6">
    <div className="text-center max-w-sm">
      <div className="h-12 w-12 mx-auto rounded-2xl bg-rose-100 flex items-center justify-center text-2xl">
        ⚠️
      </div>

      <div className="mt-3 font-bold text-slate-900 text-lg">
        Could not load data
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Please check your internet connection and try again.
      </p>

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

  if (loadError) {
    return <ErrorScreen onRetry={retryLoad} />;
  }

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

const LoginScreen = ({ onLogin }) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);

      const result = await api.login(password);

      if (!result?.access_token) {
        throw new Error("Login failed");
      }

      localStorage.setItem(TOKEN_KEY, result.access_token);
      onLogin();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        "Incorrect password. Please try again.";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-7 sm:p-9">

          <div className="text-center">
            <div className="h-20 w-20 mx-auto rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-4xl shadow-lg">
              🎓
            </div>

            <h1 className="mt-5 text-2xl sm:text-3xl font-extrabold text-slate-900">
              TAPASH SIR
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Tuition Management System
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Password
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full h-12 rounded-2xl border border-slate-300 px-4 pr-12 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-press mt-5 w-full h-12 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold shadow-lg hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "🔐 Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Your session will remain active for 30 days.
          </p>
        </div>
      </div>
    </div>
  );
};

const AuthGate = () => {
  const [authenticated, setAuthenticated] = useState(
    () => !!localStorage.getItem(TOKEN_KEY)
  );

  useEffect(() => {
    const handleExpired = () => {
      localStorage.removeItem(TOKEN_KEY);
      setAuthenticated(false);
    };

    window.addEventListener("tapash-auth-expired", handleExpired);

    return () => {
      window.removeEventListener("tapash-auth-expired", handleExpired);
    };
  }, []);

  if (!authenticated) {
    return <LoginScreen onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthGate />
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
