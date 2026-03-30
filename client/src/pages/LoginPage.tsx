/*
 * Lumen Metrix — Password Login Page
 * Single shared-password gate with on-brand design
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import LumenLogo from "@/components/LumenLogo";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const loginMutation = trpc.dashboardAuth.login.useMutation({
    onSuccess: () => {
      onAuthenticated();
    },
    onError: (err) => {
      setErrorMsg("Incorrect password. Please try again.");
      setPassword("");
      inputRef.current?.focus();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setErrorMsg("");
    loginMutation.mutate({ password });
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#F9F7F4" }}
    >
      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl shadow-lg px-6 sm:px-8 py-8 sm:py-10"
        style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <LumenLogo variant="full" size={32} className="mb-3" />
          <p
            className="text-[13px] text-center"
            style={{ color: "#6B7280", letterSpacing: "0.01em" }}
          >
            Revolution Church Executive Dashboard
          </p>
        </div>

        {/* Heading */}
        <div className="mb-6 text-center">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-3"
            style={{ background: "rgba(232,145,58,0.1)" }}
          >
            <Lock className="w-5 h-5" style={{ color: "#E8913A" }} />
          </div>
          <h1
            className="text-[18px] font-semibold"
            style={{ color: "#1C1917", fontFamily: "'DM Sans', sans-serif" }}
          >
            Enter Password
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#9CA3AF" }}>
            This dashboard is password-protected
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              placeholder="Password"
              disabled={loginMutation.isPending}
              className="w-full rounded-lg px-4 py-3 pr-11 text-[14px] outline-none transition-all"
              style={{
                background: "#F9F7F4",
                border: errorMsg
                  ? "1.5px solid #EF4444"
                  : "1.5px solid #E5E7EB",
                color: "#1C1917",
                fontFamily: "'DM Sans', sans-serif",
              }}
              onFocus={(e) => {
                if (!errorMsg)
                  e.currentTarget.style.border = "1.5px solid #E8913A";
              }}
              onBlur={(e) => {
                if (!errorMsg)
                  e.currentTarget.style.border = "1.5px solid #E5E7EB";
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
              style={{ color: "#9CA3AF" }}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {errorMsg && (
            <p className="text-[12px] text-red-500 text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending || !password.trim()}
            className="w-full py-3 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background:
                loginMutation.isPending || !password.trim()
                  ? "#E5E7EB"
                  : "#E8913A",
              color:
                loginMutation.isPending || !password.trim()
                  ? "#9CA3AF"
                  : "#FFFFFF",
              fontFamily: "'DM Sans', sans-serif",
              cursor:
                loginMutation.isPending || !password.trim()
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Access Dashboard"
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p
        className="mt-6 text-[11px]"
        style={{ color: "#D1D5DB", letterSpacing: "0.04em" }}
      >
        Powered by LUMEN METRIX
      </p>
    </div>
  );
}
