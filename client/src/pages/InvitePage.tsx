/*
 * Lumen Metrix — Invite Registration Page
 * New users accept an invite and create their account
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import LumenLogo from "@/components/LumenLogo";
import { Loader2, User, Lock, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

interface InvitePageProps {
  token: string;
  onRegistered: () => void;
}

export default function InvitePage({ token, onRegistered }: InvitePageProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: invite, isLoading: validating } = trpc.staffAuth.validateInvite.useQuery({ token });

  const registerMutation = trpc.staffAuth.register.useMutation({
    onSuccess: () => {
      onRegistered();
    },
    onError: (err) => {
      setErrorMsg(err.message || "Registration failed");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Name is required");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match");
      return;
    }

    registerMutation.mutate({ token, name: name.trim(), password });
  }

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F9F7F4" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E8913A" }} />
      </div>
    );
  }

  if (!invite?.valid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F9F7F4" }}>
        <div className="w-full max-w-sm rounded-2xl shadow-lg px-6 sm:px-8 py-8 sm:py-10 text-center" style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)" }}>
          <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#EF4444" }} />
          <h1 className="text-[18px] font-semibold mb-2" style={{ color: "#1C1917", fontFamily: "'DM Sans', sans-serif" }}>
            Invalid Invite
          </h1>
          <p className="text-[14px]" style={{ color: "#6B7280" }}>
            {invite?.error || "This invite link is invalid or has expired."}
          </p>
          <p className="text-[13px] mt-4" style={{ color: "#9CA3AF" }}>
            Contact your administrator for a new invite.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F9F7F4" }}>
      <div className="w-full max-w-sm rounded-2xl shadow-lg px-6 sm:px-8 py-8 sm:py-10" style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)" }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <LumenLogo variant="full" size={32} className="mb-3" />
        </div>

        {/* Heading */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-3" style={{ background: "rgba(34,197,94,0.1)" }}>
            <CheckCircle className="w-5 h-5" style={{ color: "#22C55E" }} />
          </div>
          <h1 className="text-[18px] font-semibold" style={{ color: "#1C1917", fontFamily: "'DM Sans', sans-serif" }}>
            Create Your Account
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#9CA3AF" }}>
            You've been invited to join as <strong style={{ color: "#1C1917" }}>{invite.email}</strong>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9CA3AF" }} />
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrorMsg(""); }}
              placeholder="Your name"
              disabled={registerMutation.isPending}
              className="w-full rounded-lg pl-10 pr-4 py-3 text-[14px] outline-none transition-all"
              style={{ background: "#F9F7F4", border: "1.5px solid #E5E7EB", color: "#1C1917", fontFamily: "'DM Sans', sans-serif" }}
              onFocus={(e) => { e.currentTarget.style.border = "1.5px solid #E8913A"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1.5px solid #E5E7EB"; }}
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9CA3AF" }} />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
              placeholder="Create password (min 6 characters)"
              disabled={registerMutation.isPending}
              className="w-full rounded-lg pl-10 pr-11 py-3 text-[14px] outline-none transition-all"
              style={{ background: "#F9F7F4", border: "1.5px solid #E5E7EB", color: "#1C1917", fontFamily: "'DM Sans', sans-serif" }}
              onFocus={(e) => { e.currentTarget.style.border = "1.5px solid #E8913A"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1.5px solid #E5E7EB"; }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
              style={{ color: "#9CA3AF" }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Confirm Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#9CA3AF" }} />
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(""); }}
              placeholder="Confirm password"
              disabled={registerMutation.isPending}
              className="w-full rounded-lg pl-10 pr-4 py-3 text-[14px] outline-none transition-all"
              style={{ background: "#F9F7F4", border: "1.5px solid #E5E7EB", color: "#1C1917", fontFamily: "'DM Sans', sans-serif" }}
              onFocus={(e) => { e.currentTarget.style.border = "1.5px solid #E8913A"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1.5px solid #E5E7EB"; }}
            />
          </div>

          {errorMsg && (
            <p className="text-[12px] text-red-500 text-center">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={registerMutation.isPending || !name.trim() || !password || !confirmPassword}
            className="w-full py-3 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background: registerMutation.isPending || !name.trim() || !password || !confirmPassword ? "#E5E7EB" : "#E8913A",
              color: registerMutation.isPending || !name.trim() || !password || !confirmPassword ? "#9CA3AF" : "#FFFFFF",
              fontFamily: "'DM Sans', sans-serif",
              cursor: registerMutation.isPending || !name.trim() || !password || !confirmPassword ? "not-allowed" : "pointer",
            }}
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>
      </div>

      <p className="mt-6 text-[11px]" style={{ color: "#D1D5DB", letterSpacing: "0.04em" }}>
        Powered by LUMEN METRIX
      </p>
    </div>
  );
}
