import React from 'react';
import { CitationHoverCard } from './CitationHoverCard';
import { useContextStore } from '@/store/contextStore';

interface CitationParserProps {
  content: string;
  className?: string;
}

export function CitationParser({ content, className }: CitationParserProps) {
  const { activeContext } = useContextStore();

  // Parse content and extract citations
  const parseContent = (text: string) => {
    const parts: Array<{ type: 'text' | 'citation', content: string, number?: number }> = [];
    const citationRegex = /\[(\d+)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(text)) !== null) {
      // Add text before citation
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.slice(lastIndex, match.index)
        });
      }

      // Add citation
      const citationNumber = parseInt(match[1] || '0');
      parts.push({
        type: 'citation',
        content: match[0],
        number: citationNumber
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex)
      });
    }

    return parts;
  };

  // Get source for citation number
  const getCitationSource = (citationNumber: number) => {
    if (!activeContext) return null;

    // Create a flat array of all sources with citation numbers
    const allSources: Array<any> = [];

    // Add summaries
    if (activeContext.summaries) {
      activeContext.summaries.forEach((summary, index) => {
        allSources.push({ ...summary, citationNumber: index + 1 });
      });
    }

    // Add file chunks
    if (activeContext.file_chunks) {
      activeContext.file_chunks.forEach((chunk, index) => {
        const offset = activeContext.summaries?.length || 0;
        allSources.push({ ...chunk, citationNumber: offset + index + 1 });
      });
    }

    // Add recent messages
    if (activeContext.recent_messages) {
      activeContext.recent_messages.forEach((message, index) => {
        const offset = (activeContext.summaries?.length || 0) + (activeContext.file_chunks?.length || 0);
        allSources.push({ ...message, citationNumber: offset + index + 1 });
      });
    }

    return allSources.find(source => source.citationNumber === citationNumber) || null;
  };

  const parsedParts = parseContent(content);

  return (
    <span className={className}>
      {parsedParts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.content}</span>;
        } else if (part.type === 'citation' && part.number) {
          const source = getCitationSource(part.number);
          if (source) {
            return (
              <CitationHoverCard
                key={index}
                citationNumber={part.number}
                source={source}
              />
            );
          } else {
            // Fallback: show citation number without hover card
            return (
              <span key={index} className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-muted-foreground bg-muted/50 rounded border mx-0.5">
                {part.number}
              </span>
            );
          }
        }
        return null;
      })}
    </span>
  );
}

export default CitationParser;
