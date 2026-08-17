/* Agent Files editor — edit a host agent's config/skill/memory with Save + confirmation.
 * The real config file lives in the agent's home dir (~/.claude/settings.json etc.);
 * skill.md/memory.md are app-managed. Saving a real config backs it up first (backend .bak).
 */
import { useEffect, useState } from "react";
import { Loader2, Save, FolderOpen, FileCode2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getAgentFiles, saveAgentFile } from "@/utils/api";
import { cn } from "@/lib/utils";

interface FileInfo { name: string; label: string; path: string; kind: "config" | "app"; content: string; }

export default function AgentFiles({ agent }: { agent: string }) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<FileInfo | null>(null);

  useEffect(() => {
    if (!agent) { setFiles([]); return; }
    getAgentFiles(agent).then((d) => {
      setFiles(d.files || []);
      setDrafts(Object.fromEntries((d.files || []).map((f: FileInfo) => [f.name, f.content])));
    }).catch(() => setFiles([]));
  }, [agent]);

  const draft = (f: FileInfo) => drafts[f.name] ?? f.content;

  const doSave = async (f: FileInfo) => {
    setSaving(true);
    try {
      const r = await saveAgentFile(agent, f.name, draft(f));
      toast.success(`Saved ✓${f.kind === "config" ? ` (backup: ${r.path}.bak)` : ""}`);
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  const onSave = (f: FileInfo) => {
    if (f.kind === "config") setConfirm(f); // confirm before touching a real home-dir config
    else doSave(f);
  };

  const icon = (f: FileInfo) =>
    f.name === "config" ? <FileCode2 className="h-4 w-4" /> : f.name === "skill.md"
      ? <BookOpen className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-4">
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
            Select an agent to edit its config, skill, and memory.
          </div>
        ) : (
          <Tabs defaultValue={files[0]!.name} className="flex flex-col h-full">
            <TabsList>
              {files.map((f) => (
                <TabsTrigger key={f.name} value={f.name} className="gap-1.5">
                  {icon(f)} {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {files.map((f) => (
              <TabsContent key={f.name} value={f.name} className="flex flex-col min-h-0 flex-1 mt-2 space-y-2">
                <div className="flex items-center gap-1.5 text-[.65rem] text-muted-foreground truncate">
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">{f.path}</span>
                </div>
                <textarea
                  value={draft(f)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.name]: e.target.value }))}
                  spellCheck={false}
                  className={cn(
                    "flex-1 min-h-0 w-full resize-none rounded-xl border border-input bg-background px-3 py-2",
                    "text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                />
                <div className="flex justify-end">
                  <Button size="sm" className="gap-1.5" onClick={() => onSave(f)} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>

      <Dialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <DialogContent>
          <DialogTitle>Edit {confirm?.path}</DialogTitle>
          <DialogDescription>
            This edits a real config file in your home directory. The previous version is backed up
            as <span className="font-mono">{confirm?.path}.bak</span>. Save anyway?
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => confirm && doSave(confirm)} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
