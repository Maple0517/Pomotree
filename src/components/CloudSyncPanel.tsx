"use client";

import { FormEvent, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/services/cloudSync";
import { useAppStore } from "@/lib/store/useAppStore";
import type { UserSettings } from "@/types/domain";

type AppLanguage = NonNullable<UserSettings["language"]>;
type Variant = "dashboard" | "menubar";

type CloudSyncCopy = {
  title: string;
  subtitle: string;
  notConfigured: string;
  email: string;
  code: string;
  sendCode: string;
  verify: string;
  signOut: string;
  backup: string;
  restore: string;
  overwrite: string;
  refresh: string;
  firstUpload: string;
  conflict: string;
  status: string;
  signedOut: string;
  idle: string;
  queued: string;
  syncing: string;
  error: string;
  success: string;
  codeSent: string;
  rateLimited: string;
  restored: string;
};

const TEXT: Record<AppLanguage, CloudSyncCopy> = {
  en: {
    title: "Cloud Sync",
    subtitle: "Tauri-first Supabase snapshot backup.",
    notConfigured: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    email: "Email",
    code: "6-digit code",
    sendCode: "Send code",
    verify: "Verify & sign in",
    signOut: "Sign out",
    backup: "Back up now",
    restore: "Restore cloud",
    overwrite: "Overwrite cloud",
    refresh: "Refresh",
    firstUpload: "Local data found. Back up now to make this device the initial cloud copy.",
    conflict: "Cloud data changed elsewhere. Restore cloud data or overwrite it with this device.",
    status: "Status",
    signedOut: "Signed out",
    idle: "Synced",
    queued: "Backup queued",
    syncing: "Backing up…",
    error: "Sync error",
    success: "Done",
    codeSent: "Verification code sent. Check your email inbox and spam folder.",
    rateLimited: "Too many requests. Please wait a while before sending another code.",
    restored: "Cloud data restored",
  },
  zh: {
    title: "云同步",
    subtitle: "Tauri 优先的 Supabase 快照备份。",
    notConfigured: "Supabase 尚未配置。请设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。",
    email: "邮箱",
    code: "6 位验证码",
    sendCode: "发送验证码",
    verify: "验证并登录",
    signOut: "退出登录",
    backup: "立即备份",
    restore: "恢复云端",
    overwrite: "覆盖云端",
    refresh: "刷新",
    firstUpload: "检测到本机已有数据。点击立即备份，把本机设为云端初始版本。",
    conflict: "云端数据已在其他设备变化。请恢复云端，或用本机覆盖云端。",
    status: "状态",
    signedOut: "未登录",
    idle: "已同步",
    queued: "已排队备份",
    syncing: "正在备份…",
    error: "同步错误",
    success: "完成",
    codeSent: "验证码已发送，请检查邮箱收件箱和垃圾邮件。",
    rateLimited: "发送太频繁了，Supabase 已限流，请稍后再试。",
    restored: "已恢复云端数据",
  },
};

function statusLabel(copy: CloudSyncCopy, status: string) {
  if (status === "idle") return copy.idle;
  if (status === "queued") return copy.queued;
  if (status === "syncing") return copy.syncing;
  if (status === "error") return copy.error;
  if (status === "conflict") return copy.conflict;
  return copy.signedOut;
}

type Notice = { tone: "success" | "error"; text: string };

function formatCloudSyncError(error: unknown, copy: CloudSyncCopy) {
  const message = error instanceof Error ? error.message : copy.error;
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit") || normalized.includes("only request this after")) return copy.rateLimited;
  return message;
}

export function CloudSyncPanel({ language, variant = "dashboard" }: { language: AppLanguage; variant?: Variant }) {
  const {
    cloudSync,
    sendCloudSyncOtp,
    verifyCloudSyncOtp,
    signOutCloudSync,
    backupToCloud,
    restoreFromCloud,
    refreshCloudSync,
  } = useAppStore();
  const copy = TEXT[language];
  const [email, setEmail] = useState(cloudSync.email ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);
  const configured = isSupabaseConfigured();
  const signedIn = cloudSync.status !== "signed_out" && Boolean(cloudSync.email);
  const shellClass = variant === "menubar"
    ? "grid gap-3 rounded-[16px] border border-[var(--menubar-border)] bg-[var(--menubar-soft)] p-4"
    : "rounded-2xl bg-[var(--surface-soft)] px-4 py-3";
  const inputClass = variant === "menubar"
    ? "h-10 rounded-[10px] border border-[var(--menubar-border-strong)] bg-[var(--menubar-control-bg)] px-3 text-sm font-semibold text-[var(--menubar-text)] outline-none"
    : "mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium outline-none";
  const primaryClass = variant === "menubar"
    ? "menubar-button rounded-[10px] bg-[#17191c] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
    : "rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50";
  const secondaryClass = variant === "menubar"
    ? "menubar-button rounded-[10px] border border-[var(--menubar-border-strong)] bg-[var(--menubar-control-bg)] px-3 py-2 text-xs font-bold text-[var(--menubar-text)] disabled:opacity-50"
    : "rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium disabled:opacity-50";
  const mutedClass = variant === "menubar" ? "text-[var(--menubar-muted-strong)]" : "text-[var(--muted)]";
  const titleClass = variant === "menubar" ? "text-[16px] font-bold text-[var(--menubar-text)]" : "font-semibold text-[var(--foreground)]";

  const run = async (callback: () => Promise<void>, success?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await callback();
      setMessage({ tone: "success", text: success ?? copy.success });
    } catch (error) {
      setMessage({ tone: "error", text: formatCloudSyncError(error, copy) });
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    void run(() => sendCloudSyncOtp(email), copy.codeSent);
  };

  const submitToken = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await verifyCloudSyncOtp(email, token);
      setToken("");
    });
  };

  return (
    <section className={shellClass} aria-label={copy.title}>
      <div className="flex items-start gap-3">
        {configured ? <Cloud className={`mt-0.5 shrink-0 ${mutedClass}`} size={20} /> : <CloudOff className={`mt-0.5 shrink-0 ${mutedClass}`} size={20} />}
        <div className="min-w-0 flex-1">
          <h2 className={titleClass}>{copy.title}</h2>
          <p className={`mt-1 text-xs leading-5 ${mutedClass}`}>{copy.subtitle}</p>
        </div>
        {signedIn ? (
          <button type="button" className={secondaryClass} disabled={busy} onClick={() => void run(refreshCloudSync)} aria-label={copy.refresh}>
            <RefreshCw size={14} />
          </button>
        ) : null}
      </div>

      {!configured ? <p className={`text-xs leading-5 ${mutedClass}`}>{copy.notConfigured}</p> : null}

      {configured && !signedIn ? (
        <div className="grid gap-3">
          <form className="grid gap-2" onSubmit={submitEmail}>
            <label className="grid gap-1 text-xs font-semibold">
              <span className={mutedClass}>{copy.email}</span>
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <button className={primaryClass} disabled={busy || !email.trim()}>{copy.sendCode}</button>
          </form>
          <form className="grid gap-2" onSubmit={submitToken}>
            <label className="grid gap-1 text-xs font-semibold">
              <span className={mutedClass}>{copy.code}</span>
              <input className={inputClass} inputMode="numeric" value={token} onChange={(event) => setToken(event.target.value)} placeholder="123456" />
            </label>
            <button className={secondaryClass} disabled={busy || !email.trim() || !token.trim()}>{copy.verify}</button>
          </form>
          {message ? <p className={`rounded-xl px-3 py-2 text-xs leading-5 ${message.tone === "error" ? "bg-[var(--danger-bg)] text-[var(--danger-text)]" : mutedClass}`} role="status">{message.text}</p> : null}
          {cloudSync.error ? <p className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-xs leading-5 text-[var(--danger-text)]" role="alert">{formatCloudSyncError(new Error(cloudSync.error), copy)}</p> : null}
        </div>
      ) : null}

      {configured && signedIn ? (
        <div className="grid gap-3">
          <div className={`rounded-xl border ${variant === "menubar" ? "border-[var(--menubar-border-strong)] bg-[var(--menubar-control-bg)]" : "border-[var(--border)] bg-[var(--surface)]"} px-3 py-2 text-xs`}>
            <p className="font-semibold">{cloudSync.email}</p>
            <p className={mutedClass}>{copy.status}: {statusLabel(copy, cloudSync.status)}</p>
            {cloudSync.lastSuccessfulBackupAt ? <p className={mutedClass}>Last backup: {new Date(cloudSync.lastSuccessfulBackupAt).toLocaleString()}</p> : null}
          </div>
          {cloudSync.firstLoginNeedsUpload ? <p className={`text-xs leading-5 ${mutedClass}`}>{copy.firstUpload}</p> : null}
          {cloudSync.status === "conflict" ? <p className="text-xs leading-5 text-[var(--danger-text)]">{cloudSync.error ?? copy.conflict}</p> : null}
          {cloudSync.error && cloudSync.status !== "conflict" ? <p className="text-xs leading-5 text-[var(--danger-text)]">{cloudSync.error}</p> : null}
          {message ? <p className={`text-xs leading-5 ${message.tone === "error" ? "text-[var(--danger-text)]" : mutedClass}`}>{message.text}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={primaryClass} disabled={busy || cloudSync.status === "syncing"} onClick={() => void run(() => backupToCloud())}>{copy.backup}</button>
            <button type="button" className={secondaryClass} disabled={busy} onClick={() => void run(restoreFromCloud, copy.restored)}>{copy.restore}</button>
            <button type="button" className={secondaryClass} disabled={busy} onClick={() => void run(() => backupToCloud({ force: true }))}>{copy.overwrite}</button>
            <button type="button" className={secondaryClass} disabled={busy} onClick={() => void run(signOutCloudSync)}>{copy.signOut}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
