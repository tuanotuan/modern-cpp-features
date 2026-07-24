import type { Metadata } from "next";
import Link from "next/link";

import { displayQuestionPrompt } from "@/lib/content/question-prompt";
import { isQuestionApproved } from "@/lib/practice/approvals";
import { loadCloudContext } from "@/lib/practice/cloud-server";
import {
  buildWorldQuantGroundingCoverage,
  inferMockCompetency,
  type MockInterviewQuestion,
} from "@/lib/mock-interview/profile";

import { MockInterviewApp } from "./mock-interview-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WorldQuant Mock Interview — Recall",
  description:
    "Mock interview cho vị trí Modern C++ Tick Data Platform Engineer.",
};

export default async function MockInterviewPage() {
  const cloud = await loadCloudContext({
    includeAiUsage: false,
    includeDailyAiBudget: false,
    includeGeminiUsage: false,
    includeProviderSettings: false,
  });
  if (!cloud.enabled) return <MockInterviewGate mode="not-configured" />;
  if (!cloud.account) return <MockInterviewGate mode="login" />;

  const lessonById = new Map(
    cloud.manifest.lessons.map((lesson) => [lesson.id, lesson]),
  );
  const bankQuestions = cloud.manifest.questions.flatMap(
    (question): MockInterviewQuestion[] => {
      if (
        question.status === "archived" ||
        (question.status !== "verified" &&
          !isQuestionApproved(question, cloud.approvals))
      ) {
        return [];
      }
      const lesson = lessonById.get(question.lessonId);
      if (!lesson) return [];
      return [
        {
          id: question.id,
          origin: "question_bank",
          version: question.version,
          contentRevision: question.sourceHash,
          prompt: displayQuestionPrompt(question),
          code: question.code,
          language: lesson.language,
          track: lesson.track,
          responseMode: question.taxonomy.responseMode,
          estimatedMinutes: question.estimatedMinutes,
          competency: inferMockCompetency({
            language: lesson.language,
            topics: question.taxonomy.topics,
          }),
          selectionTopics: [
            ...question.taxonomy.topics,
            `lesson::${question.lessonId}`,
          ],
        },
      ];
    },
  );

  return (
    <MockInterviewApp
      account={{
        displayName: cloud.account.displayName,
        login: cloud.account.login,
      }}
      sourceRevision={cloud.manifest.sourceRevision}
      bankQuestions={bankQuestions}
      groundingCoverage={buildWorldQuantGroundingCoverage(bankQuestions)}
    />
  );
}

function MockInterviewGate({
  mode,
}: {
  mode: "login" | "not-configured";
}) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-lg rounded-[2rem] border border-[#173f35]/15 bg-white/70 p-8 shadow-[0_24px_80px_rgb(23_63_53_/_10%)] sm:p-10">
        <div className="grid size-12 place-items-center rounded-2xl bg-[#173f35] font-mono font-bold text-[#d7ff91]">
          WQ
        </div>
        <p className="mt-8 font-mono text-xs font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">
          Mock interview
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Phòng phỏng vấn riêng
        </h1>
        <p className="mt-4 leading-7 text-[#64736c]">
          {mode === "login"
            ? "Đăng nhập GitHub để dùng question bank riêng và AI tạo report cuối buổi."
            : "Supabase chưa được cấu hình nên chưa thể xác thực và chấm mock interview."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {mode === "login" ? (
            <form action="/auth/login?next=/mock-interview" method="post">
              <button
                type="submit"
                className="rounded-2xl bg-[#173f35] px-5 py-3 text-sm font-bold text-white"
              >
                Đăng nhập GitHub
              </button>
            </form>
          ) : null}
          <Link
            href="/"
            className="rounded-2xl border border-[#173f35]/15 bg-white px-5 py-3 text-sm font-bold"
          >
            Về trang luyện tập
          </Link>
        </div>
      </section>
    </main>
  );
}
