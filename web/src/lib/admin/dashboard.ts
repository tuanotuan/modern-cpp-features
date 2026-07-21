import type {
  ContentManifest,
  ContentQuestion,
} from "../content/schema";
import {
  isQuestionApproved,
  type QuestionApproval,
} from "../practice/approvals";
import { latestReviews, type PracticeProgress } from "../practice/scheduler";

export type AdminQuestionStatus = "active" | "pending" | "stale" | "archived";

export type AdminQuestion = ContentQuestion & {
  lessonTitle: string;
  standard: "cpp98" | "cpp11" | "cpp20";
  knowledgePath: string;
  sourceHeadings: string[];
  approved: boolean;
  adminStatus: AdminQuestionStatus;
};

export type AdminLessonCoverage = {
  id: string;
  title: string;
  standard: "cpp98" | "cpp11" | "cpp20";
  knowledgePath: string;
  currentQuestions: number;
  activeQuestions: number;
};

export type AdminDashboardSnapshot = {
  sourceRevision: string;
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
  today: string,
): AdminDashboardSnapshot {
  const lessonById = new Map(manifest.lessons.map((lesson) => [lesson.id, lesson]));
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

  const latest = latestReviews(progress.reviews);
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
      dueQuestions: [...latest.values()].filter(
        (review) => activeIds.has(review.questionId) && review.nextDueOn <= today,
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
