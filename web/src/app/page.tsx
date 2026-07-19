import manifestJson from "@/generated/content-manifest.json";
import { contentManifestSchema } from "@/lib/content/schema";
import { loadCloudContext } from "@/lib/practice/cloud-server";

import { PracticeApp, type PracticeQuestion } from "./practice-app";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[] }>;
}) {
  const manifest = contentManifestSchema.parse(manifestJson);
  const cloud = await loadCloudContext();
  const params = await searchParams;
  const authCode = Array.isArray(params.auth) ? params.auth[0] : params.auth;
  const lessons = new Map(manifest.lessons.map((lesson) => [lesson.id, lesson]));

  const questions: PracticeQuestion[] = manifest.questions
    .filter((question) => question.status === "verified")
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

  return (
    <PracticeApp
      questions={questions}
      sourceCommitSha={manifest.sourceCommitSha}
      cloudEnabled={cloud.enabled}
      account={cloud.account}
      initialCloudProgress={cloud.progress}
      cloudSetupError={cloud.error}
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
