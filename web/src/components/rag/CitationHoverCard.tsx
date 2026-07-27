import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Brain, FileText, MessageSquare, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CitationSource {
  id: string;
  content: string;
  similarity?: number;
  metadata?: any;
  filename?: string;
  type?: string;
  role?: string;
  created_at?: string;
}

interface CitationHoverCardProps {
  citationNumber: number;
  source: CitationSource;
  className?: string;
}

export function CitationHoverCard({
  citationNumber,
  source,
  className
}: CitationHoverCardProps) {
  const getSourceIcon = () => {
    if (source.type === 'summary' || !source.filename) {
      return Brain;
    }
    if (source.role) {
      return MessageSquare;
    }
    return FileText;
  };

  const getSourceType = () => {
    if (source.type === 'summary') return 'Memory Summary';
    if (source.role) return 'Previous Message';
    if (source.filename) return 'Document';
    return 'Source';
  };

  const getSourceColor = () => {
    if (source.type === 'summary') return 'text-purple-400 border-purple-400/20 bg-purple-950/20';
    if (source.role) return 'text-green-400 border-green-400/20 bg-green-950/20';
    if (source.filename) return 'text-blue-400 border-blue-400/20 bg-blue-950/20';
    return 'text-gray-400 border-gray-400/20 bg-gray-950/20';
  };

  const Icon = getSourceIcon();

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button className={cn(
          "inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded border border-primary/20 transition-colors mx-0.5",
          className
        )}>
          {citationNumber}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        className={cn(
          "w-80 p-4 border-2",
          getSourceColor()
        )}
        side="top"
        align="start"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  [{citationNumber}]
                </Badge>
                <span className="text-sm font-medium">
                  {getSourceType()}
                </span>
              </div>
              {source.filename && (
                <div className="text-xs text-muted-foreground mt-1">
                  {source.filename}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Content Preview */}
          <div className="space-y-2">
            <div className="text-sm leading-relaxed">
              {source.content.length > 200
                ? `${source.content.substring(0, 200)}...`
                : source.content
              }
            </div>

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                {source.similarity && (
                  <span>Similarity: {(source.similarity * 100).toFixed(1)}%</span>
                )}
                {source.created_at && (
                  <span>
                    {new Date(source.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {source.filename && (
                <ExternalLink className="h-3 w-3" />
              )}
            </div>
          </div>

          {/* Additional Info */}
          {source.metadata && (
            <>
              <Separator />
              <div className="text-xs text-muted-foreground">
                {source.metadata.page && `Page ${source.metadata.page}`}
                {source.metadata.page && source.metadata.confidence && ' • '}
                {source.metadata.confidence && `Confidence: ${(source.metadata.confidence * 100).toFixed(1)}%`}
              </div>
            </>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default CitationHoverCard;
