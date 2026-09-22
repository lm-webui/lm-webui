#!/usr/bin/env node
// Guards the failure mode that keeps breaking builds in this repo: npm/node run
// through sudo leaves root-owned node_modules/.next/out/dist behind, and every
// later non-root build then dies with EACCES on a path like .next/trace-build --
// which reads like a bug in the code rather than a permissions problem.
//
// Refuses to run as root, and names artifacts that are already root-owned so the
// one-time fix is printed instead of guessed at.
//
// Containers legitimately build as root: set LM_WEBUI_ALLOW_ROOT=1 (see Dockerfile).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

if (process.env.LM_WEBUI_ALLOW_ROOT) process.exit(0);

if (process.getuid?.() === 0) {
  console.error(
    "\n  Refusing to run as root.\n" +
      "  npm as root leaves root-owned build output that breaks every later build.\n" +
      "  Re-run the same command without sudo.\n",
  );
  process.exit(1);
}

// statSync().uid is always 0 on Windows, so the ownership half is POSIX-only.
if (process.platform !== "win32") {
  const TARGETS = ["node_modules", ".next", "out", "dist", ".venv", "venv"];
  const offenders = new Set();

  for (const target of TARGETS) {
    const paths = [target];
    // Two levels is enough: what goes root-owned is either the directory itself
    // (node_modules, dist) or entries directly inside it (.next/trace).
    if (target !== "node_modules") {
      try {
        for (const entry of readdirSync(target)) paths.push(join(target, entry));
      } catch {
        continue; // missing or unreadable -- nothing to claim
      }
    }
    for (const p of paths) {
      try {
        if (statSync(p).uid === 0) offenders.add(target);
      } catch {
        // missing or unreadable
      }
    }
  }

  if (offenders.size > 0) {
    const dirs = [...offenders];
    console.error(
      `\n  ${dirs.join(", ")} ${dirs.length > 1 ? "are" : "is"} owned by root, ` +
        "left behind by an earlier sudo install or build.\n" +
        `  A build as ${process.env.USER ?? "your user"} cannot write there and fails with EACCES.\n\n` +
        `  Fix once:  sudo chown -R "$(id -u):$(id -g)" ${dirs.join(" ")}\n`,
    );
    process.exit(1);
  }
}
