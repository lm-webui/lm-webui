import React from "react";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Brain, FileText, Search, Clock, AudioLines, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchTool, type SearchResult } from "@/components/ui/search-tool";

interface MessageContextProps {
  message: {
    id: string;
    role: "user" | "assistant";
    searchUsed?: boolean;
    searchQuery?: string;
    memoryUsed?: boolean;
    documentsReferenced?: number;
    context_used?: { audio?: boolean; memory?: boolean; rag?: boolean; web_search?: boolean };
    sources?: Array<{
      id: string;
      title: string;
      type: "document" | "memory" | "web" | "image" | "vision" | "transcript";
      snippet?: string;
      source?: string;
      page?: number;
      date?: Date;
    }>;
    citations?: Array<{
      id: string;
      sourceId: string;
      text: string;
    }>;
  };
  isMobile: boolean;
}

export function MessageContext({ message, isMobile }: MessageContextProps) {
  const [showSources, setShowSources] = React.useState(false);

  if (message.role !== "assistant") return null;

  // Web results render as the dedicated SearchTool widget; everything else stays in the
  // generic Sources panel so web sources aren't duplicated.
  const webSources = (message.sources || []).filter(s => s.type === "web");
  const otherSources = (message.sources || []).filter(s => s.type !== "web");
  const webResults: SearchResult[] = webSources.map(s => ({ title: s.title, source: s.source || "" }));

  const contextBadges = [];

  // Memory indicator
  if (message.memoryUsed) {
    contextBadges.push({
      icon: Brain,
      label: "Using memory",
      variant: "outline" as const,
      className: "border-purple-800 text-purple-300",
    });
  }

  // Documents referenced
  if (message.documentsReferenced && message.documentsReferenced > 0) {
    contextBadges.push({
      icon: FileText,
      label: `${message.documentsReferenced} document${message.documentsReferenced > 1 ? 's' : ''}`,
      variant: "outline" as const,
      className: "border-blue-800 text-blue-300",
    });
  }

  // Search used
  if (message.searchUsed) {
    contextBadges.push({
      icon: Search,
      label: "Web search",
      variant: "outline" as const,
      className: "border-green-800 text-green-300",
    });
  }

  // Transcribed audio/video
  if (message.context_used?.audio) {
    contextBadges.push({
      icon: AudioLines,
      label: "Transcribed audio",
      variant: "outline" as const,
      className: "border-cyan-800 text-cyan-300",
    });
  }

if (contextBadges.length === 0 && otherSources.length === 0 && webResults.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 space-y-2">
      {/* Context badges */}
      {contextBadges.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {contextBadges.map((badge, index) => (
            <Badge
              key={index}
              variant={badge.variant}
              className={cn(
                "text-[.6rem] gap-1",
                badge.className,
                isMobile ? "text-[.5rem]" : "text-[.6rem]"
              )}
            >
              <badge.icon className="h-3 w-3" />
              {badge.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Web search results */}
      {webResults.length > 0 && (
        <SearchTool
          query={message.searchQuery || ""}
          results={webResults}
          defaultOpen
        />
      )}

      {/* Citations inline support */}
      {message.citations && message.citations.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {message.citations.map((citation, index) => (
            <HoverCard key={citation.id}>
              <HoverCardTrigger asChild>
                <button className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded border border-primary/20 transition-colors">
                  {index + 1}
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 p-3" side="top">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Source {index + 1}</div>
                  <div className="text-xs text-muted-foreground">
                    {citation.text}
                  </div>
                  {message.sources?.find(s => s.id === citation.sourceId) && (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      From: {message.sources.find(s => s.id === citation.sourceId)?.title}
                    </div>
                  )}
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
      )}

      {/* Sources section (non-web: documents, images, vision, transcripts) */}
      {otherSources.length > 0 && (
        <Collapsible open={showSources} onOpenChange={setShowSources}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {showSources ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Sources ({otherSources.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {otherSources.map((source, index) => (
              <TranscriptOrSource key={source.id} source={source} index={index} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Render one source row — transcripts get a distinct card (icon + title + link + collapsible
// snippet); everything else uses the generic numbered row.
function TranscriptOrSource({ source, index }: {
  source: { id: string; title: string; type: string; snippet?: string; source?: string; page?: number; date?: Date };
  index: number;
}) {
  if (source.type === "transcript") {
    return (
      <div className="p-3 bg-cyan-500/5 rounded-lg border border-cyan-500/20">
        <div className="flex items-center gap-2 mb-1">
          <AudioLines className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
          <span className="text-sm font-medium truncate">{source.title}</span>
          <Badge variant="secondary" className="text-xs">transcript</Badge>
        </div>
        {source.source && (
          <a
            href={source.source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
          >
            View source <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {source.snippet && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="mt-2 text-xs text-muted-foreground hover:text-foreground">
                {source.snippet.length > 400 ? "Show transcript" : "Transcript"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-[8]">{source.snippet}</p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium truncate">{source.title}</span>
          <Badge variant="secondary" className="text-xs">{source.type}</Badge>
        </div>
        {source.page && <div className="text-xs text-muted-foreground">Page {source.page}</div>}
        {source.date && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {source.date.toLocaleDateString()}
          </div>
        )}
        {source.snippet && (
          <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{source.snippet}</div>
        )}
        {source.source && (
          <a
            href={source.source}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open source <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
