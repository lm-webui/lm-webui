/* Editor for one agent file. Split into Header/Body/Footer so the dialog stays readable.
 *
 * Plain textarea on purpose: these are small config/markdown files, and a code editor is a
 * dependency we do not need. The config file gets a persistent banner because saving it
 * overwrites a real file in the user's home directory.
 */
import { AlertTriangle, FileCode2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgentFile } from "./agentFileKinds";

interface Props {
  /** null = closed. */
  file: AgentFile | null;
  draft: string;
  dirty: boolean;
  busy: boolean;
  /** Blocking parse error (malformed `.json`); the backend rejects it too. */
  warning: string | null;
  /** Blocking problem — over the byte cap. */
  tooLarge: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  onSave: () => void;
}

function FileEditorHeader({ file }: { file: AgentFile }) {
  return (
    <DialogHeader className="gap-2 pr-8">
      <DialogTitle className="flex items-center gap-2 font-mono text-base">
        <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        {file.label}
      </DialogTitle>
      <DialogDescription className="leading-relaxed">{file.description}</DialogDescription>
      <p className="truncate font-mono text-[.65rem] text-muted-foreground" title={file.path}>
        {file.path}
      </p>
    </DialogHeader>
  );
}

export function AgentFileEditorDialog({
  file, draft, dirty, busy, warning, tooLarge, onOpenChange, onChange, onSave,
}: Props) {
  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1.5rem)] flex-col gap-4 sm:max-w-3xl">
        {file && (
          <>
            <FileEditorHeader file={file} />

            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {file.kind === "config" && (
                <p className="flex shrink-0 gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This is the real config read by the {file.label.toLowerCase()} CLI. Saving
                    replaces it — the previous version is backed up alongside as{" "}
                    <span className="font-mono">.bak</span>.
                  </span>
                </p>
              )}

              <Textarea
                value={draft}
                onChange={(e) => onChange(e.target.value)}
                disabled={busy}
                spellCheck={false}
                className="min-h-[min(52dvh,22rem)] flex-1 resize-none overflow-y-auto font-mono text-xs leading-relaxed"
                placeholder={`Write ${file.label} content…`}
              />

              {tooLarge ? (
                <p className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400">
                  File is over the 256 KB limit — shorten it before saving.
                </p>
              ) : warning ? (
                <p className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400">
                  Invalid JSON: {warning}
                </p>
              ) : dirty ? (
                <p className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Unsaved changes
                </p>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                className={cn("gap-1.5")}
                disabled={busy || tooLarge || !!warning || !dirty}
                onClick={onSave}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
