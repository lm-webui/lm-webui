import React from "react";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Brain, FileText, Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageContextProps {
  message: {
    id: string;
    role: "user" | "assistant";
    searchUsed?: boolean;
      memoryUsed?: boolean;
    documentsReferenced?: number;
    sources?: Array<{
      id: string;
      title: string;
      type: "document" | "memory" | "web";
      snippet?: string;
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

if (contextBadges.length === 0 && (!message.sources || message.sources.length === 0)) {
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

      {/* Sources section */}
      {message.sources && message.sources.length > 0 && (
        <Collapsible open={showSources} onOpenChange={setShowSources}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              {showSources ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Sources ({message.sources.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            {message.sources.map((source, index) => (
              <div
                key={source.id}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/50"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">{source.title}</span>
                    <Badge variant="secondary" className="text-xs">
                      {source.type}
                    </Badge>
                  </div>
                  {source.page && (
                    <div className="text-xs text-muted-foreground">
                      Page {source.page}
                    </div>
                  )}
                  {source.date && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {source.date.toLocaleDateString()}
                    </div>
                  )}
                  {source.snippet && (
                    <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {source.snippet}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
