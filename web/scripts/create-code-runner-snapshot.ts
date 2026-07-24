import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { Sandbox } from "@vercel/sandbox";

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  loadEnvConfig(webRoot);

  let sandbox: (Sandbox & AsyncDisposable) | null = null;
  let snapshotted = false;
  try {
    sandbox = await Sandbox.create({
      runtime: "python3.13",
      persistent: false,
      networkPolicy: "allow-all",
      resources: { vcpus: 1 },
      timeout: 5 * 60_000,
      ports: [],
      tags: {
        app: "cpp-recall",
        purpose: "runner-bootstrap",
      },
    });

    const install = await sandbox.runCommand({
      cmd: "dnf",
      args: [
        "install",
        "-y",
        "gcc",
        "gcc-c++",
        "cmake",
        "ninja-build",
        "util-linux",
      ],
      sudo: true,
      timeoutMs: 3 * 60_000,
    });
    if (install.exitCode !== 0) {
      throw new Error(
        `Toolchain install failed:\n${await install.stderr()}`,
      );
    }

    for (const [cmd, args] of [
      ["g++", ["--version"]],
      ["cmake", ["--version"]],
      ["ninja", ["--version"]],
      ["python3", ["--version"]],
      ["prlimit", ["--version"]],
    ] as const) {
      const result = await sandbox.runCommand({
        cmd,
        args: [...args],
        timeoutMs: 10_000,
      });
      if (result.exitCode !== 0) {
        throw new Error(`${cmd} verification failed`);
      }
      const version = (await result.stdout()).split("\n")[0]?.trim();
      process.stdout.write(`${version}\n`);
    }

    await sandbox.updateNetworkPolicy("deny-all");
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    snapshotted = true;

    process.stdout.write(
      [
        "",
        "Runner snapshot created.",
        `CODE_RUNNER_SNAPSHOT_ID=${snapshot.snapshotId}`,
        "Add that value and CODE_RUNNER_ENABLED=true to Vercel Production and Preview.",
        "",
      ].join("\n"),
    );
  } finally {
    if (sandbox && !snapshotted) {
      await sandbox.stop().catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Snapshot creation failed",
  );
  process.exitCode = 1;
});
