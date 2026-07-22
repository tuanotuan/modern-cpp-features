import type {
  ContentManifest,
  ContentQuestion,
  GeneratedLesson,
} from "../content/schema";
import type { QuestionOverride } from "../content/question-overrides";
import {
  isQuestionApproved,
  type QuestionApproval,
} from "../practice/approvals";
import {
  buildLearningStates,
  type QuestionLearningState,
} from "../practice/learning-state";
import type { PracticeProgress, Review } from "../practice/scheduler";

export type AdminQuestionStatus = "active" | "pending" | "stale" | "archived";

export type AdminQuestion = ContentQuestion & {
  lessonTitle: string;
  standard: GeneratedLesson["standard"];
  knowledgePath: string;
  sourceHeadings: string[];
  approved: boolean;
  adminStatus: AdminQuestionStatus;
  learning: QuestionLearningState;
  reviewHistory: Review[];
  archivedByOwner: boolean;
};

export type AdminLessonCoverage = {
  id: string;
  title: string;
  standard: GeneratedLesson["standard"];
  knowledgePath: string;
  currentQuestions: number;
  activeQuestions: number;
};

export type AdminDashboardSnapshot = {
  sourceRevision: string;
  today: string;
  metrics: {
    lessons: number;
    questions: number;
    activeQuestions: number;
    pendingQuestions: number;
    staleQuestions: number;
    uncoveredLessons: number;
    totalReviews: number;
    practicedQuestions: number;
    dueQuestions: number;
  };
  ratingCounts: Record<"again" | "hard" | "good" | "easy", number>;
  questions: AdminQuestion[];
  lessons: AdminLessonCoverage[];
};

export function buildAdminDashboardSnapshot(
  manifest: ContentManifest,
  approvals: QuestionApproval[],
  progress: PracticeProgress,
  cloudStates: QuestionLearningState[],
  today: string,
  overrides: QuestionOverride[] = [],
): AdminDashboardSnapshot {
  const lessonById = new Map(manifest.lessons.map((lesson) => [lesson.id, lesson]));
  const learningStates = buildLearningStates(
    manifest.questions.map((question) => ({
      id: question.id,
      version: question.version,
      sourceHash: question.sourceHash,
    })),
    progress.reviews,
    cloudStates,
  );
  const questions = manifest.questions.map((question): AdminQuestion => {
    const lesson = lessonById.get(question.lessonId);
    if (!lesson) throw new Error(`Missing lesson ${question.lessonId}`);

    const approved = isQuestionApproved(question, approvals);
    return {
      ...question,
      lessonTitle: lesson.title,
      standard: lesson.standard,
      knowledgePath: lesson.knowledgePath,
      sourceHeadings: question.sources.map(({ sectionId }) => {
        const section = lesson.sections.find((item) => item.id === sectionId);
        return section?.heading ?? sectionId;
      }),
      approved,
      adminStatus: resolveAdminQuestionStatus(question, approved),
      learning: learningStates.get(question.id)!,
      reviewHistory: progress.reviews
        .filter((review) => review.questionId === question.id)
        .sort((left, right) => right.reviewedOn.localeCompare(left.reviewedOn)),
      archivedByOwner: overrides.some(
        (override) =>
          override.questionId === question.id && override.archived,
      ),
    };
  });

  const lessons = manifest.lessons.map((lesson): AdminLessonCoverage => {
    const current = questions.filter(
      (question) =>
        question.lessonId === lesson.id &&
        question.sourceHash === lesson.sourceHash &&
        question.status !== "archived",
    );
    return {
      id: lesson.id,
      title: lesson.title,
      standard: lesson.standard,
      knowledgePath: lesson.knowledgePath,
      currentQuestions: current.length,
      activeQuestions: current.filter((question) => question.adminStatus === "active")
        .length,
    };
  });

  const activeIds = new Set(
    questions
      .filter((question) => question.adminStatus === "active")
      .map((question) => question.id),
  );
  const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
  progress.reviews.forEach((review) => {
    ratingCounts[review.rating] += 1;
  });

  return {
    sourceRevision: manifest.sourceRevision,
    today,
    metrics: {
      lessons: lessons.length,
      questions: questions.filter((question) => question.status !== "archived").length,
      activeQuestions: questions.filter((question) => question.adminStatus === "active")
        .length,
      pendingQuestions: questions.filter((question) => question.adminStatus === "pending")
        .length,
      staleQuestions: questions.filter((question) => question.adminStatus === "stale")
        .length,
      uncoveredLessons: lessons.filter((lesson) => lesson.currentQuestions === 0).length,
      totalReviews: progress.reviews.length,
      practicedQuestions: new Set(progress.reviews.map((review) => review.questionId)).size,
      dueQuestions: [...learningStates.values()].filter(
        (state) =>
          activeIds.has(state.questionId) &&
          !state.suspended &&
          state.state !== "new" &&
          state.dueOn !== null &&
          state.dueOn <= today,
      ).length,
    },
    ratingCounts,
    questions,
    lessons,
  };
}

function resolveAdminQuestionStatus(
  question: ContentQuestion,
  approved: boolean,
): AdminQuestionStatus {
  if (question.status === "archived") return "archived";
  if (question.status === "needs_review" && !approved) return "stale";
  if (question.status === "verified" || approved) return "active";
  return "pending";
}
