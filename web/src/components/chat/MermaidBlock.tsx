/**
 * MermaidBlock — renders Mermaid.js diagrams from ```mermaid code blocks.
 * Lightweight client-side renderer using the mermaid npm package.
 */
import { useEffect, useRef, useState } from "react";

interface MermaidBlockProps {
  code: string;
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral" });
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to render diagram");
      }
    };
    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        <p className="font-medium mb-1">Diagram render error</p>
        <pre className="whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div className="my-3 flex justify-center overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div ref={ref} className="max-w-full" />
    </div>
  );
}
