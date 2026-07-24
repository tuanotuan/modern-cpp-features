import path from "node:path";

import { loadEnvConfig } from "@next/env";

const intervalSolution = String.raw`#include <algorithm>
#include <cstdint>
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

    void on_tick(const Tick& tick) {
        ++tick_count;
        volume += tick.quantity;
        turnover += static_cast<long double>(tick.price) * tick.quantity;
        if (!open) {
            open = high = low = tick.price;
        } else {
            high = std::max(*high, tick.price);
            low = std::min(*low, tick.price);
        }
        close = tick.price;
    }

    [[nodiscard]] std::optional<double> vwap() const {
        if (volume == 0) return std::nullopt;
        return static_cast<double>(turnover / volume);
    }
};`;

const orderBookSolution = String.raw`#include <cstdint>
#include <functional>
#include <map>

enum class Side { bid, ask };

struct LevelUpdate {
    std::uint64_t sequence;
    Side side;
    std::int64_t price_ticks;
    std::int64_t quantity;
};

class OrderBook {
public:
    bool apply(const LevelUpdate& update) {
        if (update.sequence != last_sequence_ + 1 ||
            update.price_ticks <= 0 ||
            update.quantity < 0) {
            return false;
        }
        if (update.side == Side::bid) {
            if (update.quantity == 0) bids_.erase(update.price_ticks);
            else bids_[update.price_ticks] = update.quantity;
        } else {
            if (update.quantity == 0) asks_.erase(update.price_ticks);
            else asks_[update.price_ticks] = update.quantity;
        }
        last_sequence_ = update.sequence;
        return true;
    }

private:
    std::uint64_t last_sequence_{};
    std::map<std::int64_t, std::int64_t, std::greater<>> bids_;
    std::map<std::int64_t, std::int64_t> asks_;
};`;

const pythonSolution = String.raw`from dataclasses import dataclass
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
    latest: dict[tuple[str, str], int] = {}
    for event in events:
        key = (event.feed, event.instrument)
        previous = latest.get(key)
        if previous is None:
            latest[key] = event.sequence
            continue
        expected = previous + 1
        if event.sequence == previous:
            yield Issue("duplicate", event, expected)
        elif event.sequence < previous:
            yield Issue("out_of_order", event, expected)
        elif event.sequence > expected:
            yield Issue("gap", event, expected)
            latest[key] = event.sequence
        else:
            latest[key] = event.sequence
`;

const cmakeSolution = String.raw`cmake_minimum_required(VERSION 3.20)
project(tick_feed LANGUAGES CXX)

add_library(feed_decoder src/feed_decoder.cpp)
target_include_directories(feed_decoder PUBLIC include)
target_compile_features(feed_decoder PUBLIC cxx_std_20)

include(CTest)
if(BUILD_TESTING)
  add_executable(feed_decoder_tests tests/feed_decoder_test.cpp)
  target_link_libraries(feed_decoder_tests PRIVATE feed_decoder)
  add_test(NAME feed_decoder_tests COMMAND feed_decoder_tests)
endif()
`;

async function main() {
  loadEnvConfig(path.resolve(import.meta.dirname, ".."));
  process.env.CODE_RUNNER_ENABLED = "true";
  process.env.CODE_RUNNER_TOOLCHAIN_LABEL =
    process.env.CODE_RUNNER_TOOLCHAIN_LABEL || "Recall sandbox smoke";
  process.env.CODE_RUNNER_SUPABASE_SECRET_KEY =
    process.env.CODE_RUNNER_SUPABASE_SECRET_KEY || "smoke-test-only";

  const [{ mockExecutionSpecByQuestionId }, { executeMockCode }] =
    await Promise.all([
      import("../src/lib/code-runner/execution-specs.server"),
      import("../src/lib/code-runner/vercel-sandbox.server"),
    ]);
  const fixtures = [
    ["worldquant-interval-stats-cpp", intervalSolution],
    ["worldquant-order-book-update-cpp", orderBookSolution],
    ["worldquant-python-gap-audit", pythonSolution],
    ["worldquant-cmake-delivery", cmakeSolution],
  ] as const;
  const requestedIds = new Set(process.argv.slice(2));
  const selectedFixtures = requestedIds.size
    ? fixtures.filter(([questionId]) => requestedIds.has(questionId))
    : fixtures;
  if (!selectedFixtures.length) {
    throw new Error("No matching smoke fixture was selected");
  }

  for (const [questionId, source] of selectedFixtures) {
    const spec = mockExecutionSpecByQuestionId(questionId);
    if (!spec) throw new Error(`Missing execution spec: ${questionId}`);
    const result = await executeMockCode({
      spec,
      source,
      suite: "sample",
    });
    process.stdout.write(
      `${questionId}: ${result.status} (${result.passedTests}/${result.totalTests}, ${result.durationMs}ms)\n`,
    );
    if (result.status !== "passed") {
      if (result.diagnostics) process.stderr.write(`${result.diagnostics}\n`);
      if (result.output) process.stderr.write(`${result.output}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Sandbox smoke test failed",
  );
  process.exitCode = 1;
});
