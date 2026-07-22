import type { Metadata } from "next";
import Link from "next/link";

import { buildAdminDashboardSnapshot } from "@/lib/admin/dashboard";
import { loadCloudContext } from "@/lib/practice/cloud-server";

import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin — C++ Recall",
  description: "Quản lý ngân hàng câu hỏi và độ phủ nội dung C++ Recall.",
};

export default async function AdminPage() {
  const cloud = await loadCloudContext();

  if (!cloud.enabled) {
    return <AdminGate mode="not-configured" />;
  }
  if (!cloud.account) {
    return <AdminGate mode="login" />;
  }

  const manifest = cloud.manifest;
  const snapshot = buildAdminDashboardSnapshot(
    manifest,
    cloud.approvals,
    cloud.progress,
    cloud.questionStates,
    vietnamDateKey(),
    cloud.questionOverrides,
  );

  return (
    <AdminDashboard
      account={cloud.account}
      aiUsage={cloud.aiUsage}
      geminiUsage={cloud.geminiUsage}
      initialGeminiFallbackEnabled={cloud.geminiFallbackEnabled}
      initialSnapshot={snapshot}
    />
  );
}

function AdminGate({ mode }: { mode: "login" | "not-configured" }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-lg rounded-[2rem] border border-[#173f35]/15 bg-white/70 p-8 shadow-[0_24px_80px_rgb(23_63_53_/_10%)] backdrop-blur sm:p-10">
        <div className="grid size-12 place-items-center rounded-2xl bg-[#173f35] font-mono font-bold text-[#d7ff91]">
          C++
        </div>
        <p className="mt-8 font-mono text-xs font-bold tracking-[0.18em] text-[#ba4b2f] uppercase">
          Admin access
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Khu vực quản trị riêng
        </h1>
        <p className="mt-4 leading-7 text-[#64736c]">
          {mode === "login"
            ? "Đăng nhập bằng tài khoản GitHub owner để xem draft, đáp án và quản lý ngân hàng câu hỏi."
            : "Supabase chưa được cấu hình nên trang admin chưa thể xác thực owner."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {mode === "login" ? (
            <form action="/auth/login?next=/admin" method="post">
              <button
                type="submit"
                className="rounded-2xl bg-[#173f35] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#245748] focus:ring-4 focus:ring-[#d7ff91] focus:outline-none"
              >
                Đăng nhập GitHub
              </button>
            </form>
          ) : null}
          <Link
            href="/"
            className="rounded-2xl border border-[#173f35]/15 bg-white px-5 py-3 text-sm font-bold transition hover:border-[#356b58]/40"
          >
            Về trang luyện tập
          </Link>
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
