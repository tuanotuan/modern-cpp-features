import path from "node:path";

import { loadEnvConfig } from "@next/env";

const validAudit = String.raw`
from dataclasses import dataclass
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
    latest = {}
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

const isolationProbe = String.raw`import os
import socket

for key in os.environ:
    if key.upper() in {
        "OPENAI_API_KEY",
        "OPENAI_ADMIN_KEY",
        "GEMINI_API_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "CODE_RUNNER_SUPABASE_SECRET_KEY",
        "VERCEL_OIDC_TOKEN",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
    }:
        raise RuntimeError("application secret leaked into sandbox")

try:
    connection = socket.create_connection(("1.1.1.1", 80), timeout=0.5)
except OSError:
    pass
else:
    connection.close()
    raise RuntimeError("sandbox egress unexpectedly allowed")
${validAudit}`;

async function main() {
  loadEnvConfig(path.resolve(import.meta.dirname, ".."));
  process.env.CODE_RUNNER_ENABLED = "true";
  process.env.CODE_RUNNER_TOOLCHAIN_LABEL =
    process.env.CODE_RUNNER_TOOLCHAIN_LABEL || "Recall sandbox red-team";
  process.env.CODE_RUNNER_SUPABASE_SECRET_KEY =
    process.env.CODE_RUNNER_SUPABASE_SECRET_KEY || "red-team-only";

  const [{ mockExecutionSpecByQuestionId }, { executeMockCode }] =
    await Promise.all([
      import("../src/lib/code-runner/execution-specs.server"),
      import("../src/lib/code-runner/vercel-sandbox.server"),
    ]);
  const spec = mockExecutionSpecByQuestionId(
    "worldquant-python-gap-audit",
  );
  if (!spec) throw new Error("Python execution spec is missing");

  const probes = [
    {
      id: "isolation",
      name: "no egress or app secrets",
      source: isolationProbe,
      expected: "passed",
    },
    {
      id: "time",
      name: "infinite loop",
      source: "while True:\n    pass\n",
      expected: "time_limit",
    },
    {
      id: "output",
      name: "output bomb",
      source: 'print("X" * 100000)\n',
      expected: "output_limit",
    },
  ] as const;
  const requestedIds = new Set(process.argv.slice(2));
  const selectedProbes = requestedIds.size
    ? probes.filter((probe) => requestedIds.has(probe.id))
    : probes;
  if (!selectedProbes.length) {
    throw new Error("No matching red-team probe was selected");
  }

  for (const probe of selectedProbes) {
    const result = await executeMockCode({
      spec,
      source: probe.source,
      suite: "sample",
    });
    process.stdout.write(
      `${probe.name}: ${result.status} (${result.durationMs}ms)\n`,
    );
    if (result.status !== probe.expected) {
      if (result.diagnostics) {
        process.stderr.write(`${result.diagnostics}\n`);
      }
      if (result.output) process.stderr.write(`${result.output}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Sandbox red-team failed",
  );
  process.exitCode = 1;
});
