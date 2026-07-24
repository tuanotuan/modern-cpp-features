import type {
  ContentLanguage,
  ContentTrack,
} from "@/lib/content/schema";

export const WORLDQUANT_PROFILE_ID = "worldquant-tick-data-engineer" as const;
export const WORLDQUANT_PROFILE_VERSION = 1 as const;

export const mockCompetencyKeys = [
  "modern_cpp",
  "tick_data_order_book",
  "data_pipeline_performance",
  "engineering_quality",
  "scripting",
  "communication_ownership",
] as const;

export type MockCompetencyKey = (typeof mockCompetencyKeys)[number];
export type MockQuestionOrigin = "question_bank" | "role_profile";
export type MockInterviewDuration = 30 | 45 | 60;

export type MockInterviewQuestion = {
  id: string;
  origin: MockQuestionOrigin;
  version: number;
  contentRevision: string;
  prompt: string;
  code?: string;
  language: ContentLanguage;
  track: ContentTrack;
  responseMode: "text" | "code";
  estimatedMinutes: number;
  competency: MockCompetencyKey;
  selectionTopics: string[];
};

export const mockDurationQuestionCounts: Record<
  MockInterviewDuration,
  number
> = {
  30: 4,
  45: 5,
  60: 7,
};

export const mockCompetencyLabels: Record<MockCompetencyKey, string> = {
  modern_cpp: "Modern C++",
  tick_data_order_book: "Tick data & order book",
  data_pipeline_performance: "Data pipeline & performance",
  engineering_quality: "CMake, testing & delivery",
  scripting: "Python tooling",
  communication_ownership: "Ownership & communication",
};

export const WORLDQUANT_PROFILE = {
  id: WORLDQUANT_PROFILE_ID,
  version: WORLDQUANT_PROFILE_VERSION,
  company: "WorldQuant",
  role: "Modern C++ Tick Data Platform Engineer",
  badge: "WQ",
  disclaimer:
    "Bộ mock được tạo từ JD mày cung cấp và question bank riêng; không phải câu hỏi nội bộ hay tài liệu tuyển dụng chính thức của WorldQuant.",
  focus: [
    "C++11–23, lifetime, ownership, correctness và performance",
    "Tick feeds, order-book data và interval features/statistics",
    "Legacy migration, data parity, cutover và rollback",
    "CMake, testing, CI/CD, Git và software quality",
    "Python tooling, product ownership và phối hợp với researchers",
  ],
  competencies: [
    { key: "modern_cpp", weight: 30 },
    { key: "tick_data_order_book", weight: 25 },
    { key: "data_pipeline_performance", weight: 15 },
    { key: "engineering_quality", weight: 10 },
    { key: "scripting", weight: 10 },
    { key: "communication_ownership", weight: 10 },
  ] satisfies Array<{ key: MockCompetencyKey; weight: number }>,
} as const;

const ROLE_CONTENT_REVISION = "worldquant-jd-2025-v1";

export const WORLDQUANT_ROLE_QUESTIONS: MockInterviewQuestion[] = [
  {
    id: "worldquant-tick-feed-correctness",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "text",
    estimatedMinutes: 8,
    competency: "tick_data_order_book",
    selectionTopics: [
      "tick-data",
      "order-book",
      "sequencing",
      "determinism",
    ],
    prompt:
      "Một feed tick mới có sequence number nhưng đôi lúc gửi duplicate, gap và message đến lệch thứ tự. Hãy thiết kế luồng ingest/normalize để downstream interval features và order-book state vẫn deterministic. Mày sẽ xử lý snapshot, replay và giám sát data quality như thế nào?",
  },
  {
    id: "worldquant-interval-stats-cpp",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "code",
    estimatedMinutes: 12,
    competency: "data_pipeline_performance",
    selectionTopics: [
      "tick-data",
      "interval-statistics",
      "vwap",
      "performance",
    ],
    prompt:
      "Cài đặt phần còn thiếu cho bộ thống kê của một interval tick. Sau phần code, giải thích complexity, chính sách với tick không hợp lệ và cách mày xử lý precision/overflow trong production.",
    code: `#include <cstdint>
#include <optional>

struct Tick {
    std::int64_t timestamp_ns;
    double price;
    std::int64_t quantity;
};

struct IntervalStats {
    std::uint64_t tick_count{};
    std::int64_t volume{};
    long double turnover{};
    std::optional<double> open;
    std::optional<double> high;
    std::optional<double> low;
    std::optional<double> close;

    void on_tick(const Tick& tick);
    [[nodiscard]] std::optional<double> vwap() const;
};`,
  },
  {
    id: "worldquant-legacy-migration",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "text",
    estimatedMinutes: 8,
    competency: "communication_ownership",
    selectionTopics: [
      "legacy-migration",
      "data-parity",
      "cutover",
      "product-ownership",
    ],
    prompt:
      "Mày phải chuyển nhiều năm tick datasets từ platform C++ legacy sang platform mới trong khi researchers vẫn đang dùng kết quả cũ để tạo signal. Hãy trình bày kế hoạch migration, cách chứng minh parity, xử lý backfill, cutover/rollback và cách phối hợp với Research cùng Portfolio Management.",
  },
  {
    id: "worldquant-cmake-delivery",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cmake",
    track: "cmake",
    responseMode: "text",
    estimatedMinutes: 7,
    competency: "engineering_quality",
    selectionTopics: [
      "cmake",
      "testing",
      "ci-cd",
      "reproducible-build",
    ],
    prompt:
      "Một C++ tick-processing monorepo đang dựa vào global include directories, global compiler flags và link order ngầm định nên build local được nhưng CI đôi lúc hỏng. Mày sẽ tổ chức lại CMake targets, dependencies, test pipeline và quality gates như thế nào để build reproducible mà vẫn migration dần được?",
  },
  {
    id: "worldquant-python-reconciliation",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "python",
    track: "python3",
    responseMode: "text",
    estimatedMinutes: 7,
    competency: "scripting",
    selectionTopics: [
      "python",
      "reconciliation",
      "streaming-data",
      "automation",
    ],
    prompt:
      "Thiết kế một Python reconciliation tool so sánh output tick/interval giữa legacy và platform mới trên datasets rất lớn. Nêu data model, cách đọc streaming, quy tắc tolerance, báo cáo mismatch, khả năng resume và cách đưa tool vào CI hoặc migration workflow.",
  },
  {
    id: "worldquant-researcher-collaboration",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "text",
    estimatedMinutes: 5,
    competency: "communication_ownership",
    selectionTopics: [
      "behavioral",
      "requirements",
      "cross-timezone",
      "english",
    ],
    prompt:
      "Answer in English: A researcher reports that one interval feature changed after migration, but the requirement is ambiguous and the owner is in another time zone. Walk the interviewer through how you would investigate, communicate risk, agree on expected behavior, and own the resolution.",
  },
];

const curatedById = new Map(
  WORLDQUANT_ROLE_QUESTIONS.map((question) => [question.id, question]),
);

const curatedIdsByDuration: Record<MockInterviewDuration, string[]> = {
  30: [
    "worldquant-tick-feed-correctness",
    "worldquant-interval-stats-cpp",
    "worldquant-legacy-migration",
  ],
  45: [
    "worldquant-tick-feed-correctness",
    "worldquant-interval-stats-cpp",
    "worldquant-legacy-migration",
    "worldquant-cmake-delivery",
  ],
  60: [
    "worldquant-tick-feed-correctness",
    "worldquant-interval-stats-cpp",
    "worldquant-legacy-migration",
    "worldquant-cmake-delivery",
    "worldquant-python-reconciliation",
    "worldquant-researcher-collaboration",
  ],
};

const performanceTopics = new Set([
  "alignment",
  "algorithm",
  "array",
  "bounds",
  "cache",
  "compile-time",
  "container",
  "iteration",
  "lifetime",
  "memory",
  "object-model",
  "ownership",
  "performance",
  "pointer",
  "reference",
  "special-member-function",
  "type-deduction",
]);

const tickTopics = new Set([
  "feed",
  "interval-statistics",
  "market-data",
  "order-book",
  "sequencing",
  "tick-data",
]);

const qualityTopics = new Set([
  "build",
  "ci-cd",
  "cmake",
  "debugging",
  "testing",
]);

export function inferMockCompetency({
  language,
  topics,
}: {
  language: ContentLanguage;
  topics: string[];
}): MockCompetencyKey {
  if (topics.some((topic) => tickTopics.has(topic))) {
    return "tick_data_order_book";
  }
  if (language === "cmake" || topics.some((topic) => qualityTopics.has(topic))) {
    return "engineering_quality";
  }
  if (language === "python") return "scripting";
  if (topics.some((topic) => performanceTopics.has(topic))) {
    return "data_pipeline_performance";
  }
  return "modern_cpp";
}

export function selectWorldQuantQuestions({
  durationMinutes,
  bankQuestions,
  seed,
}: {
  durationMinutes: MockInterviewDuration;
  bankQuestions: MockInterviewQuestion[];
  seed: string;
}): MockInterviewQuestion[] {
  const curated = curatedIdsByDuration[durationMinutes]
    .map((id) => curatedById.get(id))
    .filter((question): question is MockInterviewQuestion => Boolean(question));
  const requiredCount = mockDurationQuestionCounts[durationMinutes];
  const rankedBank = [...bankQuestions]
    .filter((question) => question.origin === "question_bank")
    .map((question) => ({
      question,
      score: roleRelevanceScore(question) + seededNoise(`${seed}:${question.id}`),
    }))
    .sort((left, right) => right.score - left.score)
    .map(({ question }) => question);
  const usedBankIds = new Set<string>();
  const roleRound = curated.map((roleQuestion) => {
    const groundedReplacement = rankedBank.find(
      (candidate) =>
        !usedBankIds.has(candidate.id) &&
        canGroundRoleRound(candidate, roleQuestion),
    );
    if (!groundedReplacement) return roleQuestion;
    usedBankIds.add(groundedReplacement.id);
    return groundedReplacement;
  });
  const bankCount = Math.max(0, requiredCount - roleRound.length);

  const selectedBank: MockInterviewQuestion[] = [];
  const selectedLessons = new Set<string>();
  for (const question of rankedBank) {
    if (usedBankIds.has(question.id)) continue;
    const lessonKey =
      question.selectionTopics.find((topic) => topic.startsWith("lesson::")) ??
      question.id;
    if (selectedLessons.has(lessonKey)) continue;
    selectedBank.push(question);
    selectedLessons.add(lessonKey);
    if (selectedBank.length === bankCount) break;
  }

  const fallback = WORLDQUANT_ROLE_QUESTIONS.filter(
    (question) => !roleRound.some((item) => item.id === question.id),
  );
  const questions = [
    ...selectedBank,
    ...roleRound,
    ...fallback.slice(
      0,
      Math.max(0, requiredCount - selectedBank.length - roleRound.length),
    ),
  ].slice(0, requiredCount);

  return questions;
}

function canGroundRoleRound(
  candidate: MockInterviewQuestion,
  roleQuestion: MockInterviewQuestion,
) {
  if (candidate.competency !== roleQuestion.competency) return false;
  if (roleQuestion.competency === "tick_data_order_book") return true;
  if (
    roleQuestion.competency === "engineering_quality" ||
    roleQuestion.competency === "scripting"
  ) {
    return true;
  }
  if (roleQuestion.id === "worldquant-interval-stats-cpp") {
    return (
      candidate.responseMode === "code" &&
      candidate.selectionTopics.some((topic) => tickTopics.has(topic))
    );
  }
  return false;
}

export function buildWorldQuantGroundingCoverage(
  bankQuestions: MockInterviewQuestion[],
) {
  const counts = Object.fromEntries(
    mockCompetencyKeys.map((key) => [key, 0]),
  ) as Record<MockCompetencyKey, number>;
  for (const question of bankQuestions) counts[question.competency] += 1;

  return {
    counts,
    groundedCompetencies: mockCompetencyKeys.filter((key) => counts[key] > 0),
    missingCompetencies: mockCompetencyKeys.filter((key) => counts[key] === 0),
  };
}

function roleRelevanceScore(question: MockInterviewQuestion) {
  let score = 0;
  if (question.language === "cpp") score += 40;
  if (question.responseMode === "code") score += 25;
  if (question.competency === "data_pipeline_performance") score += 30;
  if (question.competency === "modern_cpp") score += 20;
  for (const topic of question.selectionTopics) {
    if (performanceTopics.has(topic)) score += 5;
    if (tickTopics.has(topic)) score += 12;
  }
  return score;
}

function seededNoise(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
