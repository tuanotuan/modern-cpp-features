import type {
  ContentLanguage,
  ContentTrack,
} from "@/lib/content/schema";

export const WORLDQUANT_PROFILE_ID = "worldquant-tick-data-engineer" as const;
export const WORLDQUANT_PROFILE_VERSION = 2 as const;

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
export const mockInterviewSetIds = [
  "worldquant-30-a",
  "worldquant-30-b",
  "worldquant-45-a",
  "worldquant-45-b",
  "worldquant-60-a",
  "worldquant-60-b",
] as const;
export type MockInterviewSetId = (typeof mockInterviewSetIds)[number];

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

export type MockInterviewSet = {
  id: MockInterviewSetId;
  version: number;
  durationMinutes: MockInterviewDuration;
  number: 1 | 2;
  questionIds: readonly string[];
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
    estimatedMinutes: 7,
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
    estimatedMinutes: 10,
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
    estimatedMinutes: 7,
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
  {
    id: "worldquant-order-book-update-cpp",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "code",
    estimatedMinutes: 10,
    competency: "tick_data_order_book",
    selectionTopics: [
      "order-book",
      "sequencing",
      "fixed-point",
      "correctness",
    ],
    prompt:
      "Hoàn thiện phần lõi của L2 order book dưới đây. `apply` phải xử lý duplicate, gap, insert/update/delete level mà không làm hỏng state. Sau phần code, giải thích invariant, complexity và cách mày resync khi mất sequence.",
    code: `#include <cstdint>
#include <functional>
#include <map>

enum class Side { bid, ask };

struct LevelUpdate {
    std::uint64_t sequence;
    Side side;
    std::int64_t price_ticks;
    std::int64_t quantity; // 0 means delete
};

class OrderBook {
public:
    // Return false when the update cannot be applied safely.
    bool apply(const LevelUpdate& update);

private:
    std::uint64_t last_sequence_{};
    std::map<std::int64_t, std::int64_t, std::greater<>> bids_;
    std::map<std::int64_t, std::int64_t> asks_;
};`,
  },
  {
    id: "worldquant-cpp-event-lifetime",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "code",
    estimatedMinutes: 7,
    competency: "modern_cpp",
    selectionTopics: [
      "lifetime",
      "ownership",
      "string-view",
      "span",
    ],
    prompt:
      "Đoạn code decode market event dưới đây có lỗi lifetime. Hãy chỉ ra đường đi đến dangling view và viết lại API để caller biết rõ ownership, vẫn hạn chế copy trên hot path. Giải thích khi nào thiết kế zero-copy của mày còn hợp lệ.",
    code: `#include <cstddef>
#include <span>
#include <string_view>
#include <vector>

struct DecodedEvent {
    std::string_view symbol;
    std::span<const std::byte> payload;
};

DecodedEvent decode(std::vector<std::byte> packet) {
    // Assume the first bytes contain a symbol followed by payload.
    return {
        std::string_view(
            reinterpret_cast<const char*>(packet.data()), 4),
        std::span<const std::byte>(packet).subspan(4)
    };
}`,
  },
  {
    id: "worldquant-partitioned-pipeline-backpressure",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "text",
    estimatedMinutes: 8,
    competency: "data_pipeline_performance",
    selectionTopics: [
      "concurrency",
      "partitioning",
      "backpressure",
      "hot-key",
    ],
    prompt:
      "Một tick pipeline cần scale qua nhiều worker nhưng vẫn giữ đúng thứ tự theo instrument. Hãy thiết kế partitioning, bounded queues và backpressure. Mày xử lý hot instrument, worker failure, shutdown và đo latency/throughput ra sao để tối ưu không phá correctness?",
  },
  {
    id: "worldquant-feed-regression-testing",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cmake",
    track: "cmake",
    responseMode: "text",
    estimatedMinutes: 7,
    competency: "engineering_quality",
    selectionTopics: [
      "testing",
      "ci-cd",
      "golden-data",
      "benchmark",
    ],
    prompt:
      "Mày sắp merge decoder cho một tick feed mới. Hãy thiết kế test pyramid và CI gates để bắt malformed packet, sequence gap, timezone/session boundary, numerical regression và performance regression. Những artifact nào phải được version hóa để lỗi production có thể replay chính xác?",
  },
  {
    id: "worldquant-python-gap-audit",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "python",
    track: "python3",
    responseMode: "code",
    estimatedMinutes: 8,
    competency: "scripting",
    selectionTopics: [
      "python",
      "streaming-data",
      "sequencing",
      "audit",
    ],
    prompt:
      "Cài đặt `audit_sequences` theo kiểu streaming: phát hiện duplicate, gap và out-of-order riêng cho từng `(feed, instrument)` mà không load toàn bộ file. Sau code, nêu memory bound, giả định về input ordering và cách mở rộng để resume một job dài.",
    code: `from dataclasses import dataclass
from typing import Iterable, Iterator, Literal

@dataclass(frozen=True)
class Event:
    feed: str
    instrument: str
    sequence: int

@dataclass(frozen=True)
class Issue:
    kind: Literal["duplicate", "gap", "out_of_order"]
    event: Event
    expected_sequence: int

def audit_sequences(events: Iterable[Event]) -> Iterator[Issue]:
    ...`,
  },
  {
    id: "worldquant-cpp-feed-api-evolution",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "text",
    estimatedMinutes: 6,
    competency: "modern_cpp",
    selectionTopics: [
      "api-design",
      "value-semantics",
      "compatibility",
      "modern-cpp",
    ],
    prompt:
      "Platform phải hỗ trợ thêm nhiều feed trong khi một số component legacy còn build bằng C++11 và platform mới dùng C++20/23. Hãy thiết kế boundary/API giữa decoder và normalized tick model: ownership, error handling, ABI/versioning và cách rollout để thêm feed không buộc rebuild hoặc sửa toàn hệ thống.",
  },
  {
    id: "worldquant-production-data-incident",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "text",
    estimatedMinutes: 6,
    competency: "communication_ownership",
    selectionTopics: [
      "incident-response",
      "data-quality",
      "risk",
      "ownership",
    ],
    prompt:
      "Answer in English: Ten minutes before market open, monitoring shows stale prices for one venue after a deployment. Researchers are waiting for data and the feed owner is offline. Explain your first 30 minutes: how you contain risk, choose rollback or forward-fix, communicate status, preserve evidence, and close the incident.",
  },
  {
    id: "worldquant-parallel-replay-determinism",
    origin: "role_profile",
    version: 1,
    contentRevision: ROLE_CONTENT_REVISION,
    language: "cpp",
    track: "cpp20",
    responseMode: "text",
    estimatedMinutes: 7,
    competency: "data_pipeline_performance",
    selectionTopics: [
      "parallelism",
      "determinism",
      "replay",
      "floating-point",
    ],
    prompt:
      "Historical replay đang chạy một luồng và quá chậm. Mày sẽ parallelize theo ngày, venue hoặc instrument như thế nào mà output interval features vẫn deterministic và đủ parity với bản cũ? Thảo luận ordering, reduction, floating-point, memory, checkpoint và benchmark methodology.",
  },
];

const curatedById = new Map(
  WORLDQUANT_ROLE_QUESTIONS.map((question) => [question.id, question]),
);

const familyAQuestionIds = [
  "worldquant-tick-feed-correctness",
  "worldquant-cpp-feed-api-evolution",
  "worldquant-interval-stats-cpp",
  "worldquant-legacy-migration",
  "worldquant-cmake-delivery",
  "worldquant-python-reconciliation",
  "worldquant-researcher-collaboration",
] as const;

const familyBQuestionIds = [
  "worldquant-order-book-update-cpp",
  "worldquant-cpp-event-lifetime",
  "worldquant-parallel-replay-determinism",
  "worldquant-production-data-incident",
  "worldquant-feed-regression-testing",
  "worldquant-python-gap-audit",
  "worldquant-partitioned-pipeline-backpressure",
] as const;

export const WORLDQUANT_MOCK_SETS = [
  {
    id: "worldquant-30-a",
    version: 1,
    durationMinutes: 30,
    number: 1,
    questionIds: familyAQuestionIds.slice(0, 4),
  },
  {
    id: "worldquant-30-b",
    version: 1,
    durationMinutes: 30,
    number: 2,
    questionIds: familyBQuestionIds.slice(0, 4),
  },
  {
    id: "worldquant-45-a",
    version: 1,
    durationMinutes: 45,
    number: 1,
    questionIds: familyAQuestionIds.slice(0, 5),
  },
  {
    id: "worldquant-45-b",
    version: 1,
    durationMinutes: 45,
    number: 2,
    questionIds: familyBQuestionIds.slice(0, 5),
  },
  {
    id: "worldquant-60-a",
    version: 1,
    durationMinutes: 60,
    number: 1,
    questionIds: familyAQuestionIds,
  },
  {
    id: "worldquant-60-b",
    version: 1,
    durationMinutes: 60,
    number: 2,
    questionIds: familyBQuestionIds,
  },
] as const satisfies readonly MockInterviewSet[];

const mockSetById = new Map(
  WORLDQUANT_MOCK_SETS.map((mockSet) => [mockSet.id, mockSet]),
);

export function worldQuantMockSetsForDuration(
  durationMinutes: MockInterviewDuration,
) {
  return WORLDQUANT_MOCK_SETS.filter(
    (mockSet) => mockSet.durationMinutes === durationMinutes,
  );
}

export function worldQuantMockSetById(setId: MockInterviewSetId) {
  return mockSetById.get(setId);
}

export function matchesWorldQuantMockSet({
  setId,
  setVersion,
  durationMinutes,
  questionIds,
}: {
  setId: MockInterviewSetId;
  setVersion: number;
  durationMinutes: MockInterviewDuration;
  questionIds: readonly string[];
}) {
  const mockSet = worldQuantMockSetById(setId);
  return Boolean(
    mockSet &&
      mockSet.version === setVersion &&
      mockSet.durationMinutes === durationMinutes &&
      mockSet.questionIds.length === questionIds.length &&
      mockSet.questionIds.every(
        (questionId, index) => questionId === questionIds[index],
      ),
  );
}

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
  setId,
}: {
  setId: MockInterviewSetId;
}): MockInterviewQuestion[] {
  const mockSet = worldQuantMockSetById(setId);
  if (!mockSet) throw new Error(`Unknown mock interview set: ${setId}`);
  return mockSet.questionIds.map((questionId) => {
    const question = curatedById.get(questionId);
    if (!question) {
      throw new Error(`${setId} references an unknown question: ${questionId}`);
    }
    return question;
  });
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

for (const mockSet of WORLDQUANT_MOCK_SETS) {
  if (
    mockSet.questionIds.length !==
    mockDurationQuestionCounts[mockSet.durationMinutes]
  ) {
    throw new Error(`${mockSet.id} has the wrong question count`);
  }
  if (new Set(mockSet.questionIds).size !== mockSet.questionIds.length) {
    throw new Error(`${mockSet.id} contains duplicate questions`);
  }
  for (const questionId of mockSet.questionIds) {
    if (!curatedById.has(questionId)) {
      throw new Error(`${mockSet.id} references unknown question ${questionId}`);
    }
  }
}
