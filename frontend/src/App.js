
import React, {
  useEffect,
  useState,
} from "react";

import "@/App.css";

import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import {
  Toaster,
  toast,
} from "sonner";

import {
  DataProvider,
  useData,
} from "@/lib/store";

import { Layout } from "@/components/Layout";

import { Dashboard } from "@/pages/Dashboard";
import { Batches } from "@/pages/Batches";
import { Students } from "@/pages/Students";
import { Overview } from "@/pages/Overview";
import { CalendarPage } from "@/pages/CalendarPage";
import Attendance from "@/pages/Attendance";
import { RazorpayPayments } from "@/pages/RazorpayPayments";

import { api } from "@/lib/api";

const TOKEN_KEY = "tapash_auth_token";

/* PUSH MESSAGE HANDLER */
const PushMessageHandler = () => {
  const location = useLocation();

  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const pushTitle = params.get("push_title");
      const pushBody = params.get("push_body");

      if (!pushTitle && !pushBody) return;

      const title = pushTitle || "EduNotes Pro";
      const body = pushBody || "You have a new notification.";

      const messageKey = `${title}::${body}`;
      const previousMessage = sessionStorage.getItem(
        "edunotes-last-push-message"
      );

      if (previousMessage !== messageKey) {
        toast(title, {
          description: body,
          duration: 10000,
          closeButton: true,
        });

        sessionStorage.setItem(
          "edunotes-last-push-message",
          messageKey
        );
      }

      params.delete("push_title");
      params.delete("push_body");

      const remainingQuery = params.toString();

      const cleanUrl =
        `${location.pathname}` +
        (remainingQuery ? `?${remainingQuery}` : "") +
        `${location.hash || ""}`;

      window.history.replaceState(
        {},
        document.title,
        cleanUrl || "/"
      );
    } catch (error) {
      console.error(
        "EduNotes Pro push message handler error:",
        error
      );
    }
  }, [
    location.search,
    location.pathname,
    location.hash,
  ]);

  return null;
};

/* LOADING SCREEN */
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

/* ERROR SCREEN */
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

/*
 * PERSISTENT BACKGROUND SYNC NOTICES
 * Failed notices remain until manually closed.
 */
const PaymentSyncNotices = () => {
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState({});

  const refreshJobs = async () => {
    try {
      const result = await api.listPaymentSyncJobs();
      setJobs(Array.isArray(result) ? result : []);
    } catch (error) {
      console.warn(
        "Could not refresh payment sync notices",
        error
      );
    }
  };

  useEffect(() => {
    refreshJobs();

    const timer = window.setInterval(
      refreshJobs,
      8000
    );

    return () => window.clearInterval(timer);
  }, []);

  const retry = async (jobId) => {
    setBusy((old) => ({
      ...old,
      [jobId]: true,
    }));

    try {
      await api.retryPaymentSyncJob(jobId);
      await refreshJobs();
    } catch (error) {
      window.alert(
        error?.response?.data?.detail ||
        "Could not retry sync. Please try again."
      );
    } finally {
      setBusy((old) => ({
        ...old,
        [jobId]: false,
      }));
    }
  };

  const dismiss = async (jobId) => {
    setBusy((old) => ({
      ...old,
      [jobId]: true,
    }));

    try {
      await api.dismissPaymentSyncJob(jobId);
      await refreshJobs();
    } catch (error) {
      window.alert(
        error?.response?.data?.detail ||
        "Could not close this notice. Please try again."
      );
    } finally {
      setBusy((old) => ({
        ...old,
        [jobId]: false,
      }));
    }
  };

  const failures = jobs.filter(
    (job) => job.status === "failed"
  );

  const active = jobs.filter(
    (job) =>
      job.status === "pending" ||
      job.status === "processing"
  );

  if (!failures.length && !active.length) {
    return null;
  }

  return (
    <div
      className="fixed z-[100] bottom-4 right-4 left-4 md:left-auto md:w-[420px] space-y-3"
      aria-live="polite"
    >
      {failures.map((job) => (
        <div
          key={job.id}
          className="rounded-2xl border-2 border-rose-300 bg-white p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-rose-700">
                EduNotes Sync Failed
              </div>

              <div className="mt-1 text-sm text-slate-700">
                {job.student_name
                  ? `${job.student_name}: `
                  : ""}
                The Tuition Manager payment was saved,
                but EduNotes could not be synchronised.
              </div>
            </div>

            <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">
              FAILED
            </span>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Month: {job.month || "—"} ·{" "}
            {job.failed_at
              ? new Date(job.failed_at).toLocaleString()
              : "Time unavailable"}
          </div>

          <div className="mt-2 rounded-lg bg-rose-50 p-2 text-sm text-rose-800 break-words">
            {job.error || "Unknown synchronisation error"}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              disabled={!!busy[job.id]}
              onClick={() => retry(job.id)}
              className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy[job.id]
                ? "Please wait…"
                : "Retry Sync"}
            </button>

            <button
              disabled={!!busy[job.id]}
              onClick={() => dismiss(job.id)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      ))}

      {active.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg">
          EduNotes synchronisation in progress ({active.length})…
        </div>
      )}
    </div>
  );
};

/* MAIN APPLICATION SHELL */
const Shell = () => {
  const {
    loading,
    loadError,
    retryLoad,
  } = useData();

  if (loading) {
    return <LoadingScreen />;
  }

  if (loadError) {
    return (
      <ErrorScreen onRetry={retryLoad} />
    );
  }

  return (
    <>
      <PaymentSyncNotices />

      <Layout>
        <Routes>
          <Route
            path="/"
            element={<Dashboard />}
          />

          <Route
            path="/batches"
            element={<Batches />}
          />

          <Route
            path="/students"
            element={<Students />}
          />

          <Route
            path="/overview"
            element={<Overview />}
          />

          <Route
            path="/calendar"
            element={<CalendarPage />}
          />

          <Route
            path="/attendance"
            element={<Attendance />}
          />

          <Route
            path="/razorpay-payments"
            element={<RazorpayPayments />}
          />
        </Routes>
      </Layout>
    </>
  );
};

/* LOGIN SCREEN */
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

      localStorage.setItem(
        TOKEN_KEY,
        result.access_token
      );

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

          <form
            onSubmit={handleSubmit}
            className="mt-8"
          >
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Password
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full h-12 rounded-2xl border border-slate-300 px-4 pr-12 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
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

/* AUTH GATE */
const AuthGate = () => {
  const [
    authenticated,
    setAuthenticated,
  ] = useState(
    () => !!localStorage.getItem(TOKEN_KEY)
  );

  useEffect(() => {
    const handleExpired = () => {
      localStorage.removeItem(TOKEN_KEY);
      setAuthenticated(false);
    };

    window.addEventListener(
      "tapash-auth-expired",
      handleExpired
    );

    return () => {
      window.removeEventListener(
        "tapash-auth-expired",
        handleExpired
      );
    };
  }, []);

  if (!authenticated) {
    return (
      <LoginScreen
        onLogin={() => setAuthenticated(true)}
      />
    );
  }

  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
};

/* APP */
function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <PushMessageHandler />

        <AuthGate />

        <Toaster
          position="top-center"
          richColors
        />
      </BrowserRouter>
    </div>
  );
}

export default App;
