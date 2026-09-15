/* Agent files — the config/skill/memory triplet the backend resolves for one agent.
 *
 * A status list opens one focused editor dialog at a time. The CLI's real config is written
 * behind a confirmation because it lives in the user's home directory; the app-managed
 * markdown files save directly. Editing a `kind: "config"` file also gets a persistent
 * warning banner inside the editor.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getAgentFiles, saveAgentFile } from "@/utils/api";
import { AgentFileEditorDialog } from "./AgentFileEditorDialog";
import {
  MAX_FILE_BYTES,
  byteLength,
  isDirty,
  jsonError,
  toAgentFile,
  type AgentFile,
} from "./agentFileKinds";

export default function AgentFiles({ agent }: { agent: string }) {
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openName, setOpenName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<AgentFile | null>(null);

  useEffect(() => {
    if (!agent) { setFiles([]); setOpenName(null); return; }
    let alive = true;
    setLoading(true);
    getAgentFiles(agent)
      .then((d) => {
        if (!alive) return;
        const next: AgentFile[] = (d.files || []).map(toAgentFile);
        setFiles(next);
        setDrafts(Object.fromEntries(next.map((f) => [f.name, f.content])));
      })
      .catch(() => { if (alive) setFiles([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [agent]);

  const openFile = useMemo(
    () => files.find((f) => f.name === openName) ?? null,
    [files, openName],
  );

  const draft = openFile ? drafts[openFile.name] ?? openFile.content : "";
  const dirty = openFile ? isDirty(draft, openFile.content) : false;
  const tooLarge = byteLength(draft) > MAX_FILE_BYTES;
  // Only `.json` configs are checked; `.jsonc`/`.toml` have no parser here.
  const warning = openFile?.format === "json" ? jsonError(draft) : null;

  const doSave = useCallback(async (file: AgentFile) => {
    const content = drafts[file.name] ?? file.content;
    setSaving(true);
    try {
      const r = await saveAgentFile(agent, file.name, content);
      setFiles((prev) => prev.map((f) => (f.name === file.name ? { ...f, content } : f)));
      toast.success(`Saved ${file.label}${file.kind === "config" ? ` (backup: ${r.path}.bak)` : ""}`);
    } catch {
      toast.error(`Could not save ${file.label}`);
    } finally {
      setSaving(false);
      setConfirming(null);
    }
  }, [agent, drafts]);

  const onSave = (file: AgentFile) => {
    if (file.kind === "config") setConfirming(file);
    else void doSave(file);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      {!agent ? (
        <Empty text="Select an agent to edit its config, skill, and memory." />
      ) : loading ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading files…
        </div>
      ) : files.length === 0 ? (
        <Empty text="No editable files found for this agent." />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            These files belong to the agent on the host, not to this conversation.
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {files.map((f) => (
              <li key={f.name}>
                <button
                  type="button"
                  onClick={() => setOpenName(f.name)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{f.label}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[.6rem] uppercase text-muted-foreground">
                        {f.format === "text" ? f.kind : f.format}
                      </span>
                      {!f.exists && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[.6rem] text-muted-foreground">
                          not created yet
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{f.description}</p>
                    <p className="truncate font-mono text-[.6rem] text-muted-foreground" title={f.path}>
                      {f.path}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <AgentFileEditorDialog
        file={openFile}
        draft={draft}
        dirty={dirty}
        busy={saving}
        warning={warning}
        tooLarge={tooLarge}
        onOpenChange={(open) => { if (!open) setOpenName(null); }}
        onChange={(v) => openFile && setDrafts((d) => ({ ...d, [openFile.name]: v }))}
        onSave={() => openFile && onSave(openFile)}
      />

      {/* Confirmation for the real home-dir config, which the backend overwrites in place. */}
      <Dialog open={!!confirming} onOpenChange={() => setConfirming(null)}>
        <DialogContent>
          <DialogTitle>Edit {confirming?.label}?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            This overwrites <span className="font-mono text-xs">{confirming?.path}</span> — the real
            config read by the CLI. The previous version is backed up as{" "}
            <span className="font-mono text-xs">.bak</span>.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button disabled={saving} onClick={() => confirming && doSave(confirming)}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
