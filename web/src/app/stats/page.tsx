import type { Metadata } from "next";
import Link from "next/link";

import manifestJson from "@/generated/content-manifest.json";
import { contentManifestSchema } from "@/lib/content/schema";
import { isQuestionApproved } from "@/lib/practice/approvals";
import { buildPracticeAnalytics } from "@/lib/practice/analytics";
import { loadCloudContext } from "@/lib/practice/cloud-server";
import { buildLearningStates } from "@/lib/practice/learning-state";
import type { Rating } from "@/lib/practice/scheduler";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thống kê học tập — C++ Recall",
  description: "Theo dõi retention, lịch sử ôn và dự báo lịch Anki.",
};

const ratingLabels: Record<Rating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const ratingColors: Record<Rating, string> = {
  again: "bg-[#ba4b2f]",
  hard: "bg-[#d08a36]",
  good: "bg-[#356b58]",
  easy: "bg-[#8ebf3f]",
};

export default async function StatsPage() {
  const cloud = await loadCloudContext();
  if (!cloud.enabled) return <StatsGate mode="not-configured" />;
  if (!cloud.account) return <StatsGate mode="login" />;

  const manifest = contentManifestSchema.parse(manifestJson);
  const questions = manifest.questions.filter(
    (question) =>
      question.status !== "archived" &&
      (question.status === "verified" ||
        isQuestionApproved(question, cloud.approvals)),
  );
  const today = vietnamDateKey();
  const learningStates = buildLearningStates(
    questions.map((question) => ({
      id: question.id,
      version: question.version,
      sourceHash: question.sourceHash,
    })),
    cloud.progress.reviews,
    cloud.questionStates,
  );
  const analytics = buildPracticeAnalytics(
    questions,
    cloud.progress,
    [...learningStates.values()],
    today,
  );
  const activityMax = Math.max(1, ...analytics.activity.map((day) => day.count));
  const forecastMax = Math.max(1, ...analytics.forecast.map((day) => day.count));

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173f35]/15 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#173f35] font-mono text-sm font-bold text-[#d7ff91]">
              C++
            </div>
            <div>
              <p className="text-lg font-bold">Recall Analytics</p>
              <p className="text-xs text-[#64736c]">Anki learning health</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <Link className="rounded-xl px-4 py-2 text-sm font-bold hover:bg-white/60" href="/">
              Luyện tập
            </Link>
            <Link className="rounded-xl px-4 py-2 text-sm font-bold hover:bg-white/60" href="/admin">
              Admin
            </Link>
            <span className="rounded-full border border-[#173f35]/15 bg-white/65 px-4 py-2 text-xs font-semibold">
              @{cloud.account.login ?? cloud.account.displayName}
            </span>
          </nav>
        </header>

        <section className="py-9">
          <p className="font-mono text-xs font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">
            Phase D · Learning analytics
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Sức khỏe bộ câu hỏi
              </h1>
              <p className="mt-3 max-w-2xl leading-7 text-[#64736c]">
                Dựa trên lịch sử rating thật của mày. Không gọi AI và không trừ quota.
              </p>
            </div>
            <p className="font-mono text-xs text-[#64736c]">Cập nhật đến {formatDate(today)}</p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Retention ước tính" value={`${analytics.summary.retentionPercent}%`} note="Hard, Good hoặc Easy" />
          <MetricCard label="Streak hiện tại" value={`${analytics.summary.streak} ngày`} note={`${analytics.summary.studiedDays} ngày từng học`} />
          <MetricCard label="Đã học" value={`${analytics.summary.learnedQuestions}/${questions.length}`} note={`${analytics.summary.matureQuestions} câu mature (≥21 ngày)`} />
          <MetricCard label="Interval trung bình" value={`${analytics.summary.averageIntervalDays} ngày`} note={`${analytics.summary.totalReviews} lượt review tổng cộng`} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <Panel eyebrow="Consistency" title="Hoạt động 28 ngày">
            <div className="mt-6 grid grid-cols-7 gap-2 sm:grid-cols-14">
              {analytics.activity.map((day) => (
                <div key={day.date} className="group relative">
                  <div
                    className="aspect-square rounded-md border border-[#173f35]/8 bg-[#356b58]"
                    style={{ opacity: day.count ? 0.2 + (day.count / activityMax) * 0.8 : 0.06 }}
                    title={`${formatDate(day.date)}: ${day.count} lượt`}
                  />
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#173f35] px-2 py-1 text-[10px] text-white group-hover:block">
                    {day.count} lượt · {formatDate(day.date)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#64736c]">
              <span>Hôm nay: <strong className="text-[#17221d]">{analytics.summary.reviewedToday}</strong></span>
              <span>28 ngày: <strong className="text-[#17221d]">{analytics.activity.reduce((sum, day) => sum + day.count, 0)}</strong></span>
            </div>
          </Panel>

          <Panel eyebrow="Rating mix" title="Mày đang nhớ ở mức nào?">
            <div className="mt-6 space-y-4">
              {(Object.keys(ratingLabels) as Rating[]).map((rating) => {
                const count = analytics.ratingCounts[rating];
                const width = analytics.summary.totalReviews
                  ? (count / analytics.summary.totalReviews) * 100
                  : 0;
                return (
                  <div key={rating}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-semibold">{ratingLabels[rating]}</span>
                      <span className="font-mono text-xs text-[#64736c]">{count} · {Math.round(width)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#173f35]/8">
                      <div className={`h-full rounded-full ${ratingColors[rating]}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel eyebrow="Forecast" title="14 ngày sắp tới">
            <p className="mt-2 text-sm text-[#64736c]">
              {analytics.overdueCount
                ? `${analytics.overdueCount} câu quá hạn được gộp vào hôm nay.`
                : "Không có câu quá hạn."}
            </p>
            <div className="mt-6 flex h-48 items-end gap-2">
              {analytics.forecast.map((day, index) => (
                <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="font-mono text-[10px] text-[#64736c]">{day.count || ""}</span>
                  <div className="flex h-32 w-full items-end rounded-lg bg-[#173f35]/5">
                    <div
                      className="w-full rounded-lg bg-[#356b58] transition-[height]"
                      style={{ height: `${day.count ? Math.max(8, (day.count / forecastMax) * 100) : 0}%` }}
                      title={`${formatDate(day.date)}: ${day.count} câu đến hạn`}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-[#64736c]">{index === 0 ? "nay" : day.date.slice(8)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel eyebrow="Weak spots" title="Chủ đề cần ưu tiên">
            {analytics.weakTopics.length ? (
              <div className="mt-5 space-y-3">
                {analytics.weakTopics.map((topic) => (
                  <div key={topic.topic} className="rounded-2xl border border-[#173f35]/10 bg-white/55 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{humanize(topic.topic)}</p>
                        <p className="mt-1 font-mono text-[10px] text-[#64736c]">{topic.attempts} lượt · {topic.again} Again · {topic.hard} Hard</p>
                      </div>
                      <span className="rounded-full bg-[#f1d6c9] px-3 py-1 font-mono text-xs font-bold text-[#8e3825]">
                        khó {topic.difficultyPercent}%
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#173f35]/8">
                      <div className="h-full rounded-full bg-[#ba4b2f]" style={{ width: `${topic.difficultyPercent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>Chưa đủ lịch sử để xác định chủ đề yếu.</EmptyState>
            )}
          </Panel>
        </section>

        <section className="mt-5">
          <Panel eyebrow="Deck state" title="Phân bố bộ câu hỏi">
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StateCard label="New" value={analytics.stateCounts.new} />
              <StateCard label="Learning" value={analytics.stateCounts.learning} />
              <StateCard label="Review" value={analytics.stateCounts.review} />
              <StateCard label="Relearning" value={analytics.stateCounts.relearning} />
              <StateCard label="Leech" value={analytics.stateCounts.leech} tone="warning" />
              <StateCard label="Suspended" value={analytics.stateCounts.suspended} tone="muted" />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-[#173f35]/12 bg-white/58 p-5 shadow-[0_18px_70px_rgb(23_63_53_/_7%)] sm:p-7">
      <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-[1.75rem] border border-[#173f35]/12 bg-white/62 p-5">
      <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#64736c] uppercase">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-[#64736c]">{note}</p>
    </article>
  );
}

function StateCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" | "muted" }) {
  const toneClass = tone === "warning" ? "bg-[#f1d6c9] text-[#8e3825]" : tone === "muted" ? "bg-[#edf0e8] text-[#64736c]" : "bg-[#eaf8cf] text-[#245748]";
  return (
    <div className={`rounded-2xl p-4 ${toneClass}`}>
      <p className="font-mono text-[10px] font-bold uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 rounded-2xl border border-dashed border-[#173f35]/20 p-6 text-sm text-[#64736c]">{children}</p>;
}

function StatsGate({ mode }: { mode: "login" | "not-configured" }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-lg rounded-[2rem] border border-[#173f35]/15 bg-white/70 p-8 shadow-[0_24px_80px_rgb(23_63_53_/_10%)] sm:p-10">
        <div className="grid size-12 place-items-center rounded-2xl bg-[#173f35] font-mono font-bold text-[#d7ff91]">C++</div>
        <p className="mt-8 font-mono text-xs font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">Learning analytics</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Thống kê riêng của mày</h1>
        <p className="mt-4 leading-7 text-[#64736c]">
          {mode === "login" ? "Đăng nhập GitHub để tải lịch sử ôn đã đồng bộ." : "Supabase chưa được cấu hình nên chưa tải được lịch sử."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {mode === "login" ? (
            <form action="/auth/login?next=/stats" method="post">
              <button className="rounded-2xl bg-[#173f35] px-5 py-3 text-sm font-bold text-white">Đăng nhập GitHub</button>
            </form>
          ) : null}
          <Link href="/" className="rounded-2xl border border-[#173f35]/15 bg-white px-5 py-3 text-sm font-bold">Về trang luyện tập</Link>
        </div>
      </section>
    </main>
  );
}

function vietnamDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function humanize(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
