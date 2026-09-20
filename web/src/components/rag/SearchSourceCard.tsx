import { ExternalLink, Globe2 } from "lucide-react";

interface SearchSourceCardProps {
  title: string;
  source?: string | undefined;
  domain?: string | undefined;
  provider?: string | undefined;
  snippet?: string | undefined;
  publishedAt?: string | undefined;
  retrievedAt?: string | undefined;
}

export default function SearchSourceCard({
  title,
  source,
  domain,
  provider,
  snippet,
  publishedAt,
  retrievedAt,
}: SearchSourceCardProps) {
  const date = publishedAt || retrievedAt;
  const label = domain || source || "Web source";

  return (
    <a
      href={source || undefined}
      target={source ? "_blank" : undefined}
      rel={source ? "noreferrer" : undefined}
      aria-label={source ? `Open source: ${title}` : title}
      className="group block rounded-xl border border-border/70 bg-muted/20 p-3 transition-colors hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2">
        <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="line-clamp-2 text-sm font-medium text-foreground">{title}</span>
            {source && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="truncate">{label}</span>
            {provider && <><span aria-hidden="true">·</span><span>{provider}</span></>}
            {date && <><span aria-hidden="true">·</span><span>{publishedAt ? `Published ${publishedAt}` : `Retrieved ${retrievedAt}`}</span></>}
          </div>
          {snippet && <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{snippet}</p>}
        </div>
      </div>
    </a>
  );
}
