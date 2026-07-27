import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authFetch } from "@/utils/api";
import { toast } from "sonner";

type UsageUser = { user_id: number; email: string; status: string; requests: number; total_tokens: number; last_active_at?: string; current_model?: { provider: string; model: string }; most_used_model?: { provider: string; model: string; requests: number } };

export function UsageAnalyticsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [users, setUsers] = useState<UsageUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    authFetch("/api/admin/usage/users").then((data) => setUsers(data.users || [])).catch((error: any) => toast.error(error.message || "Unable to load usage analytics")).finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Usage analytics</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Local metadata only. Prompts, responses, files, and API keys are not included.</p>
        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading usage…</p>}
        {!loading && users.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No usage recorded yet.</p>}
        {!loading && users.length > 0 && <div className="space-y-2">{users.map((user) => <div key={user.user_id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1.4fr_.6fr_.7fr_1.2fr_1.3fr] md:items-center"><div className="min-w-0"><div className="truncate text-sm font-medium">{user.email}</div><div className="text-xs text-muted-foreground">{user.status} · {user.last_active_at ? `active ${user.last_active_at}` : "no activity"}</div></div><div className="text-sm"><span className="text-muted-foreground">Requests</span><br />{user.requests}</div><div className="text-sm"><span className="text-muted-foreground">Tokens</span><br />{user.total_tokens}</div><div className="min-w-0 text-sm"><span className="text-muted-foreground">Current model</span><br /><span className="break-words">{user.current_model ? `${user.current_model.provider}/${user.current_model.model}` : "—"}</span></div><div className="min-w-0 text-sm"><span className="text-muted-foreground">Most used</span><br /><span className="break-words">{user.most_used_model ? `${user.most_used_model.provider}/${user.most_used_model.model} (${user.most_used_model.requests})` : "—"}</span></div></div>)}</div>}
      </DialogContent>
    </Dialog>
  );
}
