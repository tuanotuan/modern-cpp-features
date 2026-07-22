import { isQuestionApproved } from "@/lib/practice/approvals";
import { loadCloudContext } from "@/lib/practice/cloud-server";

import { PracticeApp, type PracticeQuestion } from "./practice-app";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[] }>;
}) {
  const cloud = await loadCloudContext();
  const manifest = cloud.manifest;
  const params = await searchParams;
  const authCode = Array.isArray(params.auth) ? params.auth[0] : params.auth;
  const lessons = new Map(manifest.lessons.map((lesson) => [lesson.id, lesson]));

  const mappedQuestions: PracticeQuestion[] = manifest.questions
    .filter((question) => question.status !== "archived")
    .map((question) => {
      const lesson = lessons.get(question.lessonId);
      if (!lesson) throw new Error(`Missing lesson ${question.lessonId}`);

      return {
        ...question,
        lessonTitle: lesson.title,
        standard: lesson.standard,
        sourcePath: lesson.knowledgePath,
        sourceSections: question.sources.map(({ sectionId }) => {
          const section = lesson.sections.find((item) => item.id === sectionId);
          if (!section) {
            throw new Error(`Missing section ${question.lessonId}#${sectionId}`);
          }
          return {
            id: section.id,
            heading: section.heading,
            excerpt: section.bodyText.slice(0, 900),
          };
        }),
      };
    });
  const questions = mappedQuestions.filter(
    (question) =>
      question.status === "verified" ||
      isQuestionApproved(question, cloud.approvals),
  );
  const reviewQueue = cloud.account
    ? mappedQuestions.filter(
        (question) =>
          new Set(["draft", "needs_review"]).has(question.status) &&
          !isQuestionApproved(question, cloud.approvals),
      )
    : [];

  return (
    <PracticeApp
      questions={questions}
      reviewQueue={reviewQueue}
      sourceRevision={manifest.sourceRevision}
      cloudEnabled={cloud.enabled}
      account={cloud.account}
      initialCloudProgress={cloud.progress}
      initialQuestionStates={cloud.questionStates}
      cloudSetupError={cloud.error}
      initialAiDailyBudget={cloud.aiDailyBudget}
      authNotice={authNotice(authCode)}
    />
  );
}

function authNotice(code?: string): string | null {
  if (code === "unauthorized") return "GitHub account này không được phép dùng private app.";
  if (code === "not-configured") return "Supabase chưa được cấu hình.";
  if (code === "login-error" || code === "callback-error") {
    return "Đăng nhập GitHub chưa thành công. Kiểm tra OAuth callback rồi thử lại.";
  }
  return null;
}
