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
  password: string;
  signIn: string;
  signUp: string;
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
  signedIn: string;
  signedUp: string;
  emailConfirmation: string;
  restored: string;
};

const TEXT: Record<AppLanguage, CloudSyncCopy> = {
  en: {
    title: "Cloud Sync",
    subtitle: "Tauri-first Supabase snapshot backup.",
    notConfigured: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signUp: "Create account",
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
    signedIn: "Signed in.",
    signedUp: "Account created. If email confirmation is enabled, confirm the email before signing in.",
    emailConfirmation: "Email confirmation is required. Confirm your email, then sign in with the password.",
    restored: "Cloud data restored",
  },
  zh: {
    title: "云同步",
    subtitle: "Tauri 优先的 Supabase 快照备份。",
    notConfigured: "Supabase 尚未配置。请设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。",
    email: "邮箱",
    password: "密码",
    signIn: "密码登录",
    signUp: "创建账号",
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
    signedIn: "已登录。",
    signedUp: "账号已创建。如项目启用了邮箱确认，请先确认邮件，再用密码登录。",
    emailConfirmation: "需要先确认邮箱。请打开确认邮件后，再用密码登录。",
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
  if (normalized.includes("email not confirmed") || normalized.includes("confirm")) return copy.emailConfirmation;
  return message;
}

export function CloudSyncPanel({ language, variant = "dashboard" }: { language: AppLanguage; variant?: Variant }) {
  const {
    cloudSync,
    signInCloudSync,
    signUpCloudSync,
    signOutCloudSync,
    backupToCloud,
    restoreFromCloud,
    refreshCloudSync,
  } = useAppStore();
  const copy = TEXT[language];
  const [email, setEmail] = useState(cloudSync.email ?? "");
  const [password, setPassword] = useState("");
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

  const submitSignIn = (event: FormEvent) => {
    event.preventDefault();
    void run(() => signInCloudSync(email, password), copy.signedIn);
  };

  const createAccount = () => {
    void run(() => signUpCloudSync(email, password), copy.signedUp);
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
        <form className="grid gap-3" onSubmit={submitSignIn}>
          <label className="grid gap-1 text-xs font-semibold">
            <span className={mutedClass}>{copy.email}</span>
            <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            <span className={mutedClass}>{copy.password}</span>
            <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
          </label>
          <button className={primaryClass} disabled={busy || !email.trim() || !password}>{copy.signIn}</button>
          <button type="button" className={secondaryClass} disabled={busy || !email.trim() || !password} onClick={createAccount}>{copy.signUp}</button>
          {message ? <p className={`rounded-xl px-3 py-2 text-xs leading-5 ${message.tone === "error" ? "bg-[var(--danger-bg)] text-[var(--danger-text)]" : mutedClass}`} role="status">{message.text}</p> : null}
          {cloudSync.error ? <p className="rounded-xl bg-[var(--danger-bg)] px-3 py-2 text-xs leading-5 text-[var(--danger-text)]" role="alert">{formatCloudSyncError(new Error(cloudSync.error), copy)}</p> : null}
        </form>
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
