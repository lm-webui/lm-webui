import { describe, it, expect } from "vitest";
import {
  AGENT_FILE_KINDS,
  MAX_FILE_BYTES,
  byteLength,
  configFormat,
  fileKind,
  isDirty,
  jsonError,
  toAgentFile,
} from "./agentFileKinds";

describe("configFormat", () => {
  it("reads the format off the real per-agent config paths", () => {
    expect(configFormat("/Users/x/.claude/settings.json")).toBe("json");
    expect(configFormat("/Users/x/.codex/config.toml")).toBe("toml");
    expect(configFormat("/Users/x/.config/opencode/opencode.jsonc")).toBe("jsonc");
    expect(configFormat("/Users/x/.hermes/config.json")).toBe("json");
  });

  it("falls back to text for extensionless paths", () => {
    expect(configFormat("/data/agents/claude/skill.md")).toBe("text");
    expect(configFormat("/tmp/CONFIG")).toBe("text");
  });
});

describe("toAgentFile", () => {
  it("enriches a backend row with its description and format", () => {
    const f = toAgentFile({
      name: "config",
      label: "Config",
      path: "/Users/x/.codex/config.toml",
      kind: "config",
      content: "model = \"x\"",
    });
    expect(f.format).toBe("toml");
    expect(f.description).toContain("home directory");
    expect(f.kind).toBe("config");
  });

  it("still renders a file the registry does not know", () => {
    const f = toAgentFile({
      name: "new.file",
      path: "/data/agents/x/new.file",
      kind: "app",
      content: "",
    });
    expect(f.label).toBe("new.file");
    expect(f.description).toBe("");
    expect(f.content).toBe("");
  });

  it("defaults missing content to an empty string", () => {
    const f = toAgentFile({
      name: "memory.md",
      path: "/data/agents/x/memory.md",
      kind: "app",
    } as never);
    expect(f.content).toBe("");
    expect(f.exists).toBe(true); // absent `exists` must not read as "not created yet"
  });
});

describe("isDirty", () => {
  it("is false when the draft matches disk", () => {
    expect(isDirty("hello", "hello")).toBe(false);
  });

  it("is true on any difference, including whitespace", () => {
    expect(isDirty("hello ", "hello")).toBe(true);
    expect(isDirty("", "hello")).toBe(true);
  });
});

describe("jsonError", () => {
  it("passes valid JSON and empty content", () => {
    expect(jsonError('{"a": 1}')).toBeNull();
    expect(jsonError("")).toBeNull();
    expect(jsonError("   \n")).toBeNull();
  });

  it("reports a message for malformed JSON", () => {
    expect(jsonError('{"a": 1,}')).not.toBeNull();
  });
});

describe("byteLength / MAX_FILE_BYTES", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    // Each of these is 3 bytes in UTF-8.
    expect(byteLength("日本語")).toBe(9);
  });

  it("keeps the cap under the backend's comfort zone", () => {
    expect(MAX_FILE_BYTES).toBe(256_000);
  });
});

describe("fileKind", () => {
  it("covers the three files the backend resolves", () => {
    expect(AGENT_FILE_KINDS.map((k) => k.name)).toEqual(["config", "skill.md", "memory.md"]);
    expect(fileKind("skill.md").label).toBe("Skill");
  });
});
