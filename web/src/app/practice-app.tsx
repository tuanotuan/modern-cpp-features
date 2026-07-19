"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { CoachFeedback } from "@/lib/ai/contracts";
import type { Question } from "@/lib/content/schema";
import type { PracticeAccount } from "@/lib/practice/cloud-server";
import {
  buildDailyQueue,
  calculateStreak,
  latestReviews,
  localDateKey,
  mergeProgress,
  parseProgress,
  recordReview,
  reviewsForCloudSync,
  type PracticeProgress,
  type Rating,
  type Review,
} from "@/lib/practice/scheduler";

const STORAGE_KEY = "cpp-recall:progress:v1";
const EMPTY_SNAPSHOT = "__empty__";
const storageListeners = new Set<() => void>();
type SyncStatus = "local" | "syncing" | "synced" | "error";

const ratingOptions: Array<{
  value: Rating;
  label: string;
  interval: string;
  tone: string;
}> = [
  { value: "again", label: "Chưa nhớ", interval: "1 ngày", tone: "red" },
  { value: "hard", label: "Khó", interval: "2 ngày", tone: "orange" },
  { value: "good", label: "Ổn", interval: "4 ngày", tone: "green" },
  { value: "easy", label: "Dễ", interval: "7 ngày", tone: "lime" },
];

const standardLabels = {
  cpp98: "C++98",
  cpp11: "C++11",
  cpp20: "C++20",
} as const;

export type PracticeQuestion = Question & {
  lessonTitle: string;
  standard: keyof typeof standardLabels;
  sourcePath: string;
  sourceSections: Array<{
    id: string;
    heading: string;
    excerpt: string;
  }>;
};

function subscribeToProgress(callback: () => void) {
  storageListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    storageListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getProgressSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT;
}

function getServerProgressSnapshot() {
  return null;
}

function saveProgress(raw: string) {
  window.localStorage.setItem(STORAGE_KEY, raw);
  storageListeners.forEach((listener) => listener());
}

export function PracticeApp({
  questions,
  sourceCommitSha,
  cloudEnabled,
  account,
  initialCloudProgress,
  cloudSetupError,
  authNotice,
}: {
  questions: PracticeQuestion[];
  sourceCommitSha: string;
  cloudEnabled: boolean;
  account: PracticeAccount | null;
  initialCloudProgress: PracticeProgress;
  cloudSetupError: boolean;
  authNotice: string | null;
}) {
  const snapshot = useSyncExternalStore(
    subscribeToProgress,
    getProgressSnapshot,
    getServerProgressSnapshot,
  );
  const progress = useMemo(
    () => parseProgress(snapshot === EMPTY_SNAPSHOT ? null : snapshot),
    [snapshot],
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [hints, setHints] = useState<Set<string>>(() => new Set());
  const [showSource, setShowSource] = useState(false);
  const [coachFeedback, setCoachFeedback] = useState<Record<string, CoachFeedback>>(
    {},
  );
  const [coachModels, setCoachModels] = useState<Record<string, string>>({});
  const [coachLoading, setCoachLoading] = useState<string | null>(null);
  const [coachErrors, setCoachErrors] = useState<Record<string, string>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    cloudSetupError ? "error" : account ? "syncing" : "local",
  );
  const initialSyncStarted = useRef(false);

  useEffect(() => {
    if (snapshot === null || !account || initialSyncStarted.current) return;
    initialSyncStarted.current = true;

    const localProgress = parseProgress(
      snapshot === EMPTY_SNAPSHOT ? null : snapshot,
    );
    const merged = mergeProgress(initialCloudProgress, localProgress);
    saveProgress(JSON.stringify(merged));

    void fetch("/api/progress/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviews: reviewsForCloudSync(merged.reviews) }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Cloud sync failed");
        const payload = (await response.json()) as { progress: PracticeProgress };
        const currentLocal = parseProgress(getProgressSnapshot());
        saveProgress(JSON.stringify(mergeProgress(payload.progress, currentLocal)));
        setSyncStatus("synced");
      })
      .catch(() => setSyncStatus("error"));
  }, [account, initialCloudProgress, snapshot]);

  if (snapshot === null) {
    return <LoadingScreen />;
  }

  const today = localDateKey();
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const queue = buildDailyQueue(
    questions.map((question) => question.id),
    progress.reviews,
    today,
  );
  const latest = latestReviews(progress.reviews);
  const remainingIds = queue.filter(
    (questionId) => latest.get(questionId)?.reviewedOn !== today,
  );
  const current = questionById.get(remainingIds[0]);
  const completedToday = new Set(
    progress.reviews
      .filter((review) => review.reviewedOn === today)
      .map((review) => review.questionId),
  ).size;
  const dailyTotal = completedToday + remainingIds.length;
  const streak = calculateStreak(progress.reviews, today);

  function rateCurrent(rating: Rating) {
    if (!current) return;
    const updated = recordReview(progress, current.id, rating, today);
    saveProgress(JSON.stringify(updated));
    setShowSource(false);
    if (account) {
      const newReview = updated.reviews.find(
        (review) =>
          review.questionId === current.id && review.reviewedOn === today,
      );
      if (newReview) void syncReviews([newReview]);
    }
  }

  async function syncReviews(reviews: Review[]) {
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/progress/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviews }),
      });
      if (!response.ok) throw new Error("Cloud sync failed");
      const payload = (await response.json()) as { progress: PracticeProgress };
      const currentLocal = parseProgress(getProgressSnapshot());
      saveProgress(JSON.stringify(mergeProgress(payload.progress, currentLocal)));
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }

  async function askCoach() {
    if (!current) return;
    const answer = answers[current.id]?.trim() ?? "";
    if (answer.length < 10) return;

    setCoachLoading(current.id);
    setCoachErrors((errors) => ({ ...errors, [current.id]: "" }));

    try {
      const response = await fetch("/api/coach/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, answer }),
      });
      const payload = (await response.json()) as {
        feedback?: CoachFeedback;
        model?: string;
        error?: string;
      };

      if (!response.ok || !payload.feedback) {
        throw new Error(payload.error || "AI coach chưa trả lời được.");
      }

      setCoachFeedback((feedback) => ({
        ...feedback,
        [current.id]: payload.feedback!,
      }));
      setCoachModels((models) => ({
        ...models,
        [current.id]: payload.model || "Gemini",
      }));
    } catch (error) {
      setCoachErrors((errors) => ({
        ...errors,
        [current.id]:
          error instanceof Error ? error.message : "AI coach chưa trả lời được.",
      }));
    } finally {
      setCoachLoading(null);
    }
  }

  function updateAnswer(questionId: string, value: string) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: value,
    }));
    setCoachFeedback((currentFeedback) =>
      Object.fromEntries(
        Object.entries(currentFeedback).filter(([id]) => id !== questionId),
      ),
    );
    setCoachErrors((errors) => ({ ...errors, [questionId]: "" }));
  }

  function toggleSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) {
    setter((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173f35]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#173f35] font-mono text-sm font-bold text-[#d7ff91] shadow-sm">
              C++
            </span>
            <div>
              <p className="font-semibold tracking-[-0.02em]">Recall</p>
              <p className="text-xs text-[#64736c]">Interview practice</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <StatPill icon="◆" value={`${streak} ngày`} label="streak" />
            <StatPill
              icon="✓"
              value={`${completedToday}/${dailyTotal || 1}`}
              label="hôm nay"
            />
            <AccountControl
              account={account}
              cloudEnabled={cloudEnabled}
              syncStatus={syncStatus}
            />
          </div>
        </header>

        {authNotice ? (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-[#ba4b2f]/25 bg-[#f8e8df] px-4 py-3 text-sm text-[#8e3825]"
          >
            {authNotice}
          </p>
        ) : null}

        {current ? (
          <div className="grid gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-10">
            <section>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#d7ff91] px-3 py-1 font-mono text-xs font-bold text-[#173f35]">
                    {completedToday === 0 ? "CÂU HÔM NAY" : "ÔN ĐẾN HẠN"}
                  </span>
                  <span className="font-mono text-xs text-[#6c7b73]">
                    {completedToday + 1}/{dailyTotal}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#6c7b73]">{today}</span>
              </div>

              <article className="overflow-hidden rounded-[2rem] border border-[#173f35]/15 bg-white/65 shadow-[0_20px_70px_rgba(23,63,53,0.08)] backdrop-blur-sm">
                <div className="p-6 sm:p-9 lg:p-11">
                  <div className="flex flex-wrap gap-2">
                    <Tag>{standardLabels[current.standard]}</Tag>
                    <Tag>{current.type.replace("_", " ")}</Tag>
                    <Tag>{current.difficulty}</Tag>
                    <Tag>~{current.estimatedMinutes} phút</Tag>
                  </div>

                  <h1 className="mt-7 max-w-4xl text-3xl leading-[1.16] font-semibold tracking-[-0.04em] text-[#17221d] sm:text-4xl lg:text-[2.85rem]">
                    <InlineCode text={current.prompt} />
                  </h1>

                  {current.code ? (
                    <pre className="mt-7 overflow-x-auto rounded-2xl border border-[#d7ff91]/20 bg-[#102d26] p-5 font-mono text-[13px] leading-6 text-[#e8f4ec] shadow-inner sm:text-sm">
                      <code>{current.code}</code>
                    </pre>
                  ) : null}

                  <label
                    className="mt-8 block text-sm font-semibold text-[#344a40]"
                    htmlFor="candidate-answer"
                  >
                    Câu trả lời của mày
                  </label>
                  <textarea
                    id="candidate-answer"
                    value={answers[current.id] ?? ""}
                    onChange={(event) => updateAnswer(current.id, event.target.value)}
                    className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-[#173f35]/20 bg-[#fbfaf5] px-4 py-3 leading-7 outline-none transition focus:border-[#356b58] focus:ring-4 focus:ring-[#d7ff91]/45"
                    placeholder="Tự trả lời như đang ngồi phỏng vấn…"
                  />

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSet(setHints, current.id)}
                      className="rounded-xl px-1 py-2 text-sm font-semibold text-[#356b58] underline-offset-4 hover:underline"
                    >
                      {hints.has(current.id) ? "Ẩn gợi ý" : "Cần một gợi ý?"}
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={askCoach}
                        disabled={
                          (answers[current.id]?.trim().length ?? 0) < 10 ||
                          coachLoading === current.id
                        }
                        className="rounded-xl border border-[#356b58]/25 bg-[#d7ff91] px-5 py-3 text-sm font-bold text-[#173f35] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus:ring-4 focus:ring-[#d7ff91]/60 focus:outline-none"
                      >
                        {coachLoading === current.id ? "AI đang chấm…" : "Nhờ AI chấm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSet(setRevealed, current.id)}
                        className="rounded-xl bg-[#173f35] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#245748] focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
                      >
                        {revealed.has(current.id) ? "Ẩn đáp án" : "Mở đáp án"}
                      </button>
                    </div>
                  </div>

                  {hints.has(current.id) ? (
                    <div className="mt-4 rounded-2xl border border-[#ba4b2f]/20 bg-[#f8e8df] p-4 text-sm leading-6 text-[#713929]">
                      <span className="mr-2 font-mono font-bold">hint:</span>
                      <InlineCode text={current.hint} />
                    </div>
                  ) : null}

                  {coachErrors[current.id] ? (
                    <p
                      className="mt-4 rounded-2xl border border-[#ba4b2f]/25 bg-[#f8e8df] p-4 text-sm text-[#8e3825]"
                      role="alert"
                    >
                      {coachErrors[current.id]}
                    </p>
                  ) : null}

                  {coachFeedback[current.id] ? (
                    <CoachFeedbackPanel
                      feedback={coachFeedback[current.id]}
                      model={coachModels[current.id]}
                    />
                  ) : null}
                </div>

                {revealed.has(current.id) ? (
                  <div className="border-t border-[#173f35]/12 bg-[#edf3e9] p-6 sm:p-9 lg:p-11">
                    <p className="font-mono text-xs font-bold tracking-[0.16em] text-[#356b58] uppercase">
                      Đáp án tham khảo
                    </p>
                    <p className="mt-4 text-lg leading-8 font-medium text-[#213d32]">
                      <InlineCode text={current.answer.short} />
                    </p>
                    <details className="mt-5 rounded-2xl border border-[#173f35]/15 bg-white/60 p-4 open:pb-5">
                      <summary className="cursor-pointer text-sm font-bold text-[#356b58]">
                        Giải thích kỹ hơn
                      </summary>
                      <p className="mt-4 leading-7 text-[#465c52]">
                        <InlineCode text={current.answer.detailed} />
                      </p>
                    </details>

                    <div className="mt-7 grid gap-4 md:grid-cols-2">
                      <RubricList title="Ý chính cần có" items={current.rubric.required} />
                      <RubricList
                        title="Bẫy cần tránh"
                        items={current.rubric.misconceptions}
                        warning
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowSource((visible) => !visible)}
                      className="mt-6 text-sm font-bold text-[#356b58] underline decoration-[#356b58]/35 underline-offset-4"
                    >
                      {showSource ? "Ẩn note nguồn" : "Đối chiếu note nguồn"}
                    </button>
                    {showSource ? <SourceNotes question={current} /> : null}

                    <div className="mt-8 border-t border-[#173f35]/12 pt-7">
                      <p className="text-center text-sm font-semibold text-[#465c52]">
                        So với đáp án, mày nhớ được tới đâu?
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {ratingOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => rateCurrent(option.value)}
                            data-tone={option.tone}
                            className="rating-button rounded-2xl border bg-white/70 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
                          >
                            <span className="block text-sm font-bold">{option.label}</span>
                            <span className="mt-1 block font-mono text-[11px] opacity-65">
                              lại sau {option.interval}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            </section>

            <aside className="space-y-4 lg:pt-12">
              <div className="rounded-3xl bg-[#173f35] p-6 text-white">
                <p className="font-mono text-xs tracking-[0.15em] text-[#d7ff91] uppercase">
                  Tiến độ hôm nay
                </p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-[#d7ff91] transition-all"
                    style={{
                      width: `${dailyTotal ? (completedToday / dailyTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="mt-3 text-sm text-white/65">
                  {remainingIds.length} câu còn lại · tối đa 6 câu/ngày
                </p>
              </div>

              <div className="rounded-3xl border border-[#173f35]/15 bg-white/55 p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">Cloud progress</p>
                  <SyncDot status={syncStatus} />
                </div>
                <p className="mt-2 text-sm leading-6 text-[#64736c]">
                  {account
                    ? syncStatus === "error"
                      ? "Local vẫn an toàn; cloud sẽ thử merge lại ở lần tải sau."
                      : "Đồng bộ private giữa các thiết bị bằng tài khoản GitHub."
                    : cloudEnabled
                      ? "Đăng nhập GitHub để bật đồng bộ nhiều thiết bị."
                      : "Chưa cấu hình Supabase; hiện progress chỉ lưu trên máy này."}
                </p>
              </div>

              <div className="rounded-3xl border border-[#173f35]/15 bg-white/55 p-6">
                <p className="text-xs font-bold tracking-[0.14em] text-[#ba4b2f] uppercase">
                  Chủ đề
                </p>
                <p className="mt-3 text-xl font-semibold tracking-tight">
                  {current.lessonTitle}
                </p>
                <p className="mt-2 font-mono text-xs leading-5 text-[#6c7b73]">
                  {current.sourcePath}
                </p>
              </div>

              <div className="rounded-3xl border border-[#356b58]/20 bg-[#eef4e9] p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">AI coach</p>
                  <span className="size-2 rounded-full bg-[#65a30d] shadow-[0_0_0_4px_rgba(101,163,13,0.12)]" />
                </div>
                <p className="mt-2 text-sm leading-6 text-[#64736c]">
                  Chấm theo đúng rubric và note nguồn, sau đó gợi ý một câu follow-up.
                </p>
                <span className="mt-4 inline-block rounded-full bg-[#d7ff91] px-3 py-1 font-mono text-[11px] font-semibold text-[#356b58]">
                  Gemini 3 Flash · free
                </span>
              </div>
            </aside>
          </div>
        ) : (
          <CompletionScreen
            completedToday={completedToday}
            streak={streak}
            today={today}
          />
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#173f35]/12 py-5 font-mono text-[11px] text-[#78857f]">
          <span>
            {account ? `Private sync · ${account.displayName}` : "Progress lưu trên trình duyệt này"}
          </span>
          <span>notes@{sourceCommitSha.slice(0, 7)}</span>
        </footer>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="text-center">
        <span className="mx-auto grid size-12 animate-pulse place-items-center rounded-2xl bg-[#173f35] font-mono text-sm font-bold text-[#d7ff91]">
          C++
        </span>
        <p className="mt-4 text-sm text-[#64736c]">Đang mở lịch ôn tập…</p>
      </div>
    </main>
  );
}

function CompletionScreen({
  completedToday,
  streak,
  today,
}: {
  completedToday: number;
  streak: number;
  today: string;
}) {
  return (
    <section className="grid min-h-[72vh] place-items-center py-12">
      <div className="max-w-xl text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#d7ff91] text-3xl text-[#173f35]">
          ✓
        </span>
        <p className="mt-7 font-mono text-xs font-bold tracking-[0.16em] text-[#356b58] uppercase">
          {today} · hoàn thành
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
          Xong buổi ôn hôm nay.
        </h1>
        <p className="mt-5 text-lg leading-8 text-[#64736c]">
          {completedToday} câu đã tự chấm. Streak hiện tại là {streak} ngày—mai quay lại
          hệ thống sẽ chọn câu mới và kéo các câu đến hạn lên.
        </p>
      </div>
    </section>
  );
}

function StatPill({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[#173f35]/15 bg-white/55 px-3 py-2">
      <span className="text-[#ba4b2f]">{icon}</span>
      <span className="font-mono text-xs font-bold">{value}</span>
      <span className="hidden text-xs text-[#6c7b73] sm:inline">{label}</span>
    </div>
  );
}

function AccountControl({
  account,
  cloudEnabled,
  syncStatus,
}: {
  account: PracticeAccount | null;
  cloudEnabled: boolean;
  syncStatus: SyncStatus;
}) {
  if (account) {
    return (
      <form action="/auth/logout" method="post">
        <button
          type="submit"
          title="Đăng xuất"
          className="flex items-center gap-2 rounded-full border border-[#173f35]/15 bg-white/65 px-2.5 py-1.5 transition hover:border-[#356b58]/40"
        >
          <span className="grid size-7 place-items-center rounded-full bg-[#173f35] text-xs font-bold text-[#d7ff91]">
            {account.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-28 truncate text-xs font-semibold sm:block">
            {account.login ? `@${account.login}` : account.displayName}
          </span>
          <SyncDot status={syncStatus} />
        </button>
      </form>
    );
  }

  if (cloudEnabled) {
    return (
      <form action="/auth/login" method="post">
        <button
          type="submit"
          className="rounded-full bg-[#173f35] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#245748] focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
        >
          Đăng nhập GitHub
        </button>
      </form>
    );
  }

  return (
    <span className="rounded-full border border-[#173f35]/12 bg-[#e7e3d8] px-3 py-2 font-mono text-[10px] font-semibold text-[#64736c]">
      local only
    </span>
  );
}

function SyncDot({ status }: { status: SyncStatus }) {
  const labels: Record<SyncStatus, string> = {
    local: "Chỉ lưu local",
    syncing: "Đang đồng bộ",
    synced: "Đã đồng bộ",
    error: "Lỗi đồng bộ",
  };

  return (
    <span
      aria-label={labels[status]}
      title={labels[status]}
      data-status={status}
      className="sync-dot inline-block size-2.5 shrink-0 rounded-full"
    />
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[#173f35]/12 bg-[#edf0e8] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#52645c] uppercase">
      {children}
    </span>
  );
}

function InlineCode({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code
        key={`${part}-${index}`}
        className="rounded-md bg-[#173f35]/8 px-1.5 py-0.5 font-mono text-[0.88em] text-[#245748]"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function RubricList({
  title,
  items,
  warning = false,
}: {
  title: string;
  items: string[];
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        warning
          ? "border-[#ba4b2f]/20 bg-[#f8e8df]"
          : "border-[#356b58]/15 bg-[#f8faf5]"
      }`}
    >
      <p className="text-sm font-bold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[#52645c]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className={warning ? "text-[#ba4b2f]" : "text-[#356b58]"}>
              {warning ? "×" : "✓"}
            </span>
            <span><InlineCode text={item} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const verdictLabels: Record<CoachFeedback["verdict"], string> = {
  needs_work: "Cần ôn lại",
  partial: "Đúng một phần",
  solid: "Nắm khá chắc",
  strong: "Trả lời mạnh",
};

const coverageLabels: Record<CoachFeedback["coverage"][number]["status"], string> = {
  missed: "Thiếu",
  partial: "Một phần",
  met: "Đạt",
};

function CoachFeedbackPanel({
  feedback,
  model,
}: {
  feedback: CoachFeedback;
  model?: string;
}) {
  const suggestedRating = ratingOptions.find(
    (option) => option.value === feedback.suggestedRating,
  );

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-[#356b58]/20 bg-[#f6faef] shadow-[0_16px_45px_rgba(23,63,53,0.07)]">
      <div className="grid gap-5 bg-[#173f35] p-6 text-white sm:grid-cols-[6rem_1fr] sm:items-center">
        <div className="grid size-24 place-items-center rounded-full border-4 border-[#d7ff91]/70 bg-white/8">
          <div className="text-center">
            <span className="block font-mono text-3xl font-bold text-[#d7ff91]">
              {feedback.score}
            </span>
            <span className="text-[10px] tracking-wider text-white/55 uppercase">/ 100</span>
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-bold tracking-[0.15em] text-[#d7ff91] uppercase">
              AI interview feedback
            </p>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
              {model || "Gemini"}
            </span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {verdictLabels[feedback.verdict]}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/72">{feedback.summary}</p>
        </div>
      </div>

      <div className="space-y-7 p-6 sm:p-7">
        {feedback.strengths.length ? (
          <div>
            <p className="text-sm font-bold text-[#245748]">Mày làm tốt</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#52645c]">
              {feedback.strengths.map((strength) => (
                <li key={strength} className="flex gap-2">
                  <span className="text-[#65a30d]">✓</span>
                  <span><InlineCode text={strength} /></span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="text-sm font-bold text-[#245748]">Coverage theo rubric</p>
          <div className="mt-3 divide-y divide-[#173f35]/10 rounded-2xl border border-[#173f35]/12 bg-white/65 px-4">
            {feedback.coverage.map((item) => (
              <div key={item.criterion} className="grid gap-2 py-4 sm:grid-cols-[5rem_1fr]">
                <span
                  data-status={item.status}
                  className="coverage-status h-fit w-fit rounded-full px-2.5 py-1 text-[11px] font-bold"
                >
                  {coverageLabels[item.status]}
                </span>
                <div>
                  <p className="text-sm font-semibold leading-6">
                    <InlineCode text={item.criterion} />
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#64736c]">
                    <InlineCode text={item.feedback} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {feedback.corrections.length ? (
          <div className="rounded-2xl border border-[#ba4b2f]/20 bg-[#f8e8df] p-5">
            <p className="text-sm font-bold text-[#8e3825]">Cần sửa</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#713929]">
              {feedback.corrections.map((correction) => (
                <li key={correction} className="flex gap-2">
                  <span>→</span>
                  <span><InlineCode text={correction} /></span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="text-sm font-bold text-[#245748]">Giải thích cho chắc</p>
          <p className="mt-2 leading-7 text-[#52645c]">
            <InlineCode text={feedback.explanation} />
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#e8efe2] p-5">
            <p className="font-mono text-[11px] font-bold tracking-wider text-[#356b58] uppercase">
              Bước tiếp theo
            </p>
            <p className="mt-2 text-sm leading-6 text-[#465c52]">
              <InlineCode text={feedback.nextStep} />
            </p>
          </div>
          <div className="rounded-2xl bg-[#d7ff91]/55 p-5">
            <p className="font-mono text-[11px] font-bold tracking-wider text-[#356b58] uppercase">
              Interviewer hỏi tiếp
            </p>
            <p className="mt-2 text-sm leading-6 font-semibold text-[#29493d]">
              <InlineCode text={feedback.followUpQuestion} />
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-[#6c7b73]">
          AI gợi ý tự chấm: <strong>{suggestedRating?.label}</strong> · hãy tự quyết định sau khi
          đối chiếu đáp án nguồn.
        </p>
      </div>
    </section>
  );
}

function SourceNotes({ question }: { question: PracticeQuestion }) {
  return (
    <div className="mt-4 space-y-3">
      {question.sourceSections.map((section) => (
        <div key={section.id} className="rounded-2xl bg-[#102d26] p-5 text-[#e8f4ec]">
          <p className="font-mono text-xs text-[#d7ff91]">#{section.id}</p>
          <p className="mt-2 font-semibold">{section.heading}</p>
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white/70">
            {section.excerpt}
            {section.excerpt.length === 900 ? "…" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
