"use client";

import Link, { useLinkStatus } from "next/link";
import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import type {
  CoachFeedback,
  CoachFollowUpResponse,
} from "@/lib/ai/contracts";
import {
  mergeAiDailyBudgetSnapshot,
  type AiDailyBudgetSnapshot,
} from "@/lib/ai/budget";
import {
  aiDailyBudgetStorageKey,
  parseCurrentAiDailyBudgetSnapshot,
} from "@/lib/ai/budget-cache";
import {
  ENABLED_PRACTICE_DECK_IDS,
  PRACTICE_DECKS,
} from "@/lib/content/decks";
import type {
  ContentLanguage,
  ContentQuestion,
  PracticeDeckId,
} from "@/lib/content/schema";
import { displayQuestionPrompt } from "@/lib/content/question-prompt";
import type { PracticeAccount } from "@/lib/practice/cloud-server";
import {
  buildCandidateAnswer,
  requiresCodeAnswer,
  SCENARIO_CODE_MAX,
  SCENARIO_EXPLANATION_MAX,
} from "@/lib/practice/candidate-answer";
import {
  buildCustomStudyQueue,
  type CustomStudyFilters,
} from "@/lib/practice/custom-study";
import { scenarioEditorConfig } from "@/lib/practice/scenario-editor";
import {
  parseSavedItems,
  removeSavedItem,
  SAVED_ITEMS_KEY,
  upsertSavedItem,
  type SavedItem,
} from "@/lib/practice/saved-items";
import {
  parseStudySession,
  serializeStudySession,
  type QuestionStudySession,
} from "@/lib/practice/study-session";
import {
  calculateStreak,
  latestReviews,
  localDateKey,
  mergeProgress,
  parseProgress,
  reviewsForCloudSync,
  type PracticeProgress,
  type Rating,
  type Review,
} from "@/lib/practice/scheduler";
import {
  buildAnkiDailyQueue,
  buildLearningStates,
  countLearningStates,
  ratingIntervalDays,
  recordScheduledReview,
  scheduleQuestionReview,
  type QuestionLearningState,
} from "@/lib/practice/learning-state";

const STORAGE_KEY = "cpp-recall:progress:v1";
const STUDY_SESSION_KEY = "cpp-recall:study-session:v1";
const EMPTY_SNAPSHOT = "__empty__";
const storageListeners = new Set<() => void>();

const MonacoCodeEditor = dynamic(
  () =>
    import("./scenario-code-editor").then((module) => module.MonacoCodeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-96 place-items-center bg-[#0b241d] font-mono text-xs text-white/45">
        Đang tải VS Code editor…
      </div>
    ),
  },
);
type SyncStatus = "local" | "syncing" | "synced" | "error";
type FollowUpChatMessage = {
  role: "user" | "assistant";
  content: string;
  sourceSectionIds?: string[];
  checkQuestion?: string;
  model?: string;
};

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
  python3: "Python 3",
  cmake: "CMake",
} as const;

const learningStateLabels = {
  new: "Mới",
  learning: "Đang học",
  review: "Ôn tập",
  relearning: "Học lại",
} as const;

export type PracticeQuestion = ContentQuestion & {
  lessonTitle: string;
  language: ContentLanguage;
  track: keyof typeof standardLabels;
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
  reviewQueue,
  sourceRevision,
  cloudEnabled,
  account,
  initialCloudProgress,
  initialQuestionStates,
  cloudSetupError,
  initialAiDailyBudget,
  authNotice,
  initialDeck,
}: {
  questions: PracticeQuestion[];
  reviewQueue: PracticeQuestion[];
  sourceRevision: string;
  cloudEnabled: boolean;
  account: PracticeAccount | null;
  initialCloudProgress: PracticeProgress;
  initialQuestionStates: QuestionLearningState[];
  cloudSetupError: boolean;
  initialAiDailyBudget: AiDailyBudgetSnapshot | null;
  authNotice: string | null;
  initialDeck: PracticeDeckId;
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
  const [codeAnswers, setCodeAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [hints, setHints] = useState<Set<string>>(() => new Set());
  const [visibleSources, setVisibleSources] = useState<Set<string>>(
    () => new Set(),
  );
  const [coachFeedback, setCoachFeedback] = useState<Record<string, CoachFeedback>>(
    {},
  );
  const [coachModels, setCoachModels] = useState<Record<string, string>>({});
  const [coachAnswers, setCoachAnswers] = useState<Record<string, string>>({});
  const [coachLoading, setCoachLoading] = useState<string | null>(null);
  const [coachErrors, setCoachErrors] = useState<Record<string, string>>({});
  const [followUpInputs, setFollowUpInputs] = useState<Record<string, string>>({});
  const [followUpChats, setFollowUpChats] = useState<
    Record<string, FollowUpChatMessage[]>
  >({});
  const [followUpLoading, setFollowUpLoading] = useState<string | null>(null);
  const [followUpErrors, setFollowUpErrors] = useState<Record<string, string>>({});
  const [deepDiveOpen, setDeepDiveOpen] = useState<Set<string>>(() => new Set());
  const [deepDiveAnswers, setDeepDiveAnswers] = useState<Record<string, string>>({});
  const [deepDiveFeedback, setDeepDiveFeedback] = useState<
    Record<string, CoachFollowUpResponse>
  >({});
  const [deepDiveModels, setDeepDiveModels] = useState<Record<string, string>>({});
  const [deepDiveLoading, setDeepDiveLoading] = useState<string | null>(null);
  const [deepDiveErrors, setDeepDiveErrors] = useState<Record<string, string>>({});
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [aiDailyBudget, setAiDailyBudget] = useState(initialAiDailyBudget);
  const [aiBudgetCacheHydrated, setAiBudgetCacheHydrated] = useState(false);
  const [cloudQuestionStates, setCloudQuestionStates] = useState(
    initialQuestionStates,
  );
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );
  const [customStudyIds, setCustomStudyIds] = useState<string[] | null>(null);
  const [customStudyNotice, setCustomStudyNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    cloudSetupError ? "error" : account ? "syncing" : "local",
  );
  const [availableQuestions, setAvailableQuestions] = useState(questions);
  const [pendingReview, setPendingReview] = useState(reviewQueue);
  const [selectedDeck, setSelectedDeck] = useState(initialDeck);
  const [requestedDeck, setRequestedDeck] = useState(initialDeck);
  const [deckTransitionPending, startDeckTransition] = useTransition();
  const [approvalStatus, setApprovalStatus] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const initialSyncStarted = useRef(false);
  const sessionHydrationStarted = useRef(false);
  const scrollToRatingWhenAvailable = useRef(false);
  const pendingSessionSaveRef = useRef<(() => void) | null>(null);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const sessionQuestions = useMemo(() => {
    const byId = new Map<string, PracticeQuestion>();
    [...availableQuestions, ...pendingReview].forEach((question) =>
      byId.set(question.id, question),
    );
    return [...byId.values()];
  }, [availableQuestions, pendingReview]);
  const accountId = account?.id ?? null;

  useEffect(() => {
    if (initialAiDailyBudget) {
      setAiDailyBudget((current) =>
        mergeAiDailyBudgetSnapshot(current, initialAiDailyBudget),
      );
    }
  }, [initialAiDailyBudget]);

  useEffect(() => {
    if (!accountId) {
      setAiBudgetCacheHydrated(true);
      return;
    }
    let cached: AiDailyBudgetSnapshot | null = null;
    try {
      cached = parseCurrentAiDailyBudgetSnapshot(
        window.localStorage.getItem(aiDailyBudgetStorageKey(accountId)),
      );
    } catch {
      // A failed cache read must not affect server-side budget enforcement.
    }
    if (cached) {
      setAiDailyBudget((current) =>
        mergeAiDailyBudgetSnapshot(current, cached),
      );
    }
    setAiBudgetCacheHydrated(true);
  }, [accountId]);

  useEffect(() => {
    if (!accountId || !aiBudgetCacheHydrated || !aiDailyBudget) return;
    const serialized = JSON.stringify(aiDailyBudget);
    if (!parseCurrentAiDailyBudgetSnapshot(serialized)) return;
    try {
      window.localStorage.setItem(
        aiDailyBudgetStorageKey(accountId),
        serialized,
      );
    } catch {
      // Budget enforcement remains server-side if browser storage is unavailable.
    }
  }, [accountId, aiBudgetCacheHydrated, aiDailyBudget]);

  useEffect(() => {
    if (sessionHydrationStarted.current) return;
    sessionHydrationStarted.current = true;

    const session = parseStudySession(
      window.localStorage.getItem(STUDY_SESSION_KEY),
      sessionQuestions,
    );
    const restoredAnswers: Record<string, string> = {};
    const restoredCodeAnswers: Record<string, string> = {};
    const restoredFeedback: Record<string, CoachFeedback> = {};
    const restoredModels: Record<string, string> = {};
    const restoredCoachAnswers: Record<string, string> = {};
    const restoredInputs: Record<string, string> = {};
    const restoredChats: Record<string, FollowUpChatMessage[]> = {};
    const restoredDeepDiveAnswers: Record<string, string> = {};
    const restoredDeepDiveFeedback: Record<string, CoachFollowUpResponse> = {};
    const restoredDeepDiveModels: Record<string, string> = {};
    const restoredDeepDiveOpen = new Set<string>();
    const restoredRevealed = new Set<string>();
    const restoredHints = new Set<string>();
    const restoredVisibleSources = new Set<string>();

    Object.entries(session.questions).forEach(([questionId, saved]) => {
      if (saved.answer !== undefined) restoredAnswers[questionId] = saved.answer;
      if (saved.codeAnswer !== undefined) {
        restoredCodeAnswers[questionId] = saved.codeAnswer;
      }
      if (saved.revealed) restoredRevealed.add(questionId);
      if (saved.hint) restoredHints.add(questionId);
      if (saved.sourceVisible) restoredVisibleSources.add(questionId);
      if (saved.coachFeedback) restoredFeedback[questionId] = saved.coachFeedback;
      if (saved.coachModel) restoredModels[questionId] = saved.coachModel;
      if (saved.coachAnswer) restoredCoachAnswers[questionId] = saved.coachAnswer;
      if (saved.followUpInput) restoredInputs[questionId] = saved.followUpInput;
      if (saved.followUpChat) restoredChats[questionId] = saved.followUpChat;
      if (saved.deepDiveOpen) restoredDeepDiveOpen.add(questionId);
      if (saved.deepDiveAnswer) {
        restoredDeepDiveAnswers[questionId] = saved.deepDiveAnswer;
      }
      if (saved.deepDiveFeedback) {
        restoredDeepDiveFeedback[questionId] = saved.deepDiveFeedback;
      }
      if (saved.deepDiveModel) restoredDeepDiveModels[questionId] = saved.deepDiveModel;
    });

    setAnswers(restoredAnswers);
    setCodeAnswers(restoredCodeAnswers);
    setRevealed(restoredRevealed);
    setHints(restoredHints);
    setVisibleSources(restoredVisibleSources);
    setCoachFeedback(restoredFeedback);
    setCoachModels(restoredModels);
    setCoachAnswers(restoredCoachAnswers);
    setFollowUpInputs(restoredInputs);
    setFollowUpChats(restoredChats);
    setDeepDiveOpen(restoredDeepDiveOpen);
    setDeepDiveAnswers(restoredDeepDiveAnswers);
    setDeepDiveFeedback(restoredDeepDiveFeedback);
    setDeepDiveModels(restoredDeepDiveModels);
    setSelectedQuestionId(session.activeQuestionId ?? null);
    setSessionHydrated(true);
  }, [sessionQuestions]);

  useEffect(() => {
    setSavedItems(parseSavedItems(window.localStorage.getItem(SAVED_ITEMS_KEY)));
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;

    const saveSession = () => {
      const savedQuestions: Record<string, QuestionStudySession> = {};
      sessionQuestions.forEach((question) => {
        const answer = answers[question.id];
        const codeAnswer = codeAnswers[question.id];
        const feedback = coachFeedback[question.id];
        const model = coachModels[question.id];
        const coachAnswer = coachAnswers[question.id];
        const followUpInput = followUpInputs[question.id];
        const followUpChat = followUpChats[question.id];
        const deepDiveAnswer = deepDiveAnswers[question.id];
        const savedDeepDiveFeedback = deepDiveFeedback[question.id];
        const deepDiveModel = deepDiveModels[question.id];
        const isDeepDiveOpen = deepDiveOpen.has(question.id);
        const isRevealed = revealed.has(question.id);
        const hasHint = hints.has(question.id);
        const sourceVisible = visibleSources.has(question.id);
        const hasSession = Boolean(
          answer ||
            codeAnswer ||
            feedback ||
            followUpInput ||
            followUpChat?.length ||
            deepDiveAnswer ||
            savedDeepDiveFeedback ||
            isDeepDiveOpen ||
            isRevealed ||
            hasHint ||
            sourceVisible,
        );
        if (!hasSession) return;

        savedQuestions[question.id] = {
          questionVersion: question.version,
          sourceHash: question.sourceHash,
          ...(answer ? { answer } : {}),
          ...(codeAnswer ? { codeAnswer } : {}),
          ...(isRevealed ? { revealed: true } : {}),
          ...(hasHint ? { hint: true } : {}),
          ...(sourceVisible ? { sourceVisible: true } : {}),
          ...(feedback ? { coachFeedback: feedback } : {}),
          ...(model ? { coachModel: model } : {}),
          ...(coachAnswer ? { coachAnswer } : {}),
          ...(followUpInput ? { followUpInput } : {}),
          ...(followUpChat?.length ? { followUpChat } : {}),
          ...(isDeepDiveOpen ? { deepDiveOpen: true } : {}),
          ...(deepDiveAnswer ? { deepDiveAnswer } : {}),
          ...(savedDeepDiveFeedback
            ? { deepDiveFeedback: savedDeepDiveFeedback }
            : {}),
          ...(deepDiveModel ? { deepDiveModel } : {}),
        };
      });

      try {
        window.localStorage.setItem(
          STUDY_SESSION_KEY,
          serializeStudySession(
            savedQuestions,
            selectedQuestionId ?? undefined,
          ),
        );
      } catch {
        // Practice remains usable if browser storage is unavailable or full.
      }
    };
    pendingSessionSaveRef.current = saveSession;
    const timeoutId = window.setTimeout(() => {
      saveSession();
      if (pendingSessionSaveRef.current === saveSession) {
        pendingSessionSaveRef.current = null;
      }
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [
    answers,
    coachAnswers,
    coachFeedback,
    coachModels,
    codeAnswers,
    deepDiveAnswers,
    deepDiveFeedback,
    deepDiveModels,
    deepDiveOpen,
    followUpChats,
    followUpInputs,
    hints,
    revealed,
    selectedQuestionId,
    sessionHydrated,
    sessionQuestions,
    visibleSources,
  ]);

  useEffect(
    () => () => {
      pendingSessionSaveRef.current?.();
      pendingSessionSaveRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (snapshot === null || !account || initialSyncStarted.current) return;
    initialSyncStarted.current = true;

    const resetCutoffs = new Map(
      initialQuestionStates
        .filter((state) => state.historyResetOn)
        .map((state) => [state.questionId, state.historyResetOn!]),
    );
    const parsedLocalProgress = parseProgress(
      snapshot === EMPTY_SNAPSHOT ? null : snapshot,
    );
    const localProgress: PracticeProgress = {
      ...parsedLocalProgress,
      reviews: parsedLocalProgress.reviews.filter((review) => {
        const resetOn = resetCutoffs.get(review.questionId);
        return !resetOn || review.reviewedOn > resetOn;
      }),
    };
    const merged = mergeProgress(initialCloudProgress, localProgress);
    saveProgress(JSON.stringify(merged));
    const cloudReviewKeys = new Set(
      initialCloudProgress.reviews.map(
        (review) => `${review.questionId}:${review.reviewedOn}`,
      ),
    );
    const localOnlyReviews = reviewsForCloudSync(merged.reviews).filter(
      (review) => {
        const resetOn = resetCutoffs.get(review.questionId);
        return (
          (!resetOn || review.reviewedOn > resetOn) &&
          !cloudReviewKeys.has(`${review.questionId}:${review.reviewedOn}`)
        );
      },
    );

    void fetch("/api/progress/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviews: localOnlyReviews }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Cloud sync failed");
        const payload = (await response.json()) as {
          progress: PracticeProgress;
          questionStates: QuestionLearningState[];
        };
        const currentLocal = parseProgress(getProgressSnapshot());
        saveProgress(JSON.stringify(mergeProgress(currentLocal, payload.progress)));
        setCloudQuestionStates(payload.questionStates);
        setSyncStatus("synced");
      })
      .catch(() => setSyncStatus("error"));
  }, [account, initialCloudProgress, initialQuestionStates, snapshot]);

  const today = localDateKey();
  const {
    activeDeck,
    completedToday,
    customStudyTopics,
    deckCounts,
    deckQuestions,
    latest,
    learningCounts,
    learningStates,
    questionById,
    remainingIds,
    selectedPendingReview,
    streak,
  } = useMemo(() => {
    const nextDeckCounts = {
      "cpp-interview": 0,
      "python-interview": 0,
      "cmake-build-systems": 0,
    } satisfies Record<PracticeDeckId, number>;
    availableQuestions.forEach((question) => {
      nextDeckCounts[question.taxonomy.deckId] += 1;
    });

    const nextDeckQuestions = availableQuestions.filter(
      (question) => question.taxonomy.deckId === selectedDeck,
    );
    const deckQuestionIds = new Set(
      nextDeckQuestions.map((question) => question.id),
    );
    const nextDeckReviews = progress.reviews.filter((review) =>
      deckQuestionIds.has(review.questionId),
    );
    const nextSelectedPendingReview = pendingReview.filter(
      (question) => question.taxonomy.deckId === selectedDeck,
    );
    const nextQuestionById = new Map(
      nextDeckQuestions.map((question) => [question.id, question]),
    );
    const nextLearningStates = buildLearningStates(
      nextDeckQuestions.map((question) => ({
        id: question.id,
        version: question.version,
        sourceHash: question.sourceHash,
      })),
      nextDeckReviews,
      cloudQuestionStates.filter((state) =>
        deckQuestionIds.has(state.questionId),
      ),
    );
    const nextLatest = latestReviews(nextDeckReviews);
    const nextRemainingIds = buildAnkiDailyQueue(
      nextLearningStates,
      today,
    ).filter(
      (questionId) => nextLatest.get(questionId)?.reviewedOn !== today,
    );
    const nextCompletedToday = new Set(
      nextDeckReviews
        .filter((review) => review.reviewedOn === today)
        .map((review) => review.questionId),
    ).size;

    return {
      activeDeck: PRACTICE_DECKS[selectedDeck],
      completedToday: nextCompletedToday,
      customStudyTopics: [
        ...new Set(
          nextDeckQuestions.flatMap(
            (question) => question.taxonomy.topics,
          ),
        ),
      ].sort(),
      deckCounts: nextDeckCounts,
      deckQuestions: nextDeckQuestions,
      latest: nextLatest,
      learningCounts: countLearningStates(nextLearningStates.values()),
      learningStates: nextLearningStates,
      questionById: nextQuestionById,
      remainingIds: nextRemainingIds,
      selectedPendingReview: nextSelectedPendingReview,
      streak: calculateStreak(nextDeckReviews, today),
    };
  }, [
    availableQuestions,
    cloudQuestionStates,
    pendingReview,
    progress.reviews,
    selectedDeck,
    today,
  ]);

  if (snapshot === null) {
    return <LoadingScreen />;
  }

  const selectedQuestion = selectedQuestionId
    ? questionById.get(selectedQuestionId)
    : undefined;
  const customRemainingIds = (customStudyIds ?? []).filter(
    (questionId) =>
      questionById.has(questionId) &&
      latest.get(questionId)?.reviewedOn !== today,
  );
  const current =
    selectedQuestion && latest.get(selectedQuestion.id)?.reviewedOn !== today
      ? selectedQuestion
      : customStudyIds
        ? questionById.get(customRemainingIds[0])
        : questionById.get(remainingIds[0]);
  const currentLearningState = current
    ? learningStates.get(current.id)
    : undefined;
  const isRandomQuestion = Boolean(
    current && selectedQuestionId === current.id && !remainingIds.includes(current.id),
  );
  const isCustomStudyQuestion = Boolean(
    current && customStudyIds?.includes(current.id),
  );
  const randomCandidates = deckQuestions.filter(
    (question) =>
      question.id !== current?.id && latest.get(question.id)?.reviewedOn !== today,
  );
  const hasAnswered = Boolean(
    current && (coachFeedback[current.id] || revealed.has(current.id)),
  );
  const currentSuggestedRating = current
    ? ratingOptions.find(
        (option) => option.value === coachFeedback[current.id]?.suggestedRating,
      )
    : undefined;
  const dailyTotal = completedToday + remainingIds.length;

  async function approveAllPending() {
    if (!selectedPendingReview.length || approvalStatus === "saving") return;
    setApprovalStatus("saving");
    try {
      const response = await fetch("/api/questions/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: selectedPendingReview.map((question) => ({
            questionId: question.id,
            questionVersion: question.version,
            sourceHash: question.sourceHash,
          })),
        }),
      });
      if (!response.ok) throw new Error("Approval failed");
      setAvailableQuestions((currentQuestions) => {
        const known = new Set(currentQuestions.map((question) => question.id));
        return [
          ...currentQuestions,
          ...selectedPendingReview.filter((question) => !known.has(question.id)),
        ];
      });
      const approvedIds = new Set(
        selectedPendingReview.map((question) => question.id),
      );
      setPendingReview((current) =>
        current.filter((question) => !approvedIds.has(question.id)),
      );
      setApprovalStatus("idle");
    } catch {
      setApprovalStatus("error");
    }
  }

  function rateCurrent(rating: Rating) {
    if (!current || !currentLearningState) return;
    const scheduled = scheduleQuestionReview(
      currentLearningState,
      rating,
      today,
    );
    const updated = recordScheduledReview(progress, scheduled.review);
    saveProgress(JSON.stringify(updated));
    if (isCustomStudyQuestion && customRemainingIds.length <= 1) {
      setCustomStudyIds(null);
      setCustomStudyNotice("Đã hoàn thành phiên Custom Study.");
    }
    setSelectedQuestionId(null);
    clearStudySessionState();
    if (account) {
      void syncReviews([scheduled.review]);
    }
  }

  function startCustomStudy(filters: CustomStudyFilters) {
    const ids = buildCustomStudyQueue(
      deckQuestions,
      learningStates,
      today,
      filters,
    );
    if (!ids.length) {
      setCustomStudyNotice("Không có câu nào khớp bộ lọc Custom Study.");
      return;
    }
    clearStudySessionState();
    setSelectedQuestionId(null);
    setCustomStudyIds(ids);
    setCustomStudyNotice(`Đã tạo phiên Custom Study gồm ${ids.length} câu.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showRandomQuestion() {
    if (!randomCandidates.length) return;
    const next = randomCandidates[Math.floor(Math.random() * randomCandidates.length)];
    clearStudySessionState();
    setCustomStudyIds(null);
    setSelectedQuestionId(next.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectDeck(deck: PracticeDeckId) {
    if (deck === requestedDeck) return;
    setRequestedDeck(deck);
    const url = new URL(window.location.href);
    url.searchParams.set("deck", deck);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
    startDeckTransition(() => {
      clearStudySessionState();
      setSelectedQuestionId(null);
      setCustomStudyIds(null);
      setCustomStudyNotice(null);
      setSelectedDeck(deck);
    });
  }

  function toggleReferenceAnswer() {
    if (!current) return;
    scrollToRatingWhenAvailable.current = !revealed.has(current.id);
    toggleSet(setRevealed, current.id);
  }

  function handleRatingSectionRef(node: HTMLDivElement | null) {
    if (!node || !scrollToRatingWhenAvailable.current) return;
    scrollToRatingWhenAvailable.current = false;
    window.requestAnimationFrame(() =>
      node.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  function clearStudySessionState() {
    setAnswers({});
    setCodeAnswers({});
    setCoachFeedback({});
    setCoachModels({});
    setCoachAnswers({});
    setCoachErrors({});
    setFollowUpInputs({});
    setFollowUpChats({});
    setFollowUpErrors({});
    setDeepDiveAnswers({});
    setDeepDiveFeedback({});
    setDeepDiveErrors({});
    setDeepDiveOpen(new Set());
    setRevealed(new Set());
    setHints(new Set());
    setVisibleSources(new Set());
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
      const payload = (await response.json()) as {
        progress: PracticeProgress;
        questionStates: QuestionLearningState[];
      };
      const currentLocal = parseProgress(getProgressSnapshot());
      saveProgress(JSON.stringify(mergeProgress(currentLocal, payload.progress)));
      setCloudQuestionStates(payload.questionStates);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }

  async function askCoach() {
    if (!current) return;
    const answer = buildCandidateAnswer(
      current,
      answers[current.id] ?? "",
      codeAnswers[current.id] ?? "",
    );
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
        aiDailyBudget?: AiDailyBudgetSnapshot | null;
        aiUsageRecorded?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.feedback) {
        throw new Error(payload.error || "AI coach chưa trả lời được.");
      }

      scrollToRatingWhenAvailable.current = true;
      setCoachFeedback((feedback) => ({
        ...feedback,
        [current.id]: payload.feedback!,
      }));
      setCoachModels((models) => ({
        ...models,
        [current.id]: payload.model || "OpenAI",
      }));
      setCoachAnswers((evaluatedAnswers) => ({
        ...evaluatedAnswers,
        [current.id]: answer,
      }));
      if (payload.aiDailyBudget) {
        setAiDailyBudget((current) =>
          mergeAiDailyBudgetSnapshot(current, payload.aiDailyBudget!),
        );
      }
      if (payload.aiUsageRecorded === false) {
        setCoachErrors((errors) => ({
          ...errors,
          [current.id]:
            "AI đã chấm xong nhưng bộ đếm usage chưa ghi được. Tạm dừng gọi thêm OpenAI và kiểm tra log.",
        }));
      }
      setFollowUpChats((chats) => ({ ...chats, [current.id]: [] }));
      setDeepDiveOpen((open) => withoutSetValue(open, current.id));
      setDeepDiveAnswers((answers) => omitRecordKey(answers, current.id));
      setDeepDiveFeedback((feedback) => omitRecordKey(feedback, current.id));
      setDeepDiveModels((models) => omitRecordKey(models, current.id));
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

  async function askCoachFollowUp(contentOverride?: string) {
    if (!current || !coachFeedback[current.id]) return;
    const content =
      contentOverride?.trim() ?? followUpInputs[current.id]?.trim() ?? "";
    const existingMessages = followUpChats[current.id] ?? [];
    if (!content || existingMessages.length >= 8) return;

    const requestMessages = [
      ...existingMessages.map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      })),
      { role: "user" as const, content },
    ];
    setFollowUpLoading(current.id);
    setFollowUpErrors((errors) => ({ ...errors, [current.id]: "" }));

    try {
      const response = await fetch("/api/coach/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: current.id,
          candidateAnswer: coachAnswers[current.id],
          feedback: coachFeedback[current.id],
          messages: requestMessages,
        }),
      });
      const payload = (await response.json()) as {
        reply?: CoachFollowUpResponse;
        model?: string;
        aiDailyBudget?: AiDailyBudgetSnapshot | null;
        aiUsageRecorded?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || "AI chưa giải thích thêm được.");
      }

      setFollowUpChats((chats) => ({
        ...chats,
        [current.id]: [
          ...(chats[current.id] ?? []),
          { role: "user", content },
          {
            role: "assistant",
            content: payload.reply!.answer,
            sourceSectionIds: payload.reply!.sourceSectionIds,
            checkQuestion: payload.reply!.checkQuestion,
            model: payload.model,
          },
        ],
      }));
      setFollowUpInputs((inputs) => ({ ...inputs, [current.id]: "" }));
      if (payload.aiDailyBudget) {
        setAiDailyBudget((current) =>
          mergeAiDailyBudgetSnapshot(current, payload.aiDailyBudget!),
        );
      }
      if (payload.aiUsageRecorded === false) {
        setFollowUpErrors((errors) => ({
          ...errors,
          [current.id]: "AI đã trả lời nhưng bộ đếm usage chưa ghi được.",
        }));
      }
    } catch (error) {
      setFollowUpErrors((errors) => ({
        ...errors,
        [current.id]:
          error instanceof Error ? error.message : "AI chưa giải thích thêm được.",
      }));
    } finally {
      setFollowUpLoading(null);
    }
  }

  async function submitDeepDiveAnswer() {
    if (!current || !coachFeedback[current.id]) return;
    const answer = deepDiveAnswers[current.id]?.trim() ?? "";
    const followUpQuestion = coachFeedback[current.id].followUpQuestion;
    if (answer.length < 10) return;

    setDeepDiveLoading(current.id);
    setDeepDiveErrors((errors) => ({ ...errors, [current.id]: "" }));
    try {
      const response = await fetch("/api/coach/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: current.id,
          candidateAnswer: coachAnswers[current.id],
          feedback: coachFeedback[current.id],
          messages: [
            {
              role: "user",
              content: `Đây là câu hỏi phỏng vấn mở rộng: ${followUpQuestion}\n\nCâu trả lời tôi tự làm: ${answer}\n\nHãy nhận xét câu trả lời như interviewer: chỉ ra phần đúng, phần thiếu hoặc sai, rồi mới giải thích để tôi hiểu sâu hơn.`,
            },
          ],
        }),
      });
      const payload = (await response.json()) as {
        reply?: CoachFollowUpResponse;
        model?: string;
        aiDailyBudget?: AiDailyBudgetSnapshot | null;
        aiUsageRecorded?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || "AI chưa chấm được câu mở rộng.");
      }
      setDeepDiveFeedback((feedback) => ({
        ...feedback,
        [current.id]: payload.reply!,
      }));
      setDeepDiveModels((models) => ({
        ...models,
        [current.id]: payload.model || "OpenAI",
      }));
      if (payload.aiDailyBudget) {
        setAiDailyBudget((current) =>
          mergeAiDailyBudgetSnapshot(current, payload.aiDailyBudget!),
        );
      }
      if (payload.aiUsageRecorded === false) {
        setDeepDiveErrors((errors) => ({
          ...errors,
          [current.id]: "AI đã trả lời nhưng bộ đếm usage chưa ghi được.",
        }));
      }
    } catch (error) {
      setDeepDiveErrors((errors) => ({
        ...errors,
        [current.id]:
          error instanceof Error ? error.message : "AI chưa chấm được câu mở rộng.",
      }));
    } finally {
      setDeepDiveLoading(null);
    }
  }

  function toggleSavedItem(item: Omit<SavedItem, "savedAt">) {
    setSavedItems((items) => {
      const exists = items.some((saved) => saved.id === item.id);
      const next = exists
        ? removeSavedItem(items, item.id)
        : upsertSavedItem(items, {
            ...item,
            savedAt: new Date().toISOString(),
          });
      try {
        window.localStorage.setItem(SAVED_ITEMS_KEY, JSON.stringify(next));
      } catch {
        // Saving remains optional when browser storage is unavailable.
      }
      return next;
    });
  }

  function isSaved(itemId: string) {
    return savedItems.some((item) => item.id === itemId);
  }

  function deleteSavedItem(itemId: string) {
    setSavedItems((items) => {
      const next = removeSavedItem(items, itemId);
      try {
        window.localStorage.setItem(SAVED_ITEMS_KEY, JSON.stringify(next));
      } catch {
        // Saved library remains usable in memory for this page view.
      }
      return next;
    });
  }

  function updateAnswer(questionId: string, value: string) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: value,
    }));
    setCoachFeedback((values) => omitRecordKey(values, questionId));
    setCoachModels((values) => omitRecordKey(values, questionId));
    setCoachAnswers((values) => omitRecordKey(values, questionId));
    setCoachErrors((values) => omitRecordKey(values, questionId));
    setFollowUpInputs((values) => omitRecordKey(values, questionId));
    setFollowUpChats((values) => omitRecordKey(values, questionId));
    setFollowUpErrors((values) => omitRecordKey(values, questionId));
  }

  function updateCodeAnswer(questionId: string, value: string) {
    setCodeAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: value,
    }));
    setCoachFeedback((values) => omitRecordKey(values, questionId));
    setCoachModels((values) => omitRecordKey(values, questionId));
    setCoachAnswers((values) => omitRecordKey(values, questionId));
    setCoachErrors((values) => omitRecordKey(values, questionId));
    setFollowUpInputs((values) => omitRecordKey(values, questionId));
    setFollowUpChats((values) => omitRecordKey(values, questionId));
    setFollowUpErrors((values) => omitRecordKey(values, questionId));
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

  function omitRecordKey<T>(values: Record<string, T>, key: string) {
    return Object.fromEntries(
      Object.entries(values).filter(([entryKey]) => entryKey !== key),
    ) as Record<string, T>;
  }

  function withoutSetValue(values: Set<string>, value: string) {
    const next = new Set(values);
    next.delete(value);
    return next;
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#173f35]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#173f35] font-mono text-sm font-bold text-[#d7ff91] shadow-sm">
              {PRACTICE_DECKS[requestedDeck].badge}
            </span>
            <div>
              <p className="font-semibold tracking-[-0.02em]">Recall</p>
              <p className="text-xs text-[#64736c]">Interview practice</p>
            </div>
            <DeckSwitcher
              selected={requestedDeck}
              counts={deckCounts}
              pending={deckTransitionPending}
              onSelect={selectDeck}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <StatPill icon="◆" value={`${streak} ngày`} label="streak" />
            <StatPill
              icon="✓"
              value={`${completedToday}/${dailyTotal || 1}`}
              label="hôm nay"
            />
            {account && aiBudgetCacheHydrated && aiDailyBudget ? (
              <AiBudgetPill budget={aiDailyBudget} />
            ) : null}
            <SavedItemsControl
              items={savedItems}
              onRemove={deleteSavedItem}
              onOpenQuestion={(questionId) => {
                const question = sessionQuestions.find(
                  (item) => item.id === questionId,
                );
                if (!question) return;
                const nextDeck = question.taxonomy.deckId;
                clearStudySessionState();
                setRequestedDeck(nextDeck);
                setSelectedDeck(nextDeck);
                setSelectedQuestionId(questionId);
                const url = new URL(window.location.href);
                url.searchParams.set("deck", nextDeck);
                window.history.replaceState(null, "", url);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
            <AccountControl
              account={account}
              cloudEnabled={cloudEnabled}
              syncStatus={syncStatus}
              selectedDeck={requestedDeck}
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

        <CustomStudyPanel
          key={selectedDeck}
          language={activeDeck.language}
          topics={customStudyTopics}
          activeCount={customRemainingIds.length}
          notice={customStudyNotice}
          onStart={startCustomStudy}
          onStop={() => {
            setCustomStudyIds(null);
            setCustomStudyNotice("Đã dừng Custom Study, quay lại lịch hôm nay.");
          }}
        />

        {!current && selectedPendingReview.length ? (
          <section className="mt-7 rounded-3xl border border-[#ba4b2f]/25 bg-[#fff4df] p-6 sm:p-8">
            <p className="font-mono text-xs tracking-[0.15em] text-[#ba4b2f] uppercase">
              Review queue
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">
                  {selectedPendingReview.length} câu chờ duyệt
                </h1>
                <p className="mt-1 text-sm text-[#64736c]">
                  Duyệt xong, các câu này sẽ được đưa vào lịch ôn cá nhân.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void approveAllPending()}
                disabled={approvalStatus === "saving"}
                className="rounded-2xl bg-[#ba4b2f] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#963a25] disabled:cursor-wait disabled:opacity-60"
              >
                {approvalStatus === "saving" ? "Đang duyệt…" : "Duyệt tất cả"}
              </button>
            </div>
            {approvalStatus === "error" ? (
              <p className="mt-3 text-xs font-semibold text-[#a3321f]">
                Chưa lưu được approval. Kiểm tra migration rồi thử lại.
              </p>
            ) : null}
          </section>
        ) : null}

        {current ? (
          <div className="grid gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-10">
            <section>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#d7ff91] px-3 py-1 font-mono text-xs font-bold text-[#173f35]">
                    {isCustomStudyQuestion
                      ? "CUSTOM STUDY"
                      : isRandomQuestion
                      ? "CÂU NGẪU NHIÊN"
                      : completedToday === 0
                        ? "CÂU HÔM NAY"
                        : "ÔN ĐẾN HẠN"}
                  </span>
                  <span className="font-mono text-xs text-[#6c7b73]">
                    {isCustomStudyQuestion && customStudyIds
                      ? `${customStudyIds.length - customRemainingIds.length + 1}/${customStudyIds.length}`
                      : isRandomQuestion
                      ? "ngoài lịch hôm nay"
                      : `${completedToday + 1}/${dailyTotal}`}
                  </span>
                  {currentLearningState ? (
                    <span className="rounded-full border border-[#173f35]/15 bg-white/55 px-2.5 py-1 font-mono text-[10px] font-bold text-[#356b58] uppercase">
                      {learningStateLabels[currentLearningState.state]}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      toggleSavedItem({
                        id: `question:${current.id}`,
                        kind: "question",
                        questionId: current.id,
                        title: current.lessonTitle,
                        content: displayQuestionPrompt(current),
                        context: current.code || current.sourcePath,
                      })
                    }
                    className="rounded-xl border border-[#173f35]/18 bg-white/65 px-3 py-2 text-xs font-bold text-[#356b58] transition hover:-translate-y-0.5 hover:bg-white focus:ring-4 focus:ring-[#d7ff91]/55 focus:outline-none"
                  >
                    {isSaved(`question:${current.id}`) ? "★ Đã lưu" : "☆ Lưu câu hỏi"}
                  </button>
                  <button
                    type="button"
                    onClick={showRandomQuestion}
                    disabled={!randomCandidates.length}
                    className="rounded-xl border border-[#173f35]/18 bg-white/65 px-3 py-2 text-xs font-bold text-[#356b58] transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 focus:ring-4 focus:ring-[#d7ff91]/55 focus:outline-none"
                  >
                    ↻ Câu khác ngẫu nhiên
                  </button>
                  <span className="font-mono text-xs text-[#6c7b73]">{today}</span>
                </div>
              </div>

              <article className="overflow-hidden rounded-[2rem] border border-[#173f35]/15 bg-white/65 shadow-[0_20px_70px_rgba(23,63,53,0.08)] backdrop-blur-sm">
                <div className="p-6 sm:p-9 lg:p-11">
                  {hasAnswered ? (
                    <div className="flex flex-wrap gap-2">
                      <Tag>{standardLabels[current.standard]}</Tag>
                      <Tag>{current.type.replace("_", " ")}</Tag>
                      <Tag>{current.difficulty}</Tag>
                      <Tag>~{current.estimatedMinutes} phút</Tag>
                    </div>
                  ) : null}

                  <h1
                    className={`${hasAnswered ? "mt-7" : ""} max-w-4xl text-3xl leading-[1.16] font-semibold tracking-[-0.04em] text-[#17221d] sm:text-4xl lg:text-[2.85rem]`}
                  >
                    <InlineCode text={displayQuestionPrompt(current)} />
                  </h1>

                  {current.code ? (
                    <pre className="mt-7 overflow-x-auto rounded-2xl border border-[#d7ff91]/20 bg-[#102d26] p-5 font-mono text-[13px] leading-6 text-[#e8f4ec] shadow-inner sm:text-sm">
                      <code>{current.code}</code>
                    </pre>
                  ) : null}

                  {requiresCodeAnswer(current) ? (
                    <div className="mt-8 space-y-5">
                      <ScenarioCodeEditor
                        language={current.language}
                        value={codeAnswers[current.id] ?? ""}
                        onChange={(value) => updateCodeAnswer(current.id, value)}
                      />
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label
                            className="text-sm font-semibold text-[#344a40]"
                            htmlFor="candidate-answer"
                          >
                            Giải thích lựa chọn thiết kế
                          </label>
                          <span className="font-mono text-[11px] text-[#6c7b73]">
                            không bắt buộc · {(answers[current.id] ?? "").length}/{SCENARIO_EXPLANATION_MAX}
                          </span>
                        </div>
                        <textarea
                          id="candidate-answer"
                          value={answers[current.id] ?? ""}
                          onChange={(event) => updateAnswer(current.id, event.target.value)}
                          maxLength={SCENARIO_EXPLANATION_MAX}
                          className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-[#173f35]/20 bg-[#fbfaf5] px-4 py-3 leading-7 outline-none transition focus:border-[#356b58] focus:ring-4 focus:ring-[#d7ff91]/45"
                          placeholder="Giải thích ownership, API, trade-off và các quyết định quan trọng…"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
                        <label
                          className="text-sm font-semibold text-[#344a40]"
                          htmlFor="candidate-answer"
                        >
                          Câu trả lời của mày
                        </label>
                        <span className="font-mono text-[11px] text-[#6c7b73]">
                          ● tự lưu trên trình duyệt
                        </span>
                      </div>
                      <textarea
                        id="candidate-answer"
                        value={answers[current.id] ?? ""}
                        onChange={(event) => updateAnswer(current.id, event.target.value)}
                        maxLength={6000}
                        className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-[#173f35]/20 bg-[#fbfaf5] px-4 py-3 leading-7 outline-none transition focus:border-[#356b58] focus:ring-4 focus:ring-[#d7ff91]/45"
                        placeholder="Tự trả lời như đang ngồi phỏng vấn…"
                      />
                    </>
                  )}

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
                          (requiresCodeAnswer(current)
                            ? (codeAnswers[current.id]?.trim().length ?? 0) < 10
                            : (answers[current.id]?.trim().length ?? 0) < 10) ||
                          coachLoading === current.id
                        }
                        className="rounded-xl border border-[#356b58]/25 bg-[#d7ff91] px-5 py-3 text-sm font-bold text-[#173f35] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus:ring-4 focus:ring-[#d7ff91]/60 focus:outline-none"
                      >
                        {coachLoading === current.id ? "AI đang chấm…" : "Nhờ AI chấm"}
                      </button>
                      <button
                        type="button"
                        onClick={toggleReferenceAnswer}
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

                  {hasAnswered ? (
                    <div
                      ref={handleRatingSectionRef}
                      className="sticky bottom-3 z-20 mt-5 scroll-m-4 rounded-3xl border-2 border-[#356b58]/35 bg-[#fffef9]/95 p-4 shadow-[0_16px_45px_rgba(23,63,53,0.18)] backdrop-blur-md sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-[#173f35]">
                            Chấm mức độ ghi nhớ để sang câu tiếp theo
                          </p>
                          <p className="mt-0.5 text-xs text-[#5c6e65]">
                            {revealed.has(current.id)
                              ? "So với đáp án, mày nhớ được tới đâu?"
                              : "AI đã chấm xong — giờ mày tự chọn mức phù hợp."}
                          </p>
                        </div>
                        {currentSuggestedRating ? (
                          <span className="rounded-full bg-[#d7ff91]/70 px-3 py-1 text-xs font-semibold text-[#356b58]">
                            AI gợi ý: {currentSuggestedRating.label}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {ratingOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => rateCurrent(option.value)}
                            data-tone={option.tone}
                            className="rating-button rounded-2xl border bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
                          >
                            <span className="block text-sm font-bold">{option.label}</span>
                            <span className="mt-1 block font-mono text-[11px] opacity-65">
                              lại sau{" "}
                              {currentLearningState
                                ? `${ratingIntervalDays(currentLearningState, option.value)} ngày`
                                : option.interval}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {coachFeedback[current.id] ? (
                    <>
                      <CoachFeedbackPanel
                        feedback={coachFeedback[current.id]}
                        model={coachModels[current.id]}
                        learningActionLoading={followUpLoading === current.id}
                        learningActionDisabled={
                          (followUpChats[current.id]?.length ?? 0) >= 8
                        }
                        deepDiveOpen={deepDiveOpen.has(current.id)}
                        feedbackSaved={isSaved(
                          `ai-feedback:${current.id}:${current.version}:${current.sourceHash}`,
                        )}
                        onToggleSaveFeedback={() =>
                          toggleSavedItem({
                            id: `ai-feedback:${current.id}:${current.version}:${current.sourceHash}`,
                            kind: "ai_answer",
                            questionId: current.id,
                            title: `AI feedback · ${current.lessonTitle}`,
                            content: formatCoachFeedback(coachFeedback[current.id]),
                            context: displayQuestionPrompt(current),
                          })
                        }
                        onExpandNextStep={() =>
                          void askCoachFollowUp(
                            `Hãy biến bước tiếp theo này thành một bài học mini dễ hiểu, có ví dụ ${current.language === "python" ? "Python" : "C++"} ngắn và một bài tập nhỏ: ${coachFeedback[current.id].nextStep}`,
                          )
                        }
                        onExploreInterviewerQuestion={() =>
                          toggleSet(setDeepDiveOpen, current.id)
                        }
                      />
                      {deepDiveOpen.has(current.id) ? (
                        <DeepDivePracticePanel
                          question={current}
                          prompt={coachFeedback[current.id].followUpQuestion}
                          answer={deepDiveAnswers[current.id] ?? ""}
                          feedback={deepDiveFeedback[current.id]}
                          model={deepDiveModels[current.id]}
                          error={deepDiveErrors[current.id]}
                          loading={deepDiveLoading === current.id}
                          feedbackSaved={isSaved(
                            `ai-deep-dive:${current.id}:${current.version}:${current.sourceHash}`,
                          )}
                          onAnswer={(value) =>
                            setDeepDiveAnswers((answers) => ({
                              ...answers,
                              [current.id]: value,
                            }))
                          }
                          onSubmit={() => void submitDeepDiveAnswer()}
                          onToggleSaveFeedback={() => {
                            const feedback = deepDiveFeedback[current.id];
                            if (!feedback) return;
                            toggleSavedItem({
                              id: `ai-deep-dive:${current.id}:${current.version}:${current.sourceHash}`,
                              kind: "ai_answer",
                              questionId: current.id,
                              title: `Đào sâu · ${current.lessonTitle}`,
                              content: feedback.answer,
                              context: coachFeedback[current.id].followUpQuestion,
                            });
                          }}
                        />
                      ) : null}
                      <CoachFollowUpPanel
                        question={current}
                        messages={followUpChats[current.id] ?? []}
                        input={followUpInputs[current.id] ?? ""}
                        error={followUpErrors[current.id]}
                        loading={followUpLoading === current.id}
                        isMessageSaved={(index) =>
                          isSaved(`ai-follow-up:${current.id}:${index}`)
                        }
                        onToggleSaveMessage={(index, message) =>
                          toggleSavedItem({
                            id: `ai-follow-up:${current.id}:${index}`,
                            kind: "ai_answer",
                            questionId: current.id,
                            title: `AI giải thích · ${current.lessonTitle}`,
                            content: message.content,
                            context: displayQuestionPrompt(current),
                          })
                        }
                        onInput={(value) =>
                          setFollowUpInputs((inputs) => ({
                            ...inputs,
                            [current.id]: value,
                          }))
                        }
                        onSubmit={askCoachFollowUp}
                      />
                    </>
                  ) : null}
                </div>

                {revealed.has(current.id) ? (
                  <div
                    className="scroll-mt-6 border-t border-[#173f35]/12 bg-[#edf3e9] p-6 sm:p-9 lg:p-11"
                  >
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
                      onClick={() => toggleSet(setVisibleSources, current.id)}
                      className="mt-6 text-sm font-bold text-[#356b58] underline decoration-[#356b58]/35 underline-offset-4"
                    >
                      {visibleSources.has(current.id)
                        ? "Ẩn note nguồn"
                        : "Đối chiếu note nguồn"}
                    </button>
                    {visibleSources.has(current.id) ? (
                      <SourceNotes question={current} />
                    ) : null}

                  </div>
                ) : null}
              </article>
            </section>

            <aside className="space-y-4 lg:pt-12">
              {selectedPendingReview.length ? (
                <div className="rounded-3xl border border-[#ba4b2f]/25 bg-[#fff4df] p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs tracking-[0.15em] text-[#ba4b2f] uppercase">
                        Review queue
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {selectedPendingReview.length} câu chờ duyệt
                      </p>
                    </div>
                    <span className="rounded-full bg-[#ba4b2f] px-2.5 py-1 font-mono text-xs font-bold text-white">
                      {selectedPendingReview.length}
                    </span>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-[#596a62]">
                    {selectedPendingReview.slice(0, 3).map((question) => (
                      <li key={question.id} className="line-clamp-2">
                        <span className="font-mono text-[10px] font-bold text-[#ba4b2f] uppercase">
                          {question.status === "draft" ? "AI draft" : "Nguồn đã đổi"}
                        </span>{" "}
                        · {displayQuestionPrompt(question)}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => void approveAllPending()}
                    disabled={approvalStatus === "saving"}
                    className="mt-5 w-full rounded-2xl bg-[#ba4b2f] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#963a25] disabled:cursor-wait disabled:opacity-60"
                  >
                    {approvalStatus === "saving" ? "Đang duyệt…" : "Duyệt tất cả"}
                  </button>
                  {approvalStatus === "error" ? (
                    <p className="mt-3 text-xs font-semibold text-[#a3321f]">
                      Chưa lưu được approval. Kiểm tra migration rồi thử lại.
                    </p>
                  ) : null}
                </div>
              ) : null}

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
                  {remainingIds.length} câu còn lại · 1 mới + 5 ôn/ngày
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                  <LearningCount label="Mới" value={learningCounts.new} />
                  <LearningCount label="Đang học" value={learningCounts.learning} />
                  <LearningCount label="Ôn tập" value={learningCounts.review} />
                  <LearningCount label="Học lại" value={learningCounts.relearning} />
                </div>
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

              {hasAnswered ? (
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
              ) : null}

              <div className="rounded-3xl border border-[#356b58]/20 bg-[#eef4e9] p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">AI coach</p>
                  <span className="size-2 rounded-full bg-[#65a30d] shadow-[0_0_0_4px_rgba(101,163,13,0.12)]" />
                </div>
                <p className="mt-2 text-sm leading-6 text-[#64736c]">
                  Chấm theo đúng rubric và note nguồn, sau đó gợi ý một câu follow-up.
                </p>
                <span className="mt-4 inline-block rounded-full bg-[#d7ff91] px-3 py-1 font-mono text-[11px] font-semibold text-[#356b58]">
                  OpenAI · Luna chấm bài / Terra đào sâu · Gemini khi hết quota
                </span>
              </div>
            </aside>
          </div>
        ) : deckQuestions.length ? (
          <CompletionScreen
            completedToday={completedToday}
            streak={streak}
            today={today}
            hasRandomQuestion={randomCandidates.length > 0}
            onRandomQuestion={showRandomQuestion}
          />
        ) : (
          <DeckEmptyState
            deck={selectedDeck}
            pendingCount={selectedPendingReview.length}
          />
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#173f35]/12 py-5 font-mono text-[11px] text-[#78857f]">
          <span>
            {account ? `Private sync · ${account.displayName}` : "Progress lưu trên trình duyệt này"}
          </span>
          <span>notes@{sourceRevision.slice(0, 7)}</span>
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
          R
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
  hasRandomQuestion,
  onRandomQuestion,
}: {
  completedToday: number;
  streak: number;
  today: string;
  hasRandomQuestion: boolean;
  onRandomQuestion: () => void;
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
        {hasRandomQuestion ? (
          <button
            type="button"
            onClick={onRandomQuestion}
            className="mt-7 rounded-2xl bg-[#173f35] px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#245748] focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
          >
            ↻ Luyện thêm câu ngẫu nhiên
          </button>
        ) : null}
      </div>
    </section>
  );
}

function CustomStudyPanel({
  language,
  topics,
  activeCount,
  notice,
  onStart,
  onStop,
}: {
  language: ContentLanguage;
  topics: string[];
  activeCount: number;
  notice: string | null;
  onStart: (filters: CustomStudyFilters) => void;
  onStop: () => void;
}) {
  const [learningState, setLearningState] = useState<
    CustomStudyFilters["learningState"]
  >("all");
  const [standard, setStandard] = useState<CustomStudyFilters["standard"]>(
    "all",
  );
  const [skill, setSkill] = useState<CustomStudyFilters["skill"]>("all");
  const [topic, setTopic] = useState("all");
  const [limit, setLimit] = useState(10);

  return (
    <details className="mt-5 rounded-2xl border border-[#173f35]/15 bg-white/55 px-4 py-3 open:bg-white/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-[#356b58]">
        <span>Custom Study · ôn theo trạng thái hoặc tag</span>
        <span className="font-mono text-xs">
          {activeCount ? `${activeCount} câu còn lại` : "Mở bộ lọc ↓"}
        </span>
      </summary>
      <div className="mt-4 grid gap-3 border-t border-[#173f35]/10 pt-4 sm:grid-cols-2 lg:grid-cols-5">
        <StudySelect
          label="Trạng thái"
          value={learningState}
          onChange={(value) =>
            setLearningState(value as CustomStudyFilters["learningState"])
          }
          options={[
            ["all", "Tất cả"],
            ["new", "Mới"],
            ["learning", "Đang học"],
            ["review", "Ôn tập"],
            ["relearning", "Học lại"],
            ["due", "Đến hạn"],
            ["leech", "Leech"],
          ]}
        />
        <StudySelect
          label={
            language === "python"
              ? "Python"
              : language === "cmake"
                ? "CMake"
                : "C++"
          }
          value={standard}
          onChange={(value) =>
            setStandard(value as CustomStudyFilters["standard"])
          }
          options={
            language === "cmake"
              ? [
                  ["all", "Mọi version"],
                  ["cmake", "CMake"],
                ]
              : language === "python"
              ? [
                  ["all", "Mọi version"],
                  ["python3", "Python 3"],
                ]
              : [
                  ["all", "Mọi version"],
                  ["cpp98", "C++98"],
                  ["cpp11", "C++11"],
                  ["cpp20", "C++20"],
                ]
          }
        />
        <StudySelect
          label="Kỹ năng"
          value={skill}
          onChange={(value) => setSkill(value as CustomStudyFilters["skill"])}
          options={[
            ["all", "Mọi loại"],
            ["recall", "Recall"],
            ["code_reasoning", "Code reasoning"],
            ["pitfall", "Pitfall"],
            ["scenario", "Scenario"],
          ]}
        />
        <StudySelect
          label="Topic"
          value={topic}
          onChange={setTopic}
          options={[
            ["all", "Mọi topic"],
            ...topics.map((item): [string, string] => [item, item]),
          ]}
        />
        <label className="text-xs font-bold text-[#52645c]">
          Số câu
          <input
            type="number"
            min={1}
            max={20}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="mt-1 w-full rounded-xl border border-[#173f35]/15 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            onStart({ learningState, standard, skill, topic, limit })
          }
          className="rounded-xl bg-[#173f35] px-4 py-2.5 text-xs font-bold text-white"
        >
          Bắt đầu phiên học
        </button>
        {activeCount ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-xl border border-[#ba4b2f]/25 bg-white px-4 py-2.5 text-xs font-bold text-[#8e3825]"
          >
            Dừng phiên
          </button>
        ) : null}
        {notice ? <p className="text-xs text-[#64736c]">{notice}</p> : null}
      </div>
      <p className="mt-3 text-[11px] text-[#718078]">
        Rating trong Custom Study vẫn cập nhật lịch Anki của câu hỏi.
      </p>
    </details>
  );
}

function StudySelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="text-xs font-bold text-[#52645c]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-[#173f35]/15 bg-white px-3 py-2 text-sm"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function LearningCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2">
      <span className="block font-mono text-[10px] tracking-wide text-white/55 uppercase">
        {label}
      </span>
      <strong className="mt-0.5 block text-base text-[#d7ff91]">{value}</strong>
    </div>
  );
}

function DeckEmptyState({
  deck,
  pendingCount,
}: {
  deck: PracticeDeckId;
  pendingCount: number;
}) {
  const config = PRACTICE_DECKS[deck];
  return (
    <section className="grid min-h-[64vh] place-items-center py-12">
      <div className="max-w-xl rounded-[2rem] border border-[#173f35]/15 bg-white/65 p-8 text-center shadow-[0_20px_70px_rgba(23,63,53,0.08)] sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#173f35] font-mono text-lg font-bold text-[#d7ff91]">
          {config.badge}
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Chưa có câu đã duyệt trong {config.label}.
        </h1>
        <p className="mt-4 leading-7 text-[#64736c]">
          {pendingCount
            ? `${pendingCount} câu đang nằm trong Review Queue. Duyệt chúng để bắt đầu luyện.`
            : deck === "cmake-build-systems"
              ? "Thêm bài vào cmake/<tên-bài>/knowledge.md; pipeline sẽ tạo draft và đưa vào Review Queue."
              : deck === "python-interview"
              ? "Thêm bài vào python/<tên-bài>/knowledge.md; pipeline sẽ tạo draft và đưa vào Review Queue."
              : "Thêm hoặc duyệt câu hỏi trong Admin để bắt đầu luyện."}
        </p>
        <Link
          href="/admin"
          className="mt-7 inline-flex rounded-2xl bg-[#173f35] px-5 py-3 text-sm font-bold text-white"
        >
          Mở Admin
        </Link>
      </div>
    </section>
  );
}

function DeckSwitcher({
  selected,
  counts,
  pending,
  onSelect,
}: {
  selected: PracticeDeckId;
  counts: Record<PracticeDeckId, number>;
  pending: boolean;
  onSelect: (deck: PracticeDeckId) => void;
}) {
  return (
    <div
      className="ml-1 flex rounded-xl border border-[#173f35]/15 bg-white/55 p-1"
      aria-label="Chọn bộ câu hỏi"
    >
      {ENABLED_PRACTICE_DECK_IDS.map((deckId) => {
        const deck = PRACTICE_DECKS[deckId];
        const active = deckId === selected;
        return (
          <button
            key={deckId}
            type="button"
            onClick={() => onSelect(deckId)}
            aria-pressed={active}
            aria-busy={active && pending}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              active
                ? "bg-[#173f35] text-white shadow-sm"
                : "text-[#52645c] hover:bg-white/75"
            }`}
          >
            {deck.badge}
            <span className={`ml-1 font-mono text-[9px] ${active ? "text-[#d7ff91]" : "text-[#78857f]"}`}>
              {counts[deckId]}
            </span>
            {active && pending ? (
              <span
                className="ml-1.5 inline-block size-2 animate-pulse rounded-full bg-[#d7ff91]"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
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

function AiBudgetPill({ budget }: { budget: AiDailyBudgetSnapshot }) {
  const low = budget.remainingPercent <= 20;
  const usedUsd = budget.actualUsdMicros / 1_000_000;
  const billingLabel = budget.billingSyncedAt
    ? `Billing OpenAI: $${((budget.billingUsdMicros ?? 0) / 1_000_000).toFixed(4)} · cộng phần realtime chưa quyết toán`
    : "Ước tính realtime từ token usage";
  return (
    <div
      className="min-w-32 rounded-full border border-[#173f35]/15 bg-white/55 px-3 py-2"
      title={`${billingLabel} · realtime đã dùng $${usedUsd.toFixed(5)} · ${budget.requestCount} request · ${budget.inputTokens + budget.outputTokens} token · model cuối: ${budget.lastModel ?? "chưa có"} · quota ngày $${(budget.limitUsdMicros / 1_000_000).toFixed(3)} · reset 00:00 giờ Việt Nam`}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold uppercase">
        <span>OpenAI hôm nay</span>
        <span className={low ? "text-[#ba4b2f]" : "text-[#245748]"}>
          {budget.remainingPercent}% còn lại
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#173f35]/15">
        <div
          className={`h-full rounded-full transition-[width] ${low ? "bg-[#ba4b2f]" : "bg-[#79b82a]"}`}
          style={{ width: `${budget.remainingPercent}%` }}
        />
      </div>
    </div>
  );
}

function HeaderNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex items-center gap-1.5 rounded-full border border-[#173f35]/15 bg-white/65 px-3 py-2 font-mono text-[10px] font-bold uppercase transition hover:border-[#356b58]/40"
    >
      <span>{children}</span>
      <HeaderNavPending />
    </Link>
  );
}

function HeaderNavPending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span
      className="size-2 animate-spin rounded-full border border-[#356b58]/35 border-t-[#356b58]"
      aria-label="Đang chuyển trang"
    />
  ) : null;
}

function AccountControl({
  account,
  cloudEnabled,
  syncStatus,
  selectedDeck,
}: {
  account: PracticeAccount | null;
  cloudEnabled: boolean;
  syncStatus: SyncStatus;
  selectedDeck: PracticeDeckId;
}) {
  if (account) {
    return (
      <div className="flex items-center gap-2">
        <HeaderNavLink
          href={`/stats?deck=${selectedDeck}`}
        >
          Thống kê
        </HeaderNavLink>
        <HeaderNavLink
          href="/admin"
        >
          Admin
        </HeaderNavLink>
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
      </div>
    );
  }

  if (cloudEnabled) {
    return (
      <form
        action={`/auth/login?next=${encodeURIComponent(`/?deck=${selectedDeck}`)}`}
        method="post"
      >
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

function ScenarioCodeEditor({
  language,
  value,
  onChange,
}: {
  language: ContentLanguage;
  value: string;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const editor = scenarioEditorConfig(language);

  return (
    <section
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col bg-[#071b16]/95 p-3 backdrop-blur-sm sm:p-6"
          : ""
      }
    >
      <div className="overflow-hidden rounded-2xl border border-[#356b58]/35 bg-[#0d2821] shadow-[0_18px_55px_rgba(7,27,22,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#102f27] px-4 py-3 text-white">
          <div className="flex items-center gap-3">
            <span className="flex gap-1.5" aria-hidden="true">
              <i className="size-2.5 rounded-full bg-[#e2684a]" />
              <i className="size-2.5 rounded-full bg-[#e7b84b]" />
              <i className="size-2.5 rounded-full bg-[#75aa52]" />
            </span>
            <span className="font-mono text-xs font-bold text-[#d7ff91]">
              {editor.fileName}
            </span>
            <span className="rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10px] text-white/55">
              {editor.languageLabel} design
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!value ? (
              <button
                type="button"
                onClick={() =>
                  onChange(editor.template)
                }
                className="rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold text-white/65 transition hover:bg-white/10 hover:text-white"
              >
                Chèn khung {editor.languageLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 font-mono text-[10px] font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {expanded ? "Thu nhỏ" : "Mở toàn màn hình"}
            </button>
          </div>
        </div>
        <div className="bg-[#0b241d]">
          <MonacoCodeEditor
            language={language}
            value={value}
            onChange={(nextValue) =>
              onChange(nextValue.slice(0, SCENARIO_CODE_MAX))
            }
            height={expanded ? "calc(100vh - 9rem)" : "24rem"}
            expanded={expanded}
            placeholder={editor.placeholder}
          />
        </div>
        <div className="flex items-center justify-between border-t border-white/8 bg-[#102f27] px-4 py-2 font-mono text-[10px] text-white/40">
          <span>Monaco · Ctrl+F tìm kiếm · Alt+↑↓ chuyển dòng · Ctrl+S đã tự lưu</span>
          <span>{value.length}/{SCENARIO_CODE_MAX}</span>
        </div>
      </div>
    </section>
  );
}

function InlineCode({ text, inverted = false }: { text: string; inverted?: boolean }) {
  return text.split(/(`[^`]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code
        key={`${part}-${index}`}
        className={`rounded-md px-1.5 py-0.5 font-mono text-[0.88em] ${
          inverted
            ? "bg-white/14 text-[#e7ffc2]"
            : "bg-[#173f35]/8 text-[#245748]"
        }`}
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function RichText({ text, inverted = false }: { text: string; inverted?: boolean }) {
  const fence = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  const blocks: Array<
    | { kind: "text"; content: string }
    | { kind: "code"; content: string; language: string }
  > = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(text)) !== null) {
    if (match.index > cursor) {
      blocks.push({ kind: "text", content: text.slice(cursor, match.index) });
    }
    blocks.push({
      kind: "code",
      language: match[1].trim() || "code",
      content: match[2].replace(/\r\n/g, "\n").replace(/\n$/, ""),
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) blocks.push({ kind: "text", content: text.slice(cursor) });
  if (!blocks.length) {
    return (
      <span className="whitespace-pre-wrap">
        <InlineCode text={text} inverted={inverted} />
      </span>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <CodeBlock
            key={`code-${index}`}
            code={block.content}
            language={block.language}
          />
        ) : block.content.trim() ? (
          <div key={`text-${index}`} className="whitespace-pre-wrap">
            <InlineCode text={block.content.trim()} inverted={inverted} />
          </div>
        ) : null,
      )}
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-white/10 bg-[#102f27] text-[#e8f7df] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-black/10 px-4 py-2">
        <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-[#b9d7ca] uppercase">
          {language}
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="rounded-md px-2 py-1 font-mono text-[10px] font-semibold text-[#d7ff91] transition hover:bg-white/10"
          aria-label="Sao chép đoạn code"
        >
          {copied ? "Đã copy ✓" : "Copy"}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-4 text-left font-mono text-[12px] leading-6 [tab-size:2] sm:text-[13px]">
        <code>{code}</code>
      </pre>
    </div>
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

function formatCoachFeedback(feedback: CoachFeedback) {
  const corrections = feedback.corrections.length
    ? `\n\nCần sửa:\n${feedback.corrections.map((item) => `- ${item}`).join("\n")}`
    : "";
  return `${feedback.score}/100 · ${verdictLabels[feedback.verdict]}\n\n${feedback.summary}\n\n${feedback.explanation}${corrections}`;
}

function CoachFeedbackPanel({
  feedback,
  model,
  learningActionLoading,
  learningActionDisabled,
  deepDiveOpen,
  feedbackSaved,
  onToggleSaveFeedback,
  onExpandNextStep,
  onExploreInterviewerQuestion,
}: {
  feedback: CoachFeedback;
  model?: string;
  learningActionLoading: boolean;
  learningActionDisabled: boolean;
  deepDiveOpen: boolean;
  feedbackSaved: boolean;
  onToggleSaveFeedback: () => void;
  onExpandNextStep: () => void;
  onExploreInterviewerQuestion: () => void;
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
              {model || "OpenAI"}
            </span>
            <button
              type="button"
              onClick={onToggleSaveFeedback}
              className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/80 transition hover:bg-white/20"
            >
              {feedbackSaved ? "★ Đã lưu" : "☆ Lưu phản hồi"}
            </button>
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
          <div className="mt-2 leading-7 text-[#52645c]">
            <RichText text={feedback.explanation} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col rounded-2xl bg-[#e8efe2] p-5">
            <p className="font-mono text-[11px] font-bold tracking-wider text-[#356b58] uppercase">
              Bước tiếp theo
            </p>
            <p className="mt-2 text-sm leading-6 text-[#465c52]">
              <InlineCode text={feedback.nextStep} />
            </p>
            <button
              type="button"
              onClick={onExpandNextStep}
              disabled={learningActionLoading || learningActionDisabled}
              className="mt-4 w-fit rounded-xl border border-[#356b58]/20 bg-white/65 px-3.5 py-2 text-xs font-bold text-[#245748] transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus:ring-4 focus:ring-[#d7ff91]/60 focus:outline-none"
            >
              {learningActionLoading ? "AI đang mở rộng…" : "Học tiếp phần này →"}
            </button>
          </div>
          <div className="flex flex-col rounded-2xl bg-[#d7ff91]/55 p-5">
            <p className="font-mono text-[11px] font-bold tracking-wider text-[#356b58] uppercase">
              Interviewer hỏi tiếp
            </p>
            <p className="mt-2 text-sm leading-6 font-semibold text-[#29493d]">
              <InlineCode text={feedback.followUpQuestion} />
            </p>
            <button
              type="button"
              onClick={onExploreInterviewerQuestion}
              className="mt-4 w-fit rounded-xl bg-[#173f35] px-3.5 py-2 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#245748] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus:ring-4 focus:ring-white/70 focus:outline-none"
            >
              {deepDiveOpen ? "Ẩn câu mở rộng ↑" : "Tự trả lời câu này →"}
            </button>
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

function DeepDivePracticePanel({
  question,
  prompt,
  answer,
  feedback,
  model,
  error,
  loading,
  feedbackSaved,
  onAnswer,
  onSubmit,
  onToggleSaveFeedback,
}: {
  question: PracticeQuestion;
  prompt: string;
  answer: string;
  feedback?: CoachFollowUpResponse;
  model?: string;
  error?: string;
  loading: boolean;
  feedbackSaved: boolean;
  onAnswer: (value: string) => void;
  onSubmit: () => void;
  onToggleSaveFeedback: () => void;
}) {
  const sourceById = new Map(
    question.sourceSections.map((section) => [section.id, section]),
  );
  const citedSections = (feedback?.sourceSectionIds ?? [])
    .map((id) => sourceById.get(id))
    .filter((section): section is NonNullable<typeof section> => Boolean(section));

  return (
    <section className="mt-5 rounded-3xl border border-[#7fb43d]/30 bg-[#f3ffdd] p-5 shadow-[0_12px_35px_rgba(23,63,53,0.05)] sm:p-6">
      <p className="font-mono text-xs font-bold tracking-[0.14em] text-[#356b58] uppercase">
        Câu phỏng vấn mở rộng
      </p>
      <h3 className="mt-3 text-xl leading-8 font-semibold text-[#203d32]">
        <InlineCode text={prompt} />
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#64736c]">
        Tự trả lời trước như một câu phỏng vấn mới. AI chỉ được gọi sau khi mày gửi bài.
      </p>

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor={`deep-dive-${question.id}`} className="text-sm font-bold text-[#29493d]">
          Câu trả lời của mày
        </label>
        <textarea
          id={`deep-dive-${question.id}`}
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          maxLength={6000}
          rows={5}
          disabled={loading}
          placeholder="Trả lời câu mở rộng trước khi xem nhận xét của AI…"
          className="mt-2 w-full resize-y rounded-2xl border border-[#356b58]/20 bg-white/80 px-4 py-3 leading-7 outline-none transition focus:border-[#356b58] focus:ring-4 focus:ring-[#d7ff91]/55 disabled:bg-[#edf1ea]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-[#718078]">
            ● tự lưu · không có đáp án mẫu
          </span>
          <button
            type="submit"
            disabled={answer.trim().length < 10 || loading}
            className="rounded-xl bg-[#173f35] px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
          >
            {loading ? "AI đang chấm…" : "Nhờ AI chấm câu mở rộng"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-4 rounded-xl bg-[#f8e8df] px-3 py-2 text-sm text-[#8e3825]" role="alert">
          {error}
        </p>
      ) : null}

      {feedback ? (
        <div className="mt-5 rounded-2xl border border-[#356b58]/15 bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[#245748]">Nhận xét của interviewer AI</p>
              {model ? (
                <span className="rounded-full bg-[#e8efe2] px-2 py-0.5 font-mono text-[10px] text-[#356b58]">
                  {model}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onToggleSaveFeedback}
              className="rounded-lg border border-[#356b58]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#356b58]"
            >
              {feedbackSaved ? "★ Đã lưu" : "☆ Lưu nhận xét"}
            </button>
          </div>
          <div className="mt-3 text-sm leading-7 text-[#465c52]">
            <RichText text={feedback.answer} />
          </div>
          {citedSections.length ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#173f35]/10 pt-3">
              {citedSections.map((section) => (
                <span key={section.id} className="rounded-full bg-[#e8efe2] px-2.5 py-1 text-[11px] font-semibold text-[#356b58]">
                  Nguồn: {section.heading}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CoachFollowUpPanel({
  question,
  messages,
  input,
  error,
  loading,
  isMessageSaved,
  onToggleSaveMessage,
  onInput,
  onSubmit,
}: {
  question: PracticeQuestion;
  messages: FollowUpChatMessage[];
  input: string;
  error?: string;
  loading: boolean;
  isMessageSaved: (index: number) => boolean;
  onToggleSaveMessage: (index: number, message: FollowUpChatMessage) => void;
  onInput: (value: string) => void;
  onSubmit: () => void;
}) {
  const limitReached = messages.length >= 8;
  const sourceById = new Map(
    question.sourceSections.map((section) => [section.id, section]),
  );

  return (
    <section className="mt-5 rounded-3xl border border-[#173f35]/16 bg-white/70 p-5 shadow-[0_12px_35px_rgba(23,63,53,0.05)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.14em] text-[#356b58] uppercase">
            Chưa hiểu? Hỏi tiếp AI
          </p>
          <p className="mt-2 text-sm leading-6 text-[#64736c]">
            AI sẽ giải thích lại dựa trên câu này, feedback vừa chấm và note nguồn.
          </p>
        </div>
        <span className="rounded-full bg-[#edf3e9] px-3 py-1 font-mono text-[11px] text-[#52645c]">
          {Math.floor(messages.length / 2)}/4 lượt
        </span>
      </div>

      {messages.length ? (
        <div className="mt-5 space-y-4" aria-live="polite">
          {messages.map((message, index) => {
            const citedSections = (message.sourceSectionIds ?? [])
              .map((id) => sourceById.get(id))
              .filter((section): section is NonNullable<typeof section> => Boolean(section));
            return (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#173f35] px-4 py-3 text-sm leading-6 text-white"
                    : "max-w-[94%] rounded-2xl rounded-bl-md border border-[#356b58]/15 bg-[#f6faef] px-4 py-4 text-sm leading-6 text-[#465c52]"
                }
              >
                <RichText
                  text={message.content}
                  inverted={message.role === "user"}
                />
                {message.role === "assistant" && message.model ? (
                  <span className="mt-3 inline-block rounded-full bg-[#e8efe2] px-2 py-0.5 font-mono text-[10px] text-[#356b58]">
                    {message.model}
                  </span>
                ) : null}
                {citedSections.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-[#173f35]/10 pt-3">
                    {citedSections.map((section) => (
                      <span
                        key={section.id}
                        title={`#${section.id}`}
                        className="rounded-full bg-[#e8efe2] px-2.5 py-1 text-[11px] font-semibold text-[#356b58]"
                      >
                        Nguồn: {section.heading}
                      </span>
                    ))}
                  </div>
                ) : null}
                {message.checkQuestion ? (
                  <p className="mt-3 rounded-xl bg-[#d7ff91]/45 px-3 py-2 text-xs font-semibold text-[#29493d]">
                    Tự kiểm tra: <InlineCode text={message.checkQuestion} />
                  </p>
                ) : null}
                {message.role === "assistant" ? (
                  <button
                    type="button"
                    onClick={() => onToggleSaveMessage(index, message)}
                    className="mt-3 rounded-lg border border-[#356b58]/15 bg-white/60 px-2.5 py-1.5 text-[11px] font-bold text-[#356b58] transition hover:bg-white"
                  >
                    {isMessageSaved(index) ? "★ Đã lưu" : "☆ Lưu câu trả lời AI"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor={`follow-up-${question.id}`} className="sr-only">
          Câu hỏi bổ sung cho AI coach
        </label>
        <textarea
          id={`follow-up-${question.id}`}
          value={input}
          onChange={(event) => onInput(event.target.value)}
          maxLength={2000}
          rows={3}
          disabled={loading || limitReached}
          placeholder="Ví dụ: Tại sao chỗ này lại là undefined behavior? Giải thích bằng ví dụ nhỏ được không?"
          className="w-full resize-y rounded-2xl border border-[#173f35]/18 bg-white px-4 py-3 text-sm leading-6 text-[#1e352d] outline-none transition placeholder:text-[#819087] focus:border-[#356b58] focus:ring-4 focus:ring-[#d7ff91]/45 disabled:bg-[#edf1ea]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#78867f]">
            {limitReached
              ? "Đã đủ 4 lượt. Chấm lại để bắt đầu hội thoại mới."
              : "Enter xuống dòng · tối đa 2.000 ký tự"}
          </p>
          <button
            type="submit"
            disabled={!input.trim() || loading || limitReached}
            className="rounded-xl bg-[#173f35] px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
          >
            {loading ? "AI đang giải thích…" : "Hỏi tiếp AI"}
          </button>
        </div>
        {error ? (
          <p className="mt-3 rounded-xl bg-[#f8e8df] px-3 py-2 text-sm text-[#8e3825]" role="alert">
            {error}
          </p>
        ) : null}
      </form>
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

function SavedItemsControl({
  items,
  onRemove,
  onOpenQuestion,
}: {
  items: SavedItem[];
  onRemove: (itemId: string) => void;
  onOpenQuestion: (questionId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[#173f35]/15 bg-white/55 px-3 py-2 text-xs font-bold transition hover:bg-white"
      >
        ☆ Đã lưu {items.length ? `(${items.length})` : ""}
      </button>
      {open ? (
        <SavedLibrary
          items={items}
          onClose={() => setOpen(false)}
          onRemove={onRemove}
          onOpenQuestion={(questionId) => {
            onOpenQuestion(questionId);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function SavedLibrary({
  items,
  onClose,
  onRemove,
  onOpenQuestion,
}: {
  items: SavedItem[];
  onClose: () => void;
  onRemove: (itemId: string) => void;
  onOpenQuestion: (questionId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#102d26]/35 p-3 backdrop-blur-sm sm:p-5" role="presentation">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Nội dung đã lưu"
        className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-white/35 bg-[#f7f5ed] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#173f35]/12 p-5 sm:p-7">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.15em] text-[#ba4b2f] uppercase">
              Saved library
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Nội dung đáng xem lại</h2>
            <p className="mt-2 text-sm text-[#64736c]">
              {items.length} mục · lưu trên trình duyệt này
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng danh sách đã lưu"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-[#173f35]/15 bg-white text-lg font-bold"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          {items.map((item) => (
            <SavedLibraryItem
              key={item.id}
              item={item}
              onOpenQuestion={onOpenQuestion}
              onRemove={onRemove}
            />
          ))}
          {!items.length ? (
            <div className="rounded-2xl border border-dashed border-[#173f35]/20 px-5 py-12 text-center text-sm leading-6 text-[#64736c]">
              Chưa lưu gì. Dùng nút ☆ ở câu hỏi hoặc phản hồi AI mà mày thấy đáng xem lại.
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function SavedLibraryItem({
  item,
  onOpenQuestion,
  onRemove,
}: {
  item: SavedItem;
  onOpenQuestion: (questionId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-2xl border border-[#173f35]/12 bg-white/75 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${item.kind === "question" ? "bg-[#d7ff91] text-[#356b58]" : "bg-[#e3ddff] text-[#55468c]"}`}>
          {item.kind === "question" ? "Câu hỏi" : "AI trả lời"}
        </span>
        <time className="font-mono text-[10px] text-[#78867f]">
          {new Date(item.savedAt).toLocaleDateString("vi-VN")}
        </time>
      </div>
      <h3 className="mt-3 font-semibold">{item.title}</h3>
      {item.context ? (
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#718078]">
          <InlineCode text={item.context} />
        </p>
      ) : null}
      <details
        className="group mt-3 rounded-xl bg-[#f2f4ed] px-3 py-2.5"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="cursor-pointer list-none text-xs font-bold text-[#356b58]">
          <span className="group-open:hidden">Xem nội dung ↓</span>
          <span className="hidden group-open:inline">Thu gọn ↑</span>
        </summary>
        {expanded ? (
          <div className="mt-3 text-sm leading-6 text-[#465c52]">
            <RichText text={item.content} />
          </div>
        ) : null}
      </details>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenQuestion(item.questionId)}
          className="rounded-lg border border-[#356b58]/18 bg-white px-3 py-2 text-xs font-bold text-[#356b58]"
        >
          Mở câu gốc
        </button>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-lg px-3 py-2 text-xs font-bold text-[#a0442d] hover:bg-[#f8e8df]"
        >
          Bỏ lưu
        </button>
      </div>
    </article>
  );
}
