"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  AdminDashboardSnapshot,
  AdminQuestion,
  AdminQuestionStatus,
} from "@/lib/admin/dashboard";
import { displayQuestionPrompt } from "@/lib/content/question-prompt";
import type { EditableQuestionContent } from "@/lib/content/question-overrides";
import type {
  AiUsageSummary,
  ContentGenerationJobSummary,
  GeminiUsageSummary,
  PracticeAccount,
} from "@/lib/practice/cloud-server";
import { parseProgress } from "@/lib/practice/scheduler";

const PROGRESS_STORAGE_KEY = "cpp-recall:progress:v1";

const statusLabels: Record<AdminQuestionStatus, string> = {
  active: "Đang dùng",
  pending: "Chờ duyệt",
  stale: "Nguồn đã đổi",
  archived: "Đã lưu trữ",
};

const standardLabels = {
  cpp98: "C++98",
  cpp11: "C++11",
  cpp20: "C++20",
  python3: "Python 3",
  cmake: "CMake",
};
const learningLabels = {
  new: "Mới",
  learning: "Đang học",
  review: "Ôn tập",
  relearning: "Học lại",
} as const;
type ScheduleAction = "suspend" | "unsuspend" | "reset" | "reschedule";

export function AdminDashboard({
  account,
  aiUsage,
  geminiUsage,
  initialGeminiFallbackEnabled,
  initialGenerationJobs,
  initialSnapshot,
}: {
  account: PracticeAccount;
  aiUsage: AiUsageSummary | null;
  geminiUsage: GeminiUsageSummary | null;
  initialGeminiFallbackEnabled: boolean;
  initialGenerationJobs: ContentGenerationJobSummary[];
  initialSnapshot: AdminDashboardSnapshot;
}) {
  const [questions, setQuestions] = useState(initialSnapshot.questions);
  const [query, setQuery] = useState("");
  const [deck, setDeck] = useState("all");
  const [standard, setStandard] = useState("all");
  const [status, setStatus] = useState("current");
  const [type, setType] = useState("all");
  const [learningFilter, setLearningFilter] = useState("all");
  const [topic, setTopic] = useState("all");
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [geminiFallbackEnabled, setGeminiFallbackEnabled] = useState(
    initialGeminiFallbackEnabled,
  );
  const [geminiSettingSaving, setGeminiSettingSaving] = useState(false);
  const [generationJobs, setGenerationJobs] = useState(initialGenerationJobs);
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);
  const topics = useMemo(
    () =>
      [
        ...new Set(
          questions
            .filter(
              (question) =>
                deck === "all" || question.taxonomy.deckId === deck,
            )
            .flatMap((question) => question.taxonomy.topics),
        ),
      ].sort(),
    [deck, questions],
  );

  const filteredQuestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return questions.filter((question) => {
      const matchesQuery =
        !normalized ||
        question.id.includes(normalized) ||
        question.prompt.toLowerCase().includes(normalized) ||
        question.lessonTitle.toLowerCase().includes(normalized) ||
        question.knowledgePath.toLowerCase().includes(normalized) ||
        question.taxonomy.tags.some((tag) => tag.includes(normalized));
      const matchesLearning =
        learningFilter === "all" ||
        (learningFilter === "suspended"
          ? question.learning.suspended
          : learningFilter === "leech"
            ? question.learning.leech
            : learningFilter === "due"
              ? !question.learning.suspended &&
                question.learning.state !== "new" &&
                question.learning.dueOn !== null &&
                question.learning.dueOn <= initialSnapshot.today
              : question.learning.state === learningFilter &&
                !question.learning.suspended);
      return (
        matchesQuery &&
        (deck === "all" || question.taxonomy.deckId === deck) &&
        (standard === "all" || question.standard === standard) &&
        (status === "all" ||
          (status === "current"
            ? question.adminStatus !== "archived"
            : question.adminStatus === status)) &&
        (type === "all" || question.type === type) &&
        (topic === "all" || question.taxonomy.topics.includes(topic)) &&
        matchesLearning
      );
    });
  }, [deck, initialSnapshot.today, learningFilter, query, questions, standard, status, topic, type]);

  const reviewQueue = questions.filter(
    (question) =>
      (deck === "all" || question.taxonomy.deckId === deck) &&
      (question.adminStatus === "pending" || question.adminStatus === "stale"),
  );
  const activeCount = questions.filter(
    (question) => question.adminStatus === "active",
  ).length;
  const staleCount = questions.filter(
    (question) => question.adminStatus === "stale",
  ).length;
  const currentDueCount = questions.filter(
    (question) =>
      question.adminStatus === "active" &&
      !question.learning.suspended &&
      question.learning.state !== "new" &&
      question.learning.dueOn !== null &&
      question.learning.dueOn <= initialSnapshot.today,
  ).length;
  const practicedCount = questions.filter(
    (question) => question.reviewHistory.length > 0,
  ).length;
  const totalReviewCount = questions.reduce(
    (total, question) => total + question.reviewHistory.length,
    0,
  );
  const lessonCoverage = initialSnapshot.lessons.map((lesson) => ({
    ...lesson,
    currentQuestions: questions.filter(
      (question) =>
        question.lessonId === lesson.id &&
        question.adminStatus !== "archived",
    ).length,
    activeQuestions: questions.filter(
      (question) =>
        question.lessonId === lesson.id && question.adminStatus === "active",
    ).length,
  }));
  const uncovered = lessonCoverage.filter(
    (lesson) => lesson.currentQuestions === 0,
  );

  async function approve(questionIds: string[]) {
    const selected = questions.filter(
      (question) =>
        questionIds.includes(question.id) &&
        (question.adminStatus === "pending" || question.adminStatus === "stale"),
    );
    if (!selected.length) return;

    setSavingIds(new Set(selected.map((question) => question.id)));
    setNotice(null);
    try {
      const response = await fetch("/api/questions/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: selected.map((question) => ({
            questionId: question.id,
            questionVersion: question.version,
            sourceHash: question.sourceHash,
          })),
        }),
      });
      if (!response.ok) throw new Error("approval failed");
      const selectedIds = new Set(selected.map((question) => question.id));
      setQuestions((current) =>
        current.map((question) =>
          selectedIds.has(question.id)
            ? { ...question, approved: true, adminStatus: "active" }
            : question,
        ),
      );
      setNotice(`Đã duyệt ${selected.length} câu hỏi.`);
    } catch {
      setNotice("Chưa duyệt được. Tải lại trang và kiểm tra kết nối Supabase.");
    } finally {
      setSavingIds(new Set());
    }
  }

  async function toggleGeminiFallback() {
    const nextValue = !geminiFallbackEnabled;
    setGeminiSettingSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiFallbackEnabled: nextValue }),
      });
      const payload = (await response.json()) as {
        geminiFallbackEnabled?: boolean;
        error?: string;
      };
      if (!response.ok || payload.geminiFallbackEnabled === undefined) {
        throw new Error(payload.error || "Không lưu được cấu hình Gemini.");
      }
      setGeminiFallbackEnabled(payload.geminiFallbackEnabled);
      setNotice(
        payload.geminiFallbackEnabled
          ? "Đã bật Gemini Free fallback."
          : "Đã tắt Gemini Free fallback.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Không lưu được cấu hình Gemini fallback.",
      );
    } finally {
      setGeminiSettingSaving(false);
    }
  }

  async function retryGenerationJob(jobId: number) {
    setRetryingJobId(jobId);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const payload = (await response.json()) as { status?: string; error?: string };
      if (!response.ok || payload.status !== "pending") {
        throw new Error(payload.error || "Không retry được generation job.");
      }
      setGenerationJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? { ...job, status: "pending", attemptCount: 0, lastError: null }
            : job,
        ),
      );
      setNotice("Đã đưa job về pending; workflow kế tiếp sẽ chạy lại.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Không retry được generation job.",
      );
    } finally {
      setRetryingJobId(null);
    }
  }

  async function manageSchedule(
    question: AdminQuestion,
    action: ScheduleAction,
    dueOn?: string,
  ) {
    setSavingIds(new Set([question.id]));
    setNotice(null);
    try {
      const response = await fetch("/api/admin/question-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, action, dueOn }),
      });
      const payload = (await response.json()) as {
        learning?: AdminQuestion["learning"];
        reviewHistory?: AdminQuestion["reviewHistory"];
        error?: string;
      };
      if (!response.ok || !payload.learning || !payload.reviewHistory) {
        throw new Error(payload.error || "Không cập nhật được lịch học.");
      }
      setQuestions((current) =>
        current.map((item) =>
          item.id === question.id
            ? {
                ...item,
                learning: payload.learning!,
                reviewHistory: payload.reviewHistory!,
              }
            : item,
        ),
      );
      if (action === "reset") {
        try {
          const local = parseProgress(
            window.localStorage.getItem(PROGRESS_STORAGE_KEY),
          );
          window.localStorage.setItem(
            PROGRESS_STORAGE_KEY,
            JSON.stringify({
              ...local,
              reviews: local.reviews.filter(
                (review) => review.questionId !== question.id,
              ),
            }),
          );
        } catch {
          // The cloud reset cutoff prevents stale history from returning later.
        }
      }
      const actionLabel = {
        suspend: "tạm dừng",
        unsuspend: "tiếp tục",
        reset: "đặt lại thành câu mới",
        reschedule: `đổi hạn sang ${dueOn}`,
      }[action];
      setNotice(`Đã ${actionLabel} câu ${question.id}.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Không cập nhật được lịch học.",
      );
    } finally {
      setSavingIds(new Set());
    }
  }

  async function mutateQuestion(
    question: AdminQuestion,
    action: "edit" | "archive" | "restore",
    content?: EditableQuestionContent,
  ) {
    setSavingIds(new Set([question.id]));
    setNotice(null);
    try {
      const response = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, questionId: question.id, content }),
      });
      const payload = (await response.json()) as {
        question?: Pick<
          AdminQuestion,
          | "id"
          | "type"
          | "responseMode"
          | "difficulty"
          | "estimatedMinutes"
          | "prompt"
          | "code"
          | "hint"
          | "answer"
          | "rubric"
          | "sources"
          | "sourceHash"
          | "status"
          | "version"
          | "taxonomy"
        >;
        approved?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.question || payload.approved === undefined) {
        throw new Error(payload.error || "Không lưu được thay đổi câu hỏi.");
      }
      const changedVersion = payload.question.version !== question.version;
      setQuestions((current) =>
        current.map((item) =>
          item.id === question.id
            ? {
                ...item,
                ...payload.question!,
                approved: payload.approved!,
                adminStatus: clientAdminStatus(
                  payload.question!.status,
                  payload.approved!,
                ),
                learning: changedVersion
                  ? {
                      ...item.learning,
                      questionVersion: payload.question!.version,
                      sourceHash: payload.question!.sourceHash,
                      state: item.reviewHistory.length ? "learning" : "new",
                      dueOn: null,
                      intervalDays: 0,
                      contentChanged: item.reviewHistory.length > 0,
                    }
                  : item.learning,
                archivedByOwner:
                  action === "archive"
                    ? true
                    : action === "restore"
                      ? false
                      : item.archivedByOwner,
              }
            : item,
        ),
      );
      const actionLabel = {
        edit: "Đã lưu bản sửa; câu hỏi được đưa lại vào queue để duyệt.",
        archive: "Đã archive; lịch sử ôn và AI attempt vẫn được giữ.",
        restore: "Đã khôi phục câu hỏi vào ngân hàng.",
      }[action];
      setNotice(`${actionLabel} (${question.id})`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Không lưu được thay đổi câu hỏi.";
      setNotice(message);
      throw error;
    } finally {
      setSavingIds(new Set());
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173f35]/15 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#173f35] font-mono text-sm font-bold text-[#d7ff91]">
              R
            </div>
            <div>
              <p className="text-lg font-bold">Recall Admin</p>
              <p className="text-xs text-[#64736c]">Content & learning operations</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link className="rounded-xl px-4 py-2 text-sm font-bold hover:bg-white/60" href="/stats">
              Thống kê
            </Link>
            <Link className="rounded-xl px-4 py-2 text-sm font-bold hover:bg-white/60" href="/">
              Luyện tập
            </Link>
            <span className="rounded-full border border-[#173f35]/15 bg-white/65 px-4 py-2 text-xs font-semibold">
              @{account.login ?? account.displayName}
            </span>
            <form action="/auth/logout" method="post">
              <button className="rounded-xl border border-[#173f35]/15 bg-white/70 px-4 py-2 text-sm font-bold hover:border-[#ba4b2f]/40">
                Đăng xuất
              </button>
            </form>
          </nav>
        </header>

        <section className="py-9">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">
            Tổng quan
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Quản lý Recall
              </h1>
              <p className="mt-3 text-[#64736c]">
                Revision <span className="font-mono">{initialSnapshot.sourceRevision.slice(0, 10)}</span>
              </p>
            </div>
          </div>
          {notice ? (
            <p className="mt-4 rounded-2xl border border-[#173f35]/15 bg-white/65 px-4 py-3 text-sm font-semibold">
              {notice}
            </p>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Nguồn tri thức" value={initialSnapshot.metrics.lessons} detail={`${uncovered.length} bài chưa có câu hiện tại`} tone="dark" />
          <MetricCard label="Ngân hàng câu hỏi" value={questions.filter((item) => item.status !== "archived").length} detail={`${activeCount} câu đang dùng`} />
          <MetricCard label="Review queue" value={reviewQueue.length} detail={`${staleCount} câu cần rà lại nguồn`} tone={reviewQueue.length ? "warning" : "default"} />
          <MetricCard label="Lượt ôn đã lưu" value={totalReviewCount} detail={`${practicedCount} câu đã từng luyện`} />
          <MetricCard
            label="AI web tháng này"
            value={`$${((aiUsage?.actualUsdMicros ?? 0) / 1_000_000).toFixed(3)}`}
            detail={`${aiUsage?.requestCount ?? 0} lượt web · OpenAI Billing + realtime`}
            tone={(aiUsage?.actualUsdMicros ?? 0) >= 4_000_000 ? "warning" : "default"}
          />
          <MetricCard
            label="Gemini fallback hôm nay"
            value={geminiUsage?.requestCount ?? 0}
            detail={`${geminiUsage?.totalTokens ?? 0} token · ${geminiUsage?.lastModel ?? "chưa dùng"}`}
          />
        </section>

        <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#173f35]/15 bg-white/65 px-5 py-4">
          <div>
            <p className="text-sm font-bold">Gemini Free fallback</p>
            <p className="mt-1 text-xs leading-5 text-[#64736c]">
              Chỉ dùng khi quota ngày/tháng của OpenAI đã hết; không dùng cho lỗi OpenAI thông thường.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={geminiFallbackEnabled}
            disabled={geminiSettingSaving}
            onClick={() => void toggleGeminiFallback()}
            className={`rounded-full px-4 py-2 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${
              geminiFallbackEnabled
                ? "bg-[#173f35] text-white"
                : "border border-[#173f35]/20 bg-white text-[#52645c]"
            }`}
          >
            {geminiSettingSaving
              ? "Đang lưu…"
              : geminiFallbackEnabled
                ? "Đang bật"
                : "Đang tắt"}
          </button>
        </section>

        <details className="group mt-4 overflow-hidden rounded-2xl border border-[#173f35]/15 bg-white/65">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-bold">DB-native generation pipeline</p>
              <p className="mt-1 text-xs text-[#64736c]">
                {generationJobs.filter((job) => ["pending", "running", "deferred"].includes(job.status)).length} job đang chờ/chạy · {generationJobs.filter((job) => ["failed", "dead_letter"].includes(job.status)).length} job cần xử lý
              </p>
            </div>
            <span className="text-xs font-bold text-[#356b58]">
              <span className="group-open:hidden">Xem pipeline ↓</span>
              <span className="hidden group-open:inline">Thu gọn ↑</span>
            </span>
          </summary>
          <div className="border-t border-[#173f35]/10 px-5 py-4">
            <div className="space-y-2">
              {generationJobs.slice(0, 20).map((job) => {
                const retryable = ["deferred", "failed", "dead_letter"].includes(job.status);
                const errorCode = typeof job.lastError?.code === "string"
                  ? job.lastError.code
                  : null;
                return (
                  <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#173f35]/10 bg-white/70 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-bold">#{job.id} · {job.lessonId}</p>
                      <p className="mt-1 text-xs text-[#64736c]">
                        {job.status} · lần {job.attemptCount}/5 · {job.provider}/{job.model}
                        {errorCode ? ` · ${errorCode}` : ""}
                      </p>
                    </div>
                    {retryable ? (
                      <button
                        type="button"
                        disabled={retryingJobId !== null}
                        onClick={() => void retryGenerationJob(job.id)}
                        className="rounded-xl border border-[#ba4b2f]/25 bg-white px-3 py-2 text-xs font-bold text-[#8e3825] disabled:opacity-50"
                      >
                        {retryingJobId === job.id ? "Đang retry…" : "Retry"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {!generationJobs.length ? (
                <p className="rounded-xl border border-dashed border-[#173f35]/15 px-4 py-6 text-center text-sm text-[#64736c]">
                  Chưa có generation job; lesson mới hoặc đổi nguồn sẽ tự tạo job.
                </p>
              ) : null}
            </div>
          </div>
        </details>

        <details className="group mt-8 overflow-hidden rounded-[2rem] border border-[#ba4b2f]/20 bg-[#fff7e8]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:px-7 sm:py-6">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#ffe0a8] font-mono text-sm font-bold text-[#8e3825]">
                {reviewQueue.length}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#ba4b2f] uppercase">
                  Review queue
                </p>
                <h2 className="mt-1 truncate text-xl font-semibold">
                  Danh sách chờ duyệt
                </h2>
              </div>
            </div>
            <span className="shrink-0 text-xs font-bold text-[#356b58]">
              <span className="group-open:hidden">Xem danh sách ↓</span>
              <span className="hidden group-open:inline">Thu gọn ↑</span>
            </span>
          </summary>

          <div className="border-t border-[#ba4b2f]/15 px-5 py-6 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-2xl text-sm text-[#64736c]">
                Mở từng câu để đối chiếu đáp án, rubric và nguồn trước khi đưa vào lịch luyện.
              </p>
              {reviewQueue.length ? (
                <button
                  type="button"
                  onClick={() => void approve(reviewQueue.map((question) => question.id))}
                  disabled={savingIds.size > 0}
                  className="rounded-xl border border-[#ba4b2f]/35 bg-white/70 px-4 py-2.5 text-xs font-bold text-[#8e3825] transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
                >
                  {savingIds.size ? "Đang duyệt…" : `Duyệt tất cả (${reviewQueue.length})`}
                </button>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {reviewQueue.map((question) => (
                <QueueReviewCard
                  key={question.id}
                  question={question}
                  saving={savingIds.has(question.id)}
                  onApprove={() => void approve([question.id])}
                />
              ))}
              {!reviewQueue.length ? (
                <div className="rounded-2xl border border-dashed border-[#356b58]/25 bg-white/45 px-5 py-10 text-center text-sm text-[#52645c] lg:col-span-2">
                  Queue đã sạch — không có câu nào cần duyệt.
                </div>
              ) : null}
            </div>
          </div>
        </details>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-[2rem] border border-[#173f35]/15 bg-white/65 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-bold tracking-[0.16em] text-[#356b58] uppercase">
                  Question bank
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Ngân hàng câu hỏi</h2>
              </div>
              <span className="font-mono text-xs text-[#64736c]">
                {filteredQuestions.length}/{questions.length} câu
              </span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm câu hỏi, bài học…"
                className="rounded-xl border border-[#173f35]/15 bg-white px-4 py-2.5 text-sm outline-none focus:ring-3 focus:ring-[#d7ff91] md:col-span-2 xl:col-span-1"
              />
              <Filter value={deck} onChange={(value) => {
                setDeck(value);
                setStandard("all");
                setTopic("all");
              }} label="Deck" options={[["all", "Mọi deck"], ["cpp-interview", "C++ Interview"], ["python-interview", "Python Interview"]]} />
              <Filter value={standard} onChange={setStandard} label="Track" options={[['all', 'Mọi track'], ['cpp98', 'C++98'], ['cpp11', 'C++11'], ['cpp20', 'C++20'], ['python3', 'Python 3']]} />
              <Filter value={status} onChange={setStatus} label="Trạng thái" options={[['current', 'Chưa archive'], ['all', 'Mọi trạng thái'], ['active', 'Đang dùng'], ['pending', 'Chờ duyệt'], ['stale', 'Nguồn đã đổi'], ['archived', 'Đã lưu trữ']]} />
              <Filter value={type} onChange={setType} label="Loại câu" options={[['all', 'Mọi loại'], ['recall', 'Recall'], ['code_reasoning', 'Code reasoning'], ['pitfall', 'Pitfall'], ['scenario', 'Scenario']]} />
              <Filter value={learningFilter} onChange={setLearningFilter} label="Trạng thái học" options={[['all', 'Mọi trạng thái học'], ['new', 'Mới'], ['learning', 'Đang học'], ['review', 'Ôn tập'], ['relearning', 'Học lại'], ['due', 'Đến hạn'], ['suspended', 'Tạm dừng'], ['leech', 'Leech']]} />
              <Filter value={topic} onChange={setTopic} label="Topic" options={[['all', 'Mọi topic'], ...topics.map((item): [string, string] => [item, item])]} />
            </div>

            <div className="mt-6 space-y-3">
              {filteredQuestions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  saving={savingIds.has(question.id)}
                  onApprove={() => void approve([question.id])}
                  onManage={(action, dueOn) =>
                    void manageSchedule(question, action, dueOn)
                  }
                  onMutate={(action, content) =>
                    mutateQuestion(question, action, content)
                  }
                />
              ))}
              {!filteredQuestions.length ? (
                <div className="rounded-2xl border border-dashed border-[#173f35]/20 px-5 py-10 text-center text-sm text-[#64736c]">
                  Không có câu hỏi khớp bộ lọc.
                </div>
              ) : null}
            </div>
          </div>

          <aside className="space-y-5">
            <CoveragePanel lessons={lessonCoverage} />
            <div className="rounded-[2rem] bg-[#173f35] p-6 text-white">
              <p className="font-mono text-xs font-bold tracking-[0.16em] text-[#d7ff91] uppercase">
                Learning health
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SmallStat label="Đến hạn" value={currentDueCount} />
                <SmallStat label="Đã luyện" value={practicedCount} />
                <SmallStat label="Chưa nhớ" value={initialSnapshot.ratingCounts.again} />
                <SmallStat label="Khó" value={initialSnapshot.ratingCounts.hard} />
              </div>
            </div>
            <div className="rounded-[2rem] border border-[#173f35]/15 bg-white/65 p-6">
              <p className="font-mono text-xs font-bold tracking-[0.16em] text-[#ba4b2f] uppercase">
                Operations
              </p>
              <div className="mt-4 grid gap-2 text-sm font-bold">
                <a className="rounded-xl bg-white px-4 py-3 hover:bg-[#edf0e8]" href="https://github.com/tuanotuan/modern-cpp-features/actions" target="_blank" rel="noreferrer">GitHub Actions ↗</a>
                <a className="rounded-xl bg-white px-4 py-3 hover:bg-[#edf0e8]" href="https://github.com/tuanotuan/modern-cpp-features" target="_blank" rel="noreferrer">Source repository ↗</a>
              </div>
              <p className="mt-4 text-xs leading-5 text-[#64736c]">
                Bản sửa và archive được lưu như overlay trong Supabase. Note và câu gốc trên GitHub vẫn giữ nguyên để đối chiếu.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function QueueReviewCard({ question, saving, onApprove }: { question: AdminQuestion; saving: boolean; onApprove: () => void }) {
  return (
    <article className="rounded-2xl border border-[#173f35]/12 bg-white/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={question.adminStatus} />
          <span className="rounded-full bg-[#edf0e8] px-2.5 py-1 font-mono text-[10px] font-bold uppercase">
            {standardLabels[question.standard]}
          </span>
          <span className="rounded-full bg-[#edf0e8] px-2.5 py-1 font-mono text-[10px] font-bold uppercase">
            {question.type.replace("_", " ")}
          </span>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={onApprove}
          className="rounded-xl bg-[#ba4b2f] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#963a25] disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Đang duyệt…" : "Duyệt câu này"}
        </button>
      </div>
      <h3 className="mt-4 font-semibold leading-6">
        {displayQuestionPrompt(question)}
      </h3>
      <p className="mt-2 font-mono text-[11px] text-[#718078]">
        {question.id} · {question.lessonTitle}
      </p>
      <details className="group mt-4 border-t border-[#173f35]/10 pt-4">
        <summary className="cursor-pointer list-none text-xs font-bold text-[#356b58]">
          <span className="group-open:hidden">Xem đáp án, rubric và nguồn ↓</span>
          <span className="hidden group-open:inline">Thu gọn ↑</span>
        </summary>
        <div className="mt-4">
          <QuestionDetails question={question} />
        </div>
      </details>
    </article>
  );
}

function QuestionCard({
  question,
  saving,
  onApprove,
  onManage,
  onMutate,
}: {
  question: AdminQuestion;
  saving: boolean;
  onApprove: () => void;
  onManage: (action: ScheduleAction, dueOn?: string) => void;
  onMutate: (
    action: "edit" | "archive" | "restore",
    content?: EditableQuestionContent,
  ) => Promise<void>;
}) {
  const reviewable = question.adminStatus === "pending" || question.adminStatus === "stale";
  const [dueOn, setDueOn] = useState(
    question.learning.dueOn ?? new Date().toISOString().slice(0, 10),
  );
  const [editing, setEditing] = useState(false);
  return (
    <details className="group rounded-2xl border border-[#173f35]/12 bg-white/75 open:border-[#356b58]/35">
      <summary className="flex list-none cursor-pointer items-start justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={question.adminStatus} />
            <LearningBadge question={question} />
            <span className="rounded-full bg-[#edf0e8] px-2.5 py-1 font-mono text-[10px] font-bold uppercase">{standardLabels[question.standard]}</span>
            <span className="rounded-full bg-[#edf0e8] px-2.5 py-1 font-mono text-[10px] font-bold uppercase">{question.type.replace('_', ' ')}</span>
          </div>
          <h3 className="mt-3 font-semibold leading-6">
            {displayQuestionPrompt(question)}
          </h3>
          <p className="mt-2 truncate font-mono text-[11px] text-[#718078]">{question.id} · {question.lessonTitle}</p>
        </div>
        <span className="mt-1 text-xl text-[#64736c] transition group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-[#173f35]/10 px-4 py-5 sm:px-5">
        <QuestionDetails question={question} />
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#173f35]/10 pt-4">
          {reviewable ? <button type="button" disabled={saving} onClick={onApprove} className="rounded-xl bg-[#ba4b2f] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? "Đang duyệt…" : "Duyệt câu này"}</button> : null}
          {question.adminStatus === "active" ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onManage(question.learning.suspended ? "unsuspend" : "suspend")
                }
                className="rounded-xl border border-[#173f35]/20 bg-white px-3 py-2 text-xs font-bold text-[#356b58] disabled:opacity-50"
              >
                {question.learning.suspended ? "Tiếp tục" : "Tạm dừng"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (
                    window.confirm(
                      "Đặt câu này về New và xóa toàn bộ lịch sử review của riêng câu này?",
                    )
                  ) {
                    onManage("reset");
                  }
                }}
                className="rounded-xl border border-[#ba4b2f]/25 bg-white px-3 py-2 text-xs font-bold text-[#8e3825] disabled:opacity-50"
              >
                Reset thành New
              </button>
              {question.learning.state !== "new" ? (
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <input
                    type="date"
                    value={dueOn}
                    onChange={(event) => setDueOn(event.target.value)}
                    className="rounded-xl border border-[#173f35]/15 bg-white px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={saving || !dueOn}
                    onClick={() => onManage("reschedule", dueOn)}
                    className="rounded-xl bg-[#173f35] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Đổi hạn
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {question.adminStatus !== "archived" ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing((current) => !current)}
                className="rounded-xl border border-[#173f35]/20 bg-white px-3 py-2 text-xs font-bold text-[#356b58] disabled:opacity-50"
              >
                {editing ? "Đóng form sửa" : "Chỉnh sửa"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (
                    window.confirm(
                      "Archive câu hỏi này? Nó sẽ biến mất khỏi lịch luyện nhưng lịch sử ôn và AI attempt vẫn được giữ.",
                    )
                  ) {
                    void onMutate("archive");
                  }
                }}
                className="rounded-xl border border-[#ba4b2f]/30 bg-white px-3 py-2 text-xs font-bold text-[#8e3825] disabled:opacity-50"
              >
                Xóa (archive)
              </button>
            </>
          ) : question.archivedByOwner ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onMutate("restore")}
              className="rounded-xl bg-[#173f35] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Khôi phục câu hỏi
            </button>
          ) : (
            <span className="rounded-xl bg-[#edf0e8] px-3 py-2 text-xs font-bold text-[#64736c]">
              Archived từ repository
            </span>
          )}
        </div>
        {editing && question.adminStatus !== "archived" ? (
          <QuestionEditor
            question={question}
            saving={saving}
            onCancel={() => setEditing(false)}
            onSave={async (content) => {
              await onMutate("edit", content);
              setEditing(false);
            }}
          />
        ) : null}
      </div>
    </details>
  );
}

function QuestionEditor({
  question,
  saving,
  onCancel,
  onSave,
}: {
  question: AdminQuestion;
  saving: boolean;
  onCancel: () => void;
  onSave: (content: EditableQuestionContent) => Promise<void>;
}) {
  const [type, setType] = useState(question.type);
  const [responseMode, setResponseMode] = useState(
    question.responseMode ?? "text",
  );
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    question.estimatedMinutes,
  );
  const [prompt, setPrompt] = useState(question.prompt);
  const [code, setCode] = useState(question.code ?? "");
  const [hint, setHint] = useState(question.hint);
  const [shortAnswer, setShortAnswer] = useState(question.answer.short);
  const [detailedAnswer, setDetailedAnswer] = useState(
    question.answer.detailed,
  );
  const [required, setRequired] = useState(
    question.rubric.required.join("\n"),
  );
  const [bonus, setBonus] = useState(question.rubric.bonus.join("\n"));
  const [misconceptions, setMisconceptions] = useState(
    question.rubric.misconceptions.join("\n"),
  );

  function lines(value: string) {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return (
    <form
      className="mt-5 rounded-2xl border border-[#356b58]/25 bg-[#f7f9f2] p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          type,
          responseMode,
          difficulty,
          estimatedMinutes,
          prompt,
          code: code.trim() || null,
          hint,
          answer: { short: shortAnswer, detailed: detailedAnswer },
          rubric: {
            required: lines(required),
            bonus: lines(bonus),
            misconceptions: lines(misconceptions),
          },
        }).catch(() => undefined);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#356b58] uppercase">
            Question editor
          </p>
          <p className="mt-1 text-sm text-[#64736c]">
            Lưu sẽ tăng version và yêu cầu duyệt lại câu hỏi.
          </p>
        </div>
        <span className="font-mono text-xs text-[#64736c]">
          v{question.version} → v{question.version + 1}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <EditorSelect
          label="Loại câu"
          value={type}
          onChange={(value) => setType(value as typeof type)}
          options={[
            ["recall", "Recall"],
            ["code_reasoning", "Code reasoning"],
            ["pitfall", "Pitfall"],
            ["scenario", "Scenario"],
          ]}
        />
        <EditorSelect
          label="Cách trả lời"
          value={responseMode}
          onChange={(value) => setResponseMode(value as typeof responseMode)}
          options={[["text", "Text"], ["code", "Code"]]}
        />
        <EditorSelect
          label="Độ khó"
          value={difficulty}
          onChange={(value) => setDifficulty(value as typeof difficulty)}
          options={[["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]]}
        />
        <label className="text-xs font-bold text-[#52645c]">
          Thời gian (phút)
          <input
            type="number"
            min={1}
            max={15}
            value={estimatedMinutes}
            onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
            className="mt-1.5 w-full rounded-xl border border-[#173f35]/15 bg-white px-3 py-2.5 text-sm font-normal"
          />
        </label>
      </div>
      <EditorTextarea label="Đề bài" value={prompt} onChange={setPrompt} rows={4} />
      <EditorTextarea label="Code mẫu (để trống nếu không có)" value={code} onChange={setCode} rows={7} mono required={false} />
      <EditorTextarea label="Gợi ý" value={hint} onChange={setHint} rows={3} />
      <EditorTextarea label="Đáp án ngắn" value={shortAnswer} onChange={setShortAnswer} rows={3} />
      <EditorTextarea label="Giải thích chi tiết" value={detailedAnswer} onChange={setDetailedAnswer} rows={6} />
      <div className="grid gap-3 lg:grid-cols-3">
        <EditorTextarea label="Rubric bắt buộc (mỗi dòng một ý)" value={required} onChange={setRequired} rows={6} />
        <EditorTextarea label="Điểm cộng (mỗi dòng một ý)" value={bonus} onChange={setBonus} rows={6} required={false} />
        <EditorTextarea label="Hiểu lầm thường gặp (mỗi dòng một ý)" value={misconceptions} onChange={setMisconceptions} rows={6} required={false} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-[#173f35]/15 bg-white px-4 py-2 text-xs font-bold disabled:opacity-50">
          Hủy
        </button>
        <button type="submit" disabled={saving || !required.trim()} className="rounded-xl bg-[#173f35] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          {saving ? "Đang lưu…" : "Lưu phiên bản mới"}
        </button>
      </div>
    </form>
  );
}

function EditorTextarea({ label, value, onChange, rows, mono = false, required = true }: { label: string; value: string; onChange: (value: string) => void; rows: number; mono?: boolean; required?: boolean }) {
  return (
    <label className="mt-3 block text-xs font-bold text-[#52645c]">
      {label}
      <textarea required={required} value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className={`mt-1.5 w-full resize-y rounded-xl border border-[#173f35]/15 bg-white px-3 py-2.5 text-sm font-normal leading-6 ${mono ? "font-mono" : ""}`} />
    </label>
  );
}

function EditorSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="text-xs font-bold text-[#52645c]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#173f35]/15 bg-white px-3 py-2.5 text-sm font-normal">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function clientAdminStatus(
  status: AdminQuestion["status"],
  approved: boolean,
): AdminQuestionStatus {
  if (status === "archived") return "archived";
  if (status === "verified" || approved) return "active";
  if (status === "needs_review") return "stale";
  return "pending";
}

function QuestionDetails({ question }: { question: AdminQuestion }) {
  return (
    <>
      {question.code ? (
        <pre className="overflow-x-auto rounded-xl bg-[#10362d] p-4 text-xs leading-6 text-[#e8f4e9]">
          <code>{question.code}</code>
        </pre>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <InfoBlock label="Đáp án ngắn"><p>{question.answer.short}</p></InfoBlock>
        <InfoBlock label="Hint"><p>{question.hint}</p></InfoBlock>
        <InfoBlock label="Giải thích"><p className="whitespace-pre-line">{question.answer.detailed}</p></InfoBlock>
        <InfoBlock label="Rubric"><ul className="list-disc space-y-1 pl-4">{question.rubric.required.map((item) => <li key={item}>{item}</li>)}</ul></InfoBlock>
      </div>
      <p className="mt-4 text-xs text-[#64736c]">
        Nguồn: {question.sourceHeadings.join(" · ")}
      </p>
      <div className="mt-4 rounded-xl border border-[#173f35]/10 bg-white/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-wide text-[#356b58] uppercase">
              Lịch Anki
            </p>
            <p className="mt-1 text-sm font-semibold">
              {learningLabels[question.learning.state]}
              {question.learning.suspended ? " · đang tạm dừng" : ""}
            </p>
          </div>
          <p className="font-mono text-xs text-[#64736c]">
            hạn {question.learning.dueOn ?? "—"} · interval {question.learning.intervalDays}d
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#64736c]">
          <span>{question.learning.reviewCount} lượt ôn</span>
          <span>· {question.learning.lapseCount} lapse</span>
          {question.learning.leech ? <span className="font-bold text-[#ba4b2f]">· Leech</span> : null}
          {question.taxonomy.topics.map((item) => (
            <span key={item} className="rounded-full bg-[#edf0e8] px-2 py-0.5 font-mono">
              {item}
            </span>
          ))}
        </div>
        <details className="mt-4 border-t border-[#173f35]/10 pt-3">
          <summary className="cursor-pointer text-xs font-bold text-[#356b58]">
            Lịch sử trả lời ({question.reviewHistory.length})
          </summary>
          {question.reviewHistory.length ? (
            <ol className="mt-3 max-h-56 space-y-2 overflow-y-auto">
              {question.reviewHistory.map((review) => (
                <li
                  key={`${review.questionId}:${review.reviewedOn}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-[#f3f4ee] px-3 py-2 text-xs"
                >
                  <span>{review.reviewedOn}</span>
                  <strong className="uppercase text-[#356b58]">{review.rating}</strong>
                  <span className="font-mono text-[#64736c]">→ {review.nextDueOn}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs text-[#64736c]">Chưa có lần review nào.</p>
          )}
        </details>
      </div>
    </>
  );
}

function CoveragePanel({ lessons }: { lessons: AdminDashboardSnapshot["lessons"] }) {
  const missing = lessons.filter((lesson) => lesson.currentQuestions === 0);
  const waiting = lessons.filter((lesson) => lesson.currentQuestions > 0 && lesson.activeQuestions === 0);
  return (
    <div className="rounded-[2rem] border border-[#173f35]/15 bg-white/65 p-6">
      <p className="font-mono text-xs font-bold tracking-[0.16em] text-[#356b58] uppercase">Knowledge coverage</p>
      <h2 className="mt-2 text-xl font-semibold">Độ phủ bài học</h2>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#dfe5dc]"><div className="h-full bg-[#7fb43d]" style={{ width: `${lessons.length ? ((lessons.length - missing.length) / lessons.length) * 100 : 0}%` }} /></div>
      <p className="mt-3 text-sm text-[#64736c]">{lessons.length - missing.length}/{lessons.length} bài đã có câu hỏi khớp nguồn.</p>
      {missing.length ? <div className="mt-5"><p className="text-xs font-bold text-[#ba4b2f] uppercase">Chưa có câu ({missing.length})</p><ul className="mt-2 space-y-2 text-sm">{missing.slice(0, 8).map((lesson) => <li key={lesson.id} className="rounded-xl bg-[#fff4df] px-3 py-2"><span className="font-semibold">{lesson.title}</span><span className="ml-2 font-mono text-[10px] text-[#64736c]">{standardLabels[lesson.standard]}</span></li>)}</ul>{missing.length > 8 ? <p className="mt-2 text-xs text-[#64736c]">+{missing.length - 8} bài khác</p> : null}</div> : null}
      {waiting.length ? <p className="mt-4 text-xs text-[#86511f]">{waiting.length} bài đã có draft nhưng chưa được duyệt.</p> : null}
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "default" }: { label: string; value: React.ReactNode; detail: string; tone?: "default" | "dark" | "warning" }) {
  const classes = tone === "dark" ? "bg-[#173f35] text-white" : tone === "warning" ? "bg-[#fff0d2] border border-[#ba4b2f]/20" : "bg-white/65 border border-[#173f35]/15";
  return <div className={`rounded-[1.6rem] p-5 ${classes}`}><p className={`text-xs font-bold uppercase tracking-[0.12em] ${tone === 'dark' ? 'text-[#d7ff91]' : 'text-[#64736c]'}`}>{label}</p><p className="mt-3 text-4xl font-semibold">{value}</p><p className={`mt-2 text-xs ${tone === 'dark' ? 'text-white/65' : 'text-[#64736c]'}`}>{detail}</p></div>;
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-white/10 p-4"><p className="text-2xl font-semibold text-[#d7ff91]">{value}</p><p className="mt-1 text-xs text-white/65">{label}</p></div>;
}

function LearningBadge({ question }: { question: AdminQuestion }) {
  const label = question.learning.suspended
    ? "Tạm dừng"
    : question.learning.leech
      ? "Leech"
      : learningLabels[question.learning.state];
  const classes = question.learning.suspended
    ? "bg-[#e4e6e2] text-[#64736c]"
    : question.learning.state === "relearning" || question.learning.leech
      ? "bg-[#f1d6c9] text-[#8e3825]"
      : question.learning.state === "new"
        ? "bg-[#e8f0ff] text-[#315e91]"
        : "bg-[#e8f3dc] text-[#356b58]";
  return (
    <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${classes}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: AdminQuestionStatus }) {
  const classes = status === "active" ? "bg-[#d7ff91] text-[#356b58]" : status === "pending" ? "bg-[#ffe0a8] text-[#86511f]" : status === "stale" ? "bg-[#f1d6c9] text-[#8e3825]" : "bg-[#e4e6e2] text-[#64736c]";
  return <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${classes}`}>{statusLabels[status]}</span>;
}

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl bg-[#f3f4ee] p-4 text-sm leading-6"><p className="mb-2 font-mono text-[10px] font-bold tracking-[0.12em] text-[#356b58] uppercase">{label}</p>{children}</div>;
}

function Filter({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<[string, string]> }) {
  return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[#173f35]/15 bg-white px-3 py-2.5 text-sm outline-none focus:ring-3 focus:ring-[#d7ff91]">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
