import { useMemo } from "react";
import { X, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ArtifactDrawer({ artifact, onClose }: { artifact: any; onClose: () => void }) {
  const text = useMemo(() => (artifact?.content?.blocks || []).map((b: any) => b.text).join("\n\n"), [artifact]);
  const download = () => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifact.title || "artifact"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <aside className="absolute inset-y-0 right-0 z-50 mt-[43px] flex w-full max-w-xl flex-col border-l bg-background shadow-xl">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4" /><h2 className="font-semibold">{artifact.title}</h2></div>
        <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={download} title="Download Markdown"><Download className="h-4 w-4" /></Button><Button size="sm" variant="ghost" onClick={onClose} title="Close"><X className="h-4 w-4" /></Button></div>
      </div>
      <div className="flex-1 overflow-y-auto p-6"><article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{text}</article></div>
    </aside>
  );
}
