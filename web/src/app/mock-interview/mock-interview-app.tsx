"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { MonacoCodeEditor } from "@/app/scenario-code-editor";
import type { MockInterviewReport } from "@/lib/mock-interview/contracts";
import {
  mockCompetencyKeys,
  mockCompetencyLabels,
  mockDurationQuestionCounts,
  worldQuantMockSetById,
  worldQuantMockSetsForDuration,
  WORLDQUANT_PROFILE,
  WORLDQUANT_ROLE_QUESTIONS,
  type MockCompetencyKey,
  type MockInterviewDuration,
  type MockInterviewQuestion,
  type MockInterviewSetId,
} from "@/lib/mock-interview/profile";
import {
  createMockInterviewSession,
  MOCK_INTERVIEW_STORAGE_KEY,
  parseMockInterviewSession,
  serializeMockInterviewSession,
  type MockInterviewSession,
} from "@/lib/mock-interview/session";

type GroundingCoverage = {
  counts: Record<MockCompetencyKey, number>;
  groundedCompetencies: MockCompetencyKey[];
  missingCompetencies: MockCompetencyKey[];
};

type MockInterviewAppProps = {
  account: {
    displayName: string;
    login: string | null;
  };
  sourceRevision: string;
  bankQuestions: MockInterviewQuestion[];
  groundingCoverage: GroundingCoverage;
};

const EMPTY_MOCK_SESSION = "__empty_mock_session__";
const mockSessionListeners = new Set<() => void>();

function subscribeToMockSession(callback: () => void) {
  mockSessionListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    mockSessionListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getMockSessionSnapshot() {
  return (
    window.localStorage.getItem(MOCK_INTERVIEW_STORAGE_KEY) ??
    EMPTY_MOCK_SESSION
  );
}

function getServerMockSessionSnapshot() {
  return null;
}

function saveMockSession(session: MockInterviewSession) {
  window.localStorage.setItem(
    MOCK_INTERVIEW_STORAGE_KEY,
    serializeMockInterviewSession(session),
  );
  mockSessionListeners.forEach((listener) => listener());
}

function clearMockSession() {
  window.localStorage.removeItem(MOCK_INTERVIEW_STORAGE_KEY);
  mockSessionListeners.forEach((listener) => listener());
}

const durationOptions: Array<{
  minutes: MockInterviewDuration;
  label: string;
  note: string;
}> = [
  { minutes: 30, label: "Screening", note: "4 câu · C++ + domain core" },
  { minutes: 45, label: "Technical", note: "5 câu · có coding + build" },
  { minutes: 60, label: "Full loop", note: "7 câu · đủ role + English" },
];

const readinessLabels: Record<MockInterviewReport["readiness"], string> = {
  not_ready: "Chưa sẵn sàng",
  developing: "Đang tiến bộ",
  interview_ready: "Có thể đi phỏng vấn",
  strong: "Tín hiệu mạnh",
};

const verdictLabels: Record<
  MockInterviewReport["questionAssessments"][number]["verdict"],
  string
> = {
  needs_work: "Cần ôn lại",
  partial: "Đúng một phần",
  solid: "Khá chắc",
  strong: "Mạnh",
};

export function MockInterviewApp({
  account,
  sourceRevision,
  bankQuestions,
  groundingCoverage,
}: MockInterviewAppProps) {
  const [duration, setDuration] = useState<MockInterviewDuration>(45);
  const [selectedSetId, setSelectedSetId] =
    useState<MockInterviewSetId>("worldquant-45-a");
  const [now, setNow] = useState(() => Date.now());
  const [reportError, setReportError] = useState<string | null>(null);
  const evaluationInFlight = useRef(false);
  const autoSubmitted = useRef(false);
  const sessionSnapshot = useSyncExternalStore(
    subscribeToMockSession,
    getMockSessionSnapshot,
    getServerMockSessionSnapshot,
  );

  const allQuestions = useMemo(
    () => [...bankQuestions, ...WORLDQUANT_ROLE_QUESTIONS],
    [bankQuestions],
  );
  const questionById = useMemo(
    () => new Map(allQuestions.map((question) => [question.id, question])),
    [allQuestions],
  );
  const storedSession = useMemo(
    () =>
      sessionSnapshot && sessionSnapshot !== EMPTY_MOCK_SESSION
        ? parseMockInterviewSession(sessionSnapshot)
        : null,
    [sessionSnapshot],
  );
  const staleSession = Boolean(
    storedSession?.questions.some((identity) => {
      const question = questionById.get(identity.id);
      return (
        !question ||
        question.origin !== identity.origin ||
        question.version !== identity.version ||
        question.contentRevision !== identity.contentRevision
      );
    }),
  );
  const interruptedEvaluation =
    storedSession?.status === "evaluating" && !evaluationInFlight.current;
  if (interruptedEvaluation) autoSubmitted.current = true;
  const session =
    storedSession && !staleSession
      ? interruptedEvaluation
        ? {
            ...storedSession,
            status: "in_progress" as const,
            activeQuestionStartedAt: new Date().toISOString(),
          }
        : storedSession
      : null;
  const hydrated = sessionSnapshot !== null;
  const notice = staleSession
    ? "Nội dung bộ đề hoặc question bank đã đổi nên buổi cũ không được khôi phục để tránh chấm sai version."
    : sessionSnapshot !== null &&
        sessionSnapshot !== EMPTY_MOCK_SESSION &&
        !storedSession
      ? "Dữ liệu buổi mock cũ bị lỗi nên đã được bỏ qua."
      : null;
  const visibleReportError =
    reportError ??
    (interruptedEvaluation
      ? "Lần chấm trước bị ngắt khi reload. Câu trả lời vẫn còn; nhấn “Tạo report” để thử lại."
      : null);
  const timerSessionKey =
    session && session.status !== "completed"
      ? `${session.sessionId}:${session.status}`
      : null;

  useEffect(() => {
    if (!timerSessionKey) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [timerSessionKey]);

  const sessionQuestions = useMemo(
    () =>
      session?.questions.flatMap((identity) => {
        const question = questionById.get(identity.id);
        return question ? [question] : [];
      }) ?? [],
    [questionById, session?.questions],
  );
  const currentQuestion = sessionQuestions[session?.currentIndex ?? 0];
  const currentMockSet = session
    ? worldQuantMockSetById(session.setId)
    : undefined;
  const remainingSeconds = session
    ? Math.max(
        0,
        Math.ceil(
          (new Date(session.deadlineAt).getTime() - now) / 1000,
        ),
      )
    : 0;

  useEffect(() => {
    if (
      !session ||
      session.status !== "in_progress" ||
      remainingSeconds > 0 ||
      autoSubmitted.current
    ) {
      return;
    }
    autoSubmitted.current = true;
    void finishInterview(true);
    // finishInterview intentionally consumes the exact session snapshot that
    // caused the deadline transition; adding it would retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, session?.sessionId, session?.status]);

  function startInterview(setId: MockInterviewSetId) {
    const sessionId = crypto.randomUUID();
    const startedAt = new Date();
    const nextSession = createMockInterviewSession({
      sessionId,
      setId,
      sourceRevision,
      startedAt,
    });
    autoSubmitted.current = false;
    evaluationInFlight.current = false;
    setReportError(null);
    setNow(startedAt.getTime());
    saveMockSession(nextSession);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateAnswer(
    questionId: string,
    field: "response" | "explanation",
    value: string,
  ) {
    if (!session || session.status !== "in_progress") return;
    const answer = session.answers[questionId] ?? {
      response: "",
      explanation: "",
    };
    saveMockSession({
      ...session,
      answers: {
        ...session.answers,
        [questionId]: { ...answer, [field]: value },
      },
    });
  }

  function moveToQuestion(nextIndex: number) {
    if (
      !session ||
      session.status !== "in_progress" ||
      nextIndex < 0 ||
      nextIndex >= session.questions.length
    ) {
      return;
    }
    saveMockSession(
      commitCurrentQuestionTime(session, Date.now(), nextIndex),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finishInterview(timerExpired = false) {
    if (
      !session ||
      session.status !== "in_progress" ||
      evaluationInFlight.current
    ) {
      return;
    }
    const unanswered = session.questions.filter(
      ({ id }) => !session.answers[id]?.response.trim(),
    ).length;
    if (
      unanswered > 0 &&
      !timerExpired &&
      !window.confirm(
        `Còn ${unanswered} câu chưa trả lời. Nộp luôn và tính các câu đó là 0 điểm?`,
      )
    ) {
      return;
    }

    evaluationInFlight.current = true;
    const submittedAt = Date.now();
    const committed = commitCurrentQuestionTime(
      session,
      submittedAt,
      session.currentIndex,
    );
    const evaluatingSession: MockInterviewSession = {
      ...committed,
      status: "evaluating",
    };
    setReportError(null);
    saveMockSession(evaluatingSession);

    try {
      const response = await fetch("/api/mock-interview/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: committed.sessionId,
          profileId: committed.profileId,
          profileVersion: committed.profileVersion,
          setId: committed.setId,
          setVersion: committed.setVersion,
          sourceRevision: committed.sourceRevision,
          durationMinutes: committed.durationMinutes,
          elapsedSeconds: Math.max(
            0,
            Math.floor(
              (submittedAt - new Date(committed.startedAt).getTime()) / 1000,
            ),
          ),
          items: committed.questions.map((identity) => {
            const question = questionById.get(identity.id)!;
            const draft = committed.answers[identity.id] ?? {
              response: "",
              explanation: "",
            };
            return {
              questionId: identity.id,
              origin: identity.origin,
              version: identity.version,
              contentRevision: identity.contentRevision,
              answer: candidateAnswer(question, draft),
              elapsedSeconds:
                committed.elapsedByQuestion[identity.id] ?? 0,
            };
          }),
        }),
      });
      const payload = (await response.json()) as {
        report?: MockInterviewReport;
        model?: string;
        provider?: "openai" | "gemini";
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error || "AI chưa tạo được report.");
      }
      const completed: MockInterviewSession = {
        ...committed,
        status: "completed",
        report: payload.report,
        reportModel: payload.model,
        reportProvider: payload.provider,
      };
      saveMockSession(completed);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      autoSubmitted.current = true;
      const restored: MockInterviewSession = {
        ...committed,
        status: "in_progress",
        activeQuestionStartedAt: new Date().toISOString(),
      };
      saveMockSession(restored);
      setReportError(
        error instanceof Error
          ? error.message
          : "AI chưa tạo được report. Thử lại sau.",
      );
    } finally {
      evaluationInFlight.current = false;
    }
  }

  function resetInterview() {
    if (
      session?.status !== "completed" &&
      session &&
      !window.confirm("Xóa buổi mock đang làm và tạo buổi mới?")
    ) {
      return;
    }
    if (session) {
      setDuration(session.durationMinutes);
      setSelectedSetId(session.setId);
    }
    clearMockSession();
    autoSubmitted.current = false;
    evaluationInFlight.current = false;
    setReportError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!hydrated) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="font-mono text-xs text-[#64736c]">
          Đang khôi phục phòng phỏng vấn…
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <MockSetup
        account={account}
        duration={duration}
        selectedSetId={selectedSetId}
        onDuration={(nextDuration) => {
          const firstSet = worldQuantMockSetsForDuration(nextDuration)[0];
          setDuration(nextDuration);
          if (firstSet) setSelectedSetId(firstSet.id);
        }}
        onSet={setSelectedSetId}
        onStart={() => startInterview(selectedSetId)}
        bankQuestionCount={bankQuestions.length}
        groundingCoverage={groundingCoverage}
        notice={notice}
      />
    );
  }

  if (session.status === "completed" && session.report) {
    return (
      <MockReport
        account={account}
        session={session}
        questions={sessionQuestions}
        onReset={resetInterview}
        onReplay={() => startInterview(session.setId)}
      />
    );
  }

  if (!currentQuestion) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <section className="max-w-lg rounded-3xl border border-[#ba4b2f]/20 bg-white/70 p-8 text-center">
          <h1 className="text-2xl font-semibold">Không khôi phục được câu hỏi</h1>
          <p className="mt-3 text-[#64736c]">
            Question bank đã đổi. Tạo buổi mới để tránh chấm nhầm version.
          </p>
          <button
            type="button"
            onClick={resetInterview}
            className="mt-6 rounded-2xl bg-[#173f35] px-5 py-3 text-sm font-bold text-white"
          >
            Tạo buổi mới
          </button>
        </section>
      </main>
    );
  }

  const currentDraft = session.answers[currentQuestion.id] ?? {
    response: "",
    explanation: "",
  };
  const answeredCount = session.questions.filter(({ id }) =>
    session.answers[id]?.response.trim(),
  ).length;
  const progress =
    ((session.currentIndex + 1) / session.questions.length) * 100;

  return (
    <main className="min-h-screen px-4 py-4 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173f35]/15 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#173f35] font-mono text-xs font-bold text-[#d7ff91]">
              WQ
            </span>
            <div>
              <p className="font-semibold">Mock interview</p>
              <p className="text-xs text-[#64736c]">
                Bộ {currentMockSet?.variant ?? "?"} ·{" "}
                {currentMockSet?.title ?? WORLDQUANT_PROFILE.role}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-4 py-2 font-mono text-sm font-bold ${
                remainingSeconds <= 300
                  ? "border-[#ba4b2f]/30 bg-[#f8e8df] text-[#8e3825]"
                  : "border-[#173f35]/15 bg-white/65 text-[#245748]"
              }`}
            >
              {formatClock(remainingSeconds)}
            </span>
            <button
              type="button"
              onClick={resetInterview}
              disabled={session.status === "evaluating"}
              className="rounded-xl border border-[#173f35]/15 bg-white/60 px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              Dừng
            </button>
          </div>
        </header>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-xs text-[#64736c]">
            <span className="font-mono font-bold">
              Câu {session.currentIndex + 1}/{session.questions.length}
            </span>
            <span>{answeredCount} câu đã trả lời · tự lưu khi F5</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#173f35]/10">
            <div
              className="h-full rounded-full bg-[#79b82a] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <section className="py-7">
          <article className="overflow-hidden rounded-[2rem] border border-[#173f35]/15 bg-white/68 shadow-[0_22px_80px_rgb(23_63_53_/_8%)]">
            <div className="border-b border-[#173f35]/10 bg-[#173f35] px-6 py-4 text-white sm:px-9">
              <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#d7ff91] uppercase">
                Interviewer
              </p>
              <p className="mt-1 text-sm text-white/65">
                Không hint · không tag · không feedback giữa buổi
              </p>
            </div>
            <div className="p-6 sm:p-9">
              <h1 className="max-w-4xl text-2xl leading-[1.35] font-semibold tracking-[-0.025em] sm:text-3xl">
                <InlineCode text={currentQuestion.prompt} />
              </h1>

              {currentQuestion.code ? (
                <pre className="mt-7 max-h-[26rem] overflow-auto rounded-2xl bg-[#102d26] p-5 font-mono text-[13px] leading-6 text-[#e8f4ec]">
                  <code>{currentQuestion.code}</code>
                </pre>
              ) : null}

              <div className="mt-8">
                {currentQuestion.responseMode === "code" ? (
                  <div className="space-y-5">
                    <div className="overflow-hidden rounded-2xl border border-[#173f35]/15 bg-[#0b241d]">
                      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
                        <span className="font-mono text-xs font-bold text-[#d7ff91]">
                          Candidate solution
                        </span>
                        <span className="text-[10px] text-white/45">
                          Không compile trong Phase A
                        </span>
                      </div>
                      <MonacoCodeEditor
                        language={currentQuestion.language}
                        value={currentDraft.response}
                        onChange={(value) =>
                          updateAnswer(
                            currentQuestion.id,
                            "response",
                            value.slice(0, 8000),
                          )
                        }
                        height="420px"
                        expanded={false}
                        placeholder="Viết solution của mày ở đây…"
                      />
                    </div>
                    <label className="block text-sm font-bold text-[#29493d]">
                      Complexity, assumptions và trade-offs
                      <textarea
                        value={currentDraft.explanation}
                        onChange={(event) =>
                          updateAnswer(
                            currentQuestion.id,
                            "explanation",
                            event.target.value,
                          )
                        }
                        maxLength={4000}
                        rows={5}
                        disabled={session.status === "evaluating"}
                        placeholder="Giải thích như đang nói với interviewer…"
                        className="mt-2 w-full resize-y rounded-2xl border border-[#173f35]/15 bg-white/80 px-4 py-3 font-normal leading-7 outline-none focus:border-[#356b58] focus:ring-4 focus:ring-[#d7ff91]/45"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="block text-sm font-bold text-[#29493d]">
                    Câu trả lời của mày
                    <textarea
                      value={currentDraft.response}
                      onChange={(event) =>
                        updateAnswer(
                          currentQuestion.id,
                          "response",
                          event.target.value,
                        )
                      }
                      maxLength={8000}
                      rows={10}
                      disabled={session.status === "evaluating"}
                      placeholder="Trả lời thành tiếng hoặc viết như đang trao đổi với interviewer…"
                      className="mt-2 w-full resize-y rounded-2xl border border-[#173f35]/15 bg-white/80 px-4 py-3 font-normal leading-7 outline-none focus:border-[#356b58] focus:ring-4 focus:ring-[#d7ff91]/45"
                    />
                  </label>
                )}
              </div>
            </div>
          </article>

          {visibleReportError ? (
            <p
              role="alert"
              className="mt-5 rounded-2xl border border-[#ba4b2f]/20 bg-[#f8e8df] px-4 py-3 text-sm text-[#8e3825]"
            >
              {visibleReportError}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => moveToQuestion(session.currentIndex - 1)}
              disabled={
                session.currentIndex === 0 || session.status === "evaluating"
              }
              className="rounded-xl border border-[#173f35]/15 bg-white/70 px-5 py-3 text-sm font-bold disabled:opacity-35"
            >
              ← Câu trước
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {session.currentIndex < session.questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => moveToQuestion(session.currentIndex + 1)}
                  disabled={session.status === "evaluating"}
                  className="rounded-xl bg-[#173f35] px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
                >
                  Câu tiếp theo →
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void finishInterview(false)}
                disabled={session.status === "evaluating"}
                className="rounded-xl bg-[#d7ff91] px-5 py-3 text-sm font-bold text-[#173f35] shadow-sm disabled:cursor-wait disabled:opacity-55"
              >
                {session.status === "evaluating"
                  ? "AI đang tạo report…"
                  : remainingSeconds === 0
                    ? "Thử tạo report lại"
                    : "Kết thúc & tạo report"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MockSetup({
  account,
  duration,
  selectedSetId,
  onDuration,
  onSet,
  onStart,
  bankQuestionCount,
  groundingCoverage,
  notice,
}: {
  account: MockInterviewAppProps["account"];
  duration: MockInterviewDuration;
  selectedSetId: MockInterviewSetId;
  onDuration: (duration: MockInterviewDuration) => void;
  onSet: (setId: MockInterviewSetId) => void;
  onStart: () => void;
  bankQuestionCount: number;
  groundingCoverage: GroundingCoverage;
  notice: string | null;
}) {
  const availableSets = worldQuantMockSetsForDuration(duration);
  const selectedSet = worldQuantMockSetById(selectedSetId);

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173f35]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#173f35] font-mono text-sm font-bold text-[#d7ff91]">
              WQ
            </span>
            <div>
              <p className="font-bold">Recall Mock Interview</p>
              <p className="text-xs text-[#64736c]">WorldQuant role profile</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-xl px-4 py-2 text-sm font-bold hover:bg-white/60"
            >
              Luyện tập
            </Link>
            <Link
              href="/stats"
              className="rounded-xl px-4 py-2 text-sm font-bold hover:bg-white/60"
            >
              Thống kê
            </Link>
            <span className="rounded-full border border-[#173f35]/15 bg-white/65 px-4 py-2 text-xs font-semibold">
              @{account.login ?? account.displayName}
            </span>
          </nav>
        </header>

        {notice ? (
          <p className="mt-5 rounded-2xl border border-[#ba4b2f]/20 bg-[#f8e8df] px-4 py-3 text-sm text-[#8e3825]">
            {notice}
          </p>
        ) : null}

        <section className="grid gap-7 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">
              Target role
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              {WORLDQUANT_PROFILE.role}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#52645c]">
              Một lượt mô phỏng không lộ tag, hint, nguồn hay feedback. AI chỉ
              chấm một lần sau khi mày kết thúc toàn bộ buổi.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {WORLDQUANT_PROFILE.focus.map((item) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-2xl border border-[#173f35]/10 bg-white/55 p-4 text-sm leading-6"
                >
                  <span className="mt-1 text-[#79a72e]">◆</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[#173f35]/15 bg-[#173f35] p-6 text-white shadow-[0_22px_80px_rgb(23_63_53_/_16%)] sm:p-7">
            <p className="font-mono text-[11px] font-bold tracking-[0.16em] text-[#d7ff91] uppercase">
              Chọn format
            </p>
            <div className="mt-4 space-y-3">
              {durationOptions.map((option) => {
                const active = option.minutes === duration;
                return (
                  <button
                    key={option.minutes}
                    type="button"
                    onClick={() => onDuration(option.minutes)}
                    aria-pressed={active}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-[#d7ff91] bg-white/12"
                        : "border-white/12 bg-white/5 hover:bg-white/9"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <strong>{option.minutes} phút · {option.label}</strong>
                      <span
                        className={`size-3 rounded-full border ${
                          active
                            ? "border-[#d7ff91] bg-[#d7ff91]"
                            : "border-white/30"
                        }`}
                      />
                    </span>
                    <span className="mt-1 block text-xs text-white/55">
                      {option.note}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-6 font-mono text-[11px] font-bold tracking-[0.16em] text-[#d7ff91] uppercase">
              Chọn bộ đề
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {availableSets.map((mockSet) => {
                const active = mockSet.id === selectedSetId;
                return (
                  <button
                    key={mockSet.id}
                    type="button"
                    onClick={() => onSet(mockSet.id)}
                    aria-pressed={active}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-[#d7ff91] bg-[#d7ff91]/12"
                        : "border-white/12 bg-white/5 hover:bg-white/9"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <strong>
                        Bộ {mockSet.variant} · {mockSet.title}
                      </strong>
                      <span className="font-mono text-[10px] text-white/45">
                        v{mockSet.version}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-white/55">
                      {mockSet.description}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onStart}
              className="mt-5 w-full rounded-2xl bg-[#d7ff91] px-5 py-3.5 text-sm font-bold text-[#173f35] transition hover:-translate-y-0.5"
            >
              Bắt đầu bộ {selectedSet?.variant ?? "A"} ·{" "}
              {mockDurationQuestionCounts[duration]} câu →
            </button>
            <p className="mt-4 text-center text-[11px] leading-5 text-white/45">
              Bộ đề và thứ tự câu được cố định. Timer cùng câu trả lời được lưu
              local nên F5 không làm mất buổi.
            </p>
          </aside>
        </section>

        <section className="grid gap-5 pb-10 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-[#173f35]/12 bg-white/62 p-6 sm:p-7">
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#356b58] uppercase">
              Question bank cho bộ mới
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {bankQuestionCount} câu đã duyệt sẵn sàng để tạo thêm bộ
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mockCompetencyKeys.map((key) => (
                <div
                  key={key}
                  className={`rounded-xl p-3 ${
                    groundingCoverage.counts[key]
                      ? "bg-[#eaf8cf] text-[#245748]"
                      : "bg-[#f1e6dc] text-[#8e3825]"
                  }`}
                >
                  <span className="block font-mono text-lg font-bold">
                    {groundingCoverage.counts[key]}
                  </span>
                  <span className="mt-1 block text-[10px] leading-4">
                    {mockCompetencyLabels[key]}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#ba4b2f]/18 bg-[#fff4df] p-6 sm:p-7">
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#ba4b2f] uppercase">
              Coverage guard
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Không giả vờ question bank đã biết mọi thứ
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#6b5648]">
              Các tình huống tick data, migration, CMake, Python và English được
              curate từ chính JD. Report chỉ chấm explicit rubric; không nhận
              chúng là câu hỏi thật của WorldQuant.
            </p>
            {groundingCoverage.missingCompetencies.length ? (
              <p className="mt-4 text-xs leading-5 text-[#8e3825]">
                Note riêng còn thiếu grounding cho:{" "}
                <strong>
                  {groundingCoverage.missingCompetencies
                    .map((key) => mockCompetencyLabels[key])
                    .join(", ")}
                </strong>
                . Sau này thêm knowledge tương ứng thì có thể tạo bộ version
                mới từ ngân hàng; 6 bộ hiện tại sẽ không âm thầm đổi câu.
              </p>
            ) : null}
          </article>
        </section>

        <p className="pb-8 text-center text-xs leading-5 text-[#64736c]">
          {WORLDQUANT_PROFILE.disclaimer}
        </p>
      </div>
    </main>
  );
}

function MockReport({
  account,
  session,
  questions,
  onReset,
  onReplay,
}: {
  account: MockInterviewAppProps["account"];
  session: MockInterviewSession;
  questions: MockInterviewQuestion[];
  onReset: () => void;
  onReplay: () => void;
}) {
  const report = session.report;
  if (!report) return null;
  const mockSet = worldQuantMockSetById(session.setId);
  const assessmentById = new Map(
    report.questionAssessments.map((assessment) => [
      assessment.questionId,
      assessment,
    ]),
  );

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173f35]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#173f35] font-mono text-sm font-bold text-[#d7ff91]">
              WQ
            </span>
            <div>
              <p className="font-bold">Mock Interview Report</p>
              <p className="text-xs text-[#64736c]">
                {WORLDQUANT_PROFILE.role}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-xl border border-[#173f35]/15 bg-white/65 px-4 py-2 text-sm font-bold"
            >
              Luyện tập
            </Link>
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-[#173f35]/15 bg-white/65 px-4 py-2 text-sm font-bold"
            >
              Chọn bộ khác
            </button>
            <button
              type="button"
              onClick={onReplay}
              className="rounded-xl bg-[#173f35] px-4 py-2 text-sm font-bold text-white"
            >
              Luyện lại bộ này
            </button>
            <span className="rounded-full border border-[#173f35]/15 bg-white/65 px-4 py-2 text-xs font-semibold">
              @{account.login ?? account.displayName}
            </span>
          </div>
        </header>

        <section className="grid gap-5 py-8 lg:grid-cols-[0.38fr_0.62fr]">
          <article className="rounded-[2rem] bg-[#173f35] p-7 text-white shadow-[0_22px_80px_rgb(23_63_53_/_16%)]">
            <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#d7ff91] uppercase">
              Overall signal
            </p>
            <p className="mt-4 font-mono text-6xl font-bold text-[#d7ff91]">
              {report.overallScore}
            </p>
            <p className="mt-1 text-xs text-white/45">/ 100</p>
            <h1 className="mt-5 text-2xl font-semibold">
              {readinessLabels[report.readiness]}
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/68">
              {report.hiringSignal}
            </p>
            <div className="mt-6 border-t border-white/12 pt-4 font-mono text-[10px] leading-5 text-white/42">
              <p>
                Bộ {mockSet?.variant ?? "?"} ·{" "}
                {mockSet?.title ?? session.setId} · v{session.setVersion}
              </p>
              <p>{session.durationMinutes} phút · {questions.length} câu</p>
              <p>{session.reportModel ?? "AI model"}</p>
              <p>{session.reportProvider ?? "provider"} · chấm một lần cuối buổi</p>
            </div>
          </article>

          <article className="rounded-[2rem] border border-[#173f35]/12 bg-white/65 p-7">
            <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">
              Interview summary
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Báo cáo tổng hợp
            </h2>
            <p className="mt-4 leading-7 text-[#52645c]">{report.summary}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <ReportList
                title="Tín hiệu tốt"
                items={report.strengths}
                tone="positive"
              />
              <ReportList
                title="Khoảng trống ưu tiên"
                items={report.priorityGaps}
                tone="warning"
              />
            </div>
          </article>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mockCompetencyKeys.map((key) => {
            const result = report.competencies[key];
            return (
              <article
                key={key}
                className="rounded-[1.75rem] border border-[#173f35]/12 bg-white/62 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-[#64736c] uppercase">
                      Competency
                    </p>
                    <h3 className="mt-1 font-semibold">
                      {mockCompetencyLabels[key]}
                    </h3>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-xs font-bold ${
                      result.status === "assessed"
                        ? "bg-[#d7ff91]/70 text-[#245748]"
                        : "bg-[#edf0e8] text-[#64736c]"
                    }`}
                  >
                    {result.status === "assessed"
                      ? `${result.score}/100`
                      : "Chưa hỏi"}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-[#52645c]">
                  {result.summary}
                </p>
                {result.gaps.length ? (
                  <ul className="mt-4 space-y-2 border-t border-[#173f35]/10 pt-3 text-xs leading-5 text-[#8e3825]">
                    {result.gaps.map((gap) => (
                      <li key={gap}>→ {gap}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </section>

        <section className="mt-5 rounded-[2rem] border border-[#173f35]/12 bg-white/62 p-6 sm:p-7">
          <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">
            Next preparation
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Kế hoạch ôn tiếp</h2>
          {report.studyPlan.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {report.studyPlan.map((item) => (
                <div
                  key={`${item.priority}:${item.topic}`}
                  className="rounded-2xl border border-[#173f35]/10 bg-[#f8faf5] p-4"
                >
                  <span className="font-mono text-[10px] font-bold text-[#ba4b2f]">
                    P{item.priority}
                  </span>
                  <h3 className="mt-1 font-semibold">{item.topic}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#52645c]">
                    {item.action}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#64736c]">
              Report chưa đề xuất thêm action.
            </p>
          )}
        </section>

        <section className="mt-5 pb-10">
          <div className="mb-4">
            <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#356b58] uppercase">
              Question review
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Xem lại từng câu</h2>
          </div>
          <div className="space-y-3">
            {questions.map((question, index) => {
              const assessment = assessmentById.get(question.id);
              const answer = session.answers[question.id];
              if (!assessment) return null;
              return (
                <details
                  key={question.id}
                  className="group rounded-2xl border border-[#173f35]/12 bg-white/62 p-5"
                >
                  <summary className="flex list-none cursor-pointer items-center justify-between gap-4">
                    <div>
                      <span className="font-mono text-[10px] text-[#64736c]">
                        Câu {index + 1}
                      </span>
                      <p className="mt-1 line-clamp-2 font-semibold">
                        {question.prompt}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#eaf8cf] px-3 py-1 font-mono text-xs font-bold text-[#245748]">
                      {assessment.score} · {verdictLabels[assessment.verdict]}
                    </span>
                  </summary>
                  <div className="mt-5 space-y-5 border-t border-[#173f35]/10 pt-5">
                    <div>
                      <p className="text-xs font-bold text-[#356b58]">
                        Câu trả lời của mày
                      </p>
                      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[#102d26] p-4 font-mono text-xs leading-6 text-[#e8f4ec]">
                        {answer
                          ? candidateAnswer(question, answer) || "(Bỏ trống)"
                          : "(Bỏ trống)"}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#356b58]">
                        Nhận xét
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#52645c]">
                        {assessment.summary}
                      </p>
                    </div>
                    {assessment.missedCriteria.length ? (
                      <ReportList
                        title="Ý còn thiếu"
                        items={assessment.missedCriteria}
                        tone="warning"
                      />
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function ReportList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${
        tone === "positive" ? "bg-[#eaf8cf]" : "bg-[#f8e8df]"
      }`}
    >
      <p
        className={`text-sm font-bold ${
          tone === "positive" ? "text-[#245748]" : "text-[#8e3825]"
        }`}
      >
        {title}
      </p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[#52645c]">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span>{tone === "positive" ? "✓" : "→"}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[#64736c]">Chưa có evidence.</p>
      )}
    </div>
  );
}

function InlineCode({ text }: { text: string }) {
  const segments = text.split(/(`[^`\n]+`)/g);
  return (
    <>
      {segments.map((segment, index) =>
        segment.startsWith("`") && segment.endsWith("`") ? (
          <code
            key={`${index}:${segment}`}
            className="rounded-md bg-[#e8ede8] px-1.5 py-0.5 font-mono text-[0.88em] text-[#245748]"
          >
            {segment.slice(1, -1)}
          </code>
        ) : (
          <span key={`${index}:${segment}`}>{segment}</span>
        ),
      )}
    </>
  );
}

function commitCurrentQuestionTime(
  session: MockInterviewSession,
  nowMs: number,
  nextIndex: number,
): MockInterviewSession {
  const currentQuestionId = session.questions[session.currentIndex]?.id;
  if (!currentQuestionId) return session;
  const delta = Math.max(
    0,
    Math.floor(
      (nowMs - new Date(session.activeQuestionStartedAt).getTime()) / 1000,
    ),
  );
  return {
    ...session,
    currentIndex: nextIndex,
    elapsedByQuestion: {
      ...session.elapsedByQuestion,
      [currentQuestionId]:
        (session.elapsedByQuestion[currentQuestionId] ?? 0) + delta,
    },
    activeQuestionStartedAt: new Date(nowMs).toISOString(),
  };
}

function candidateAnswer(
  question: MockInterviewQuestion,
  answer: { response: string; explanation: string },
) {
  if (question.responseMode === "text") return answer.response.trim();
  const language =
    question.language === "cpp"
      ? "cpp"
      : question.language === "python"
        ? "python"
        : "cmake";
  const response = answer.response.trim();
  const explanation = answer.explanation.trim();
  if (!response && !explanation) return "";
  return `\`\`\`${language}\n${response}\n\`\`\`${
    explanation ? `\n\nGiải thích của ứng viên:\n${explanation}` : ""
  }`;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
