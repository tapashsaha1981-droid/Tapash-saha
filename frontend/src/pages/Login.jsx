import React, { useState } from "react";
import { GraduationCap, Lock, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";

export const Login = ({ onLogin }) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);

      await api.login(password);

      localStorage.setItem("tapash_logged_in", "true");

      if (onLogin) {
        onLogin();
      }
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "Incorrect password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-7 sm:p-9">

          <div className="text-center">
            <div className="h-20 w-20 mx-auto rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
              <GraduationCap
                className="text-white"
                size={42}
                strokeWidth={2.5}
              />
            </div>

            <h1 className="mt-5 text-3xl font-extrabold text-slate-900">
              TAPASH SIR
            </h1>

            <p className="mt-1 text-slate-500">
              Tuition Manager
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-8">

            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Password
            </label>

            <div className="relative">
              <Lock
                size={19}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                data-testid="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full h-14 pl-12 pr-12 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff size={20} />
                ) : (
                  <Eye size={20} />
                )}
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            )}

            <button
              data-testid="login-btn"
              type="submit"
              disabled={loading}
              className="w-full h-14 mt-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-base shadow-lg hover:opacity-95 disabled:opacity-60"
            >
              {loading ? "Checking..." : "🔐 Login"}
            </button>

          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Your tuition data is protected.
          </p>

        </div>
      </div>
    </div>
  );
};
