import { useEffect, useState } from "react";
import { Copy, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/utils/api";
import { toast } from "sonner";

export function MobilePairingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    authFetch("/api/auth/pairing/create", { method: "POST" }).then((data) => {
      setUrl(data.url);
      setSeconds(data.expires_in || 300);
    }).catch((error) => toast.error(error.message || "Unable to create pairing link"));
  }, [open]);

  useEffect(() => {
    if (!seconds) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Pairing link copied");
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Connect mobile</DialogTitle></DialogHeader>
    <div className="space-y-4 text-sm text-muted-foreground">
      <p>Open this link on your phone while it is connected to the same network. It expires in {Math.ceil(seconds / 60)} minutes and works once.</p>
      <div className="rounded-xl border bg-muted/40 p-3 break-all text-xs select-all">{url || "Creating secure pairing link…"}</div>
      <Button className="w-full" variant="outline" disabled={!url || !seconds} onClick={copy}><Copy className="mr-2 h-4 w-4" /> Copy pairing link</Button>
      <p className="text-xs">For security, this link grants the current administrator session. Do not share it.</p>
    </div>
  </DialogContent></Dialog>;
}
