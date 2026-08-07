import React, { useState, useEffect, useRef } from "react";
import {
  Copy,
  Download,
  Code,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  Image,
  File,
  Wifi,
  WifiOff,
  Clock,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { CodeBlock } from "@/components/chat/CodeBlock";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageActions } from "./MessageActions";
import { MessageContext } from "./MessageContext";
import { CitationParser } from "@/components/rag/CitationParser";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ImageLoadingSkeleton from "@/components/chat/ImageLoadingSkeleton";
import { CODE_LANGUAGE_PATTERNS } from "@/utils/chatUtils";

// Tool list processor for consistent formatting
const formatToolList = (content: string): string => {
  // Detect tool sections (lines ending with "Tools" or "Tools:")
  const sections = content.split(/(?=^[A-Z][^:\n]*Tools?:?$\n)/m);

  return sections
    .map((section) => {
      const lines = section.split("\n");
      const processedLines = [];
      let inToolSection = false;
      let inSubSection = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim() || "";

        // Check if this is a section header
        if (line && /^[A-Z][^:\n]*Tools?:?$/.test(line)) {
          processedLines.push(line);
          processedLines.push(""); // Add spacing after header
          inToolSection = true;
          inSubSection = false;
          continue;
        }

        // Skip empty lines
        if (!line) {
          processedLines.push(line);
          continue;
        }

        if (inToolSection) {
          // Section header criteria: Lines ending with ":" (like "What it is:", "Key features:")
          if (
            !line.startsWith("•") &&
            !line.startsWith("  ") &&
            line.endsWith(":")
          ) {
            processedLines.push(`• ${line}`);
            inSubSection = true;
          }
          // Sub-item criteria: Lines after section headers that don't end with ":"
          else if (
            inSubSection &&
            !line.startsWith("•") &&
            !line.endsWith(":") &&
            !line.startsWith("  ")
          ) {
            processedLines.push(`  ${line}`);
          }
          // Tool name criteria: Short lines without colons or periods (fallback for tool names)
          else if (
            !line.startsWith("•") &&
            !line.startsWith("  ") &&
            line.length < 100 &&
            !line.includes(".") &&
            !line.includes(":")
          ) {
            processedLines.push(`• ${line}`);
            inSubSection = false;
          }
          // Already formatted lines
          else {
            processedLines.push(line);
          }
        } else {
          processedLines.push(line);
        }
      }

      return processedLines.join("\n");
    })
    .join("\n");
};

interface MessageProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    isLoading?: boolean;
    model?: string;
    searchUsed?: boolean;
      rawResponse?: string;
    generatedImageUrl?: string;
    type?: string;
    fileAttachments?: Array<{
      media_id: string;
      filename: string;
      file_type: string;
      thumbnail_url?: string;
    }>;
  };
  showRawResponse?: boolean;
  isCodingMode?: boolean;
}

export function Message({
  message,
  showRawResponse = false,
  isCodingMode = false,
}: MessageProps) {
  const isMobile = useIsMobile();
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isLong = message.content.length > 800;
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [refreshingImages, setRefreshingImages] = useState<
    Record<string, boolean>
  >({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [streamingProgress, setStreamingProgress] = useState(0);
  const [lastStreamUpdate, setLastStreamUpdate] = useState<number | null>(null);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);


  // Monitor streaming activity
  useEffect(() => {
    if (message.isLoading) {
      setIsStreamingActive(true);
      setLastStreamUpdate(Date.now());

      // Start progress simulation for visual feedback
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      progressIntervalRef.current = setInterval(() => {
        setStreamingProgress((prev) => {
          // Simulate progress up to 95% while streaming
          if (prev < 95) {
            return prev + Math.random() * 5;
          }
          return prev;
        });
      }, 500);
    } else {
      setIsStreamingActive(false);
      setStreamingProgress(100);

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [message.isLoading]);

  // Check for streaming timeout
  useEffect(() => {
    if (!isStreamingActive || !lastStreamUpdate) return;

    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceUpdate = now - lastStreamUpdate;

      // If no update for 30 seconds, consider streaming stalled
      if (timeSinceUpdate > 30000) {
        setIsStreamingActive(false);
        toast.warning("Streaming appears to have stalled", {
          description: "The response may have stopped streaming.",
          duration: 5000,
        });
      }
    };

    const timeoutCheck = setInterval(checkTimeout, 5000);
    return () => clearInterval(timeoutCheck);
  }, [isStreamingActive, lastStreamUpdate]);

  const detectCodeLanguage = (content: string): string => {
    for (const [lang, pattern] of Object.entries(CODE_LANGUAGE_PATTERNS)) {
      if (pattern.test(content)) {
        return lang;
      }
    }
    return "text";
  };

  const copyToClipboard = async (text: string) => {
    try {
      let plainText = text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")
        .replace(/^>\s+/gm, "")
        .replace(/^---$/gm, "")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy text");
    }
  };

  const handleImageError = async (src: string) => {
    if (imageErrors[src] || refreshingImages[src]) return;

    setImageErrors((prev) => ({ ...prev, [src]: true }));
    setRefreshingImages((prev) => ({ ...prev, [src]: false }));
    // Removed broken lookupLocalImageUrl logic to fix compilation
  };

  const sanitizeContent = (text: string) => {
    // Replace <think> tags with blockquotes to prevent React errors
    return (
      text
        .replace(/<think>/g, "\n> **Thinking Process:**\n> ")
        .replace(/<\/think>/g, "\n\n")
        // Handle variations
        .replace(/<thinking>/g, "\n> **Thinking Process:**\n> ")
        .replace(/<\/thinking>/g, "\n\n")
    );
  };

  return (
    <div
      className={cn(
        "group animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
        message.role === "user"
          ? "ml-auto md:-mr-2"
          : "-ml-2 -mr-2 md:-ml-2 md:mr-20",
        isMobile ? "max-w-full" : "max-w-4xl",
      )}
    >
      <div
        className={cn(
          "min-w-20",
          isMobile ? "text-[.9rem]" : "text-md",
          message.role === "user" ? "text-right" : "",
          message.isLoading && "cursor-wait",
        )}
      >
        {/* Context indicators for assistant messages */}
        {message.role === "assistant" && (
          <MessageContext message={message} isMobile={isMobile} />
        )}

        {/* Message bubble with adaptive design */}
        <MessageBubble
          role={message.role}
          isMobile={isMobile}
          contentLength={message.content.length}
        >
          {message.role === "assistant" ? (
            <div
              className={cn(
                "prose max-w-none dark:prose-invert",
                isMobile ? "prose-sm text-sm" : "prose-base text-base",
                "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                "[&>h1]:text-xl [&>h1]:font-semibold [&>h1]:tracking-tight [&>h1]:mb-4",
                "[&>h2]:text-lg [&>h2]:font-semibold [&>h2]:tracking-tight [&>h2]:mb-2 [&>h2]:mt-2",
                "[&>h3]:text-lg [&>h3]:font-semibold [&>h3]:tracking-tight [&>h3]:mb-3 [&>h3]:mt-2",
                "[&>p]:leading-[1.6] [&>p]:my-3",
                "[&>ul]:my-3 [&>ul]:ml-4 [&>ol]:my-3 [&>ol]:-ml-2",
                "[&>li]:my-1 [&>li]:leading-[1.8]",
                "[&>ul>li]:relative [&>ul>li]:pl-6 [&>ul>li]:ml-2 [&>ul>li]:list-none [&>ul>li]:before:content-['•'] [&>ul>li]:before:absolute [&>ul>li]:before:left-0 [&>ul>li]:before:text-current [&>ul>li]:before:font-bold",
                "[&>ol>li]:relative [&>ol>li]:pl-6 [&>ol>li]:ml-1 [&>ol>li]:list-none [&>ol>li]:before:content-[attr(data-counter)] [&>ol>li]:before:absolute [&>ol>li]:before:left-0 [&>ol>li]:before:text-current [&>ol>li]:before:font-bold [&>ol>li]:before:mr-2",
                "[&>p]:ml-0 [&>p]:pl-2",
                "[&>blockquote]:border-l-primary [&>blockquote]:bg-muted/50 [&>blockquote]:my-4 [&>blockquote]:leading-[1.6]",
                "[&>pre]:my-3",
                "[&>table]:my-4",
                "[&>code]:bg-zinc-800 [&>code]:border [&>code]:border-zinc-700 [&>code]:rounded [&>code]:px-1.5 [&>code]:text-sm",
                isMobile &&
                  "[&>p]:text-sm [&>li]:text-sm [&>table]:text-xs [&>p]:leading-[1.8]",
              )}
            >

              {/* Image loading skeleton */}
              {message.type === "image_loading" && (
                <ImageLoadingSkeleton />
              )}

              {/* Streaming status indicator */}
              {message.isLoading && message.type !== "image_loading" && (
                <div className="flex items-center gap-2 mb-3 p-2 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                      <div className="absolute inset-0 h-2 w-2 rounded-full bg-primary/40 animate-ping"></div>
                    </div>
                    <span className="text-xs font-medium text-primary">
                      Streaming response...
                    </span>
                  </div>
                  <div className="flex-1 h-1.5 bg-primary/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${streamingProgress}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(streamingProgress)}%
                  </span>
                </div>
              )}

              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                children={formatToolList(sanitizeContent(message.content)) + (message.isLoading ? " ▎" : "")}
                components={{
                  p({ children, ...props }) {
                    // Use CitationParser for text content while preserving React elements
                    // Use div instead of p to avoid "cannot appear as a descendant of p" errors
                    // when markdown contains block elements like pre, div, etc. inside paragraphs
                    return (
                      <div className="mb-4 last:mb-0" {...props}>
                        {React.Children.map(children, (child, index) => {
                          if (typeof child === "string") {
                            return (
                              <CitationParser key={index} content={child} />
                            );
                          }
                          return child;
                        })}
                      </div>
                    );
                  },
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeText = String(children).replace(/\n$/, "");
                    const detectedLang =
                      match?.[1] || detectCodeLanguage(codeText);

                    const shouldRenderAsBlock =
                      !inline &&
                      (match ||
                        isCodingMode ||
                        codeText.includes("\n") ||
                        codeText.length > 50);

                    return shouldRenderAsBlock ? (
                      <CodeBlock language={detectedLang || "text"}>
                        {codeText}
                      </CodeBlock>
                    ) : (
                      <code
                        className="bg-neutral-800 text-neutral-400 px-1.5 rounded-md text-sm font-mono border-none"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  img({ src, alt, ...props }) {
                    const [currentSrc, setCurrentSrc] = useState(src || "");
                    const [hasError, setHasError] = useState(false);

                    // Don't render anything if src is empty string (fixes React warning)
                    if (!src) return null;

                    // Filter out problematic props that might be strings from HTML parsing
                    const filteredProps = { ...props } as any;
                    Object.keys(filteredProps).forEach((key) => {
                      if (
                        typeof filteredProps[key] === "string" &&
                        key.startsWith("on")
                      ) {
                        delete filteredProps[key];
                      }
                    });

                    // Use span instead of div to avoid nesting issues in <p> tags
                    return (
                      <span className="relative group/image my-4 block">
                        <img
                          src={currentSrc}
                          alt={alt}
                          className={cn(
                            "rounded-lg max-w-full h-auto border shadow-sm",
                            hasError && "opacity-50",
                          )}
                          loading="lazy"
                          onError={() => {
                            setHasError(true);
                            handleImageError(src || "");
                          }}
                          {...filteredProps}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity h-8 w-8 p-0"
                          onClick={async (e) => {
                            e.stopPropagation(); // Prevent image click

                            const imageUrl = currentSrc || "";
                            if (!imageUrl) {
                              toast.error("No image available for download");
                              return;
                            }

                            try {
                              // For blob URLs and data URLs, use direct download
                              if (
                                imageUrl.startsWith("blob:") ||
                                imageUrl.startsWith("data:")
                              ) {
                                const link = document.createElement("a");
                                link.href = imageUrl;
                                link.download = `generated-image-${Date.now()}.png`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                toast.success("Image downloaded!");
                                return;
                              }

                              // For regular HTTP URLs (including local paths), fetch and download as blob
                              const response = await fetch(imageUrl, {
                                method: "GET",
                                headers: {
                                  Accept: "image/*",
                                },
                              });

                              if (!response.ok) {
                                throw new Error(
                                  `Failed to fetch image: ${response.status}`,
                                );
                              }

                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);

                              const link = document.createElement("a");
                              link.href = blobUrl;
                              link.download = `generated-image-${Date.now()}.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);

                              // Clean up blob URL after a short delay
                              setTimeout(
                                () => URL.revokeObjectURL(blobUrl),
                                1000,
                              );

                              toast.success("Image downloaded!");
                            } catch (error) {
                              console.error("Download failed:", error);

                              // Fallback: try opening in new tab with download intent
                              try {
                                const link = document.createElement("a");
                                link.href = imageUrl;
                                link.download = `generated-image-${Date.now()}.png`;
                                link.target = "_blank";
                                link.rel = "noopener noreferrer";

                                // Try to force download with download attribute
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);

                                toast.info("Download started in new tab");
                              } catch (fallbackError) {
                                console.error(
                                  "Fallback download failed:",
                                  fallbackError,
                                );
                                toast.error(
                                  "Download failed. Please try again.",
                                );
                              }
                            }
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </span>
                    );
                  },
                  a({ href, children, ...props }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                  table({ children, ...props }) {
                    return (
                      <div className="overflow-x-auto my-4">
                        <table
                          className="min-w-full border border-border rounded-lg"
                          {...props}
                        >
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children, ...props }) {
                    return (
                      <th
                        className="border border-border bg-muted/50 px-3 py-2 text-left font-medium"
                        {...props}
                      >
                        {children}
                      </th>
                    );
                  },
                  td({ children, ...props }) {
                    return (
                      <td className="border border-border px-3 py-2" {...props}>
                        {children}
                      </td>
                    );
                  },
                }}
              />

              {/* Render generated image from generatedImageUrl field */}
              {message.generatedImageUrl && (
                <div className="mt-4">
                  <div className="relative inline-block group/image">
                    <img
                      src={message.generatedImageUrl}
                      alt="Generated image"
                      className="rounded-lg h-auto border shadow-sm max-w-[180px] max-h-[180px] object-contain cursor-pointer block"
                      loading="lazy"
                      onClick={() => setPreviewUrl(message.generatedImageUrl!)}
                      title="Click to preview full size"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute bottom-1 right-1 opacity-40 hover:opacity-100 transition-opacity h-6 w-6 p-0 bg-background/90 backdrop-blur-sm border-border/50 hover:border-border"
                      onClick={async (e) => {
                        e.stopPropagation(); // Prevent image click

                        const imageUrl = message.generatedImageUrl || "";
                        if (!imageUrl) {
                          toast.error("No image available for download");
                          return;
                        }

                        try {
                          // For blob URLs and data URLs, use direct download
                          if (
                            imageUrl.startsWith("blob:") ||
                            imageUrl.startsWith("data:")
                          ) {
                            const link = document.createElement("a");
                            link.href = imageUrl;
                            link.download = `generated-image-${Date.now()}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            toast.success("Image downloaded!");
                            return;
                          }

                          // For regular HTTP URLs, fetch and download as blob
                          const response = await fetch(imageUrl, {
                            method: "GET",
                            headers: {
                              Accept: "image/*",
                            },
                          });

                          if (!response.ok) {
                            throw new Error(
                              `Failed to fetch image: ${response.status}`,
                            );
                          }

                          const blob = await response.blob();
                          const blobUrl = URL.createObjectURL(blob);

                          const link = document.createElement("a");
                          link.href = blobUrl;
                          link.download = `generated-image-${Date.now()}.png`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);

                          // Clean up blob URL after a short delay
                          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

                          toast.success("Image downloaded!");
                        } catch (error) {
                          console.error("Download failed:", error);

                          // Fallback: try opening in new tab with download intent
                          try {
                            const link = document.createElement("a");
                            link.href = imageUrl;
                            link.download = `generated-image-${Date.now()}.png`;
                            link.target = "_blank";
                            link.rel = "noopener noreferrer";

                            // Try to force download with download attribute
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);

                            toast.info("Download started in new tab");
                          } catch (fallbackError) {
                            console.error(
                              "Fallback download failed:",
                              fallbackError,
                            );
                            toast.error("Download failed. Please try again.");
                          }
                        }
                      }}
                      title="Download image"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute bottom-1 right-8 opacity-40 hover:opacity-100 transition-opacity h-6 w-6 p-0 bg-background/90 backdrop-blur-sm border-border/50 hover:border-border"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent("studio-load", {
                          detail: { prompt: message.content || "", imageUrl: message.generatedImageUrl },
                        }));
                        window.dispatchEvent(new Event("navigate-studio"));
                      }}
                      title="Open in Image Studio"
                    >
                      <Image className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div
                className={cn("overflow-hidden", !expanded && "max-h-[25vh]")}
              >
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
              </div>
              {isLong && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mt-1"
                >
                  {expanded ? "Show less ▲" : "Show more ▼"}
                </button>
              )}

              {/* File attachments for user messages */}
              {message.fileAttachments &&
                message.fileAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.fileAttachments.map((file) => (
                      <div
                        key={file.media_id}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 rounded-lg border border-blue-500/30"
                      >
                        {file.file_type.startsWith("image/") ? (
                          <Image className="h-4 w-4 text-blue-400" />
                        ) : (
                          <File className="h-4 w-4 text-blue-400" />
                        )}
                        <span className="text-xs text-blue-300 truncate max-w-32">
                          {file.filename}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </>
          )}
        </MessageBubble>

        {/* Raw response collapsible */}
        {showRawResponse &&
          message.rawResponse &&
          message.role === "assistant" && (
            <Collapsible
              open={showRaw}
              onOpenChange={setShowRaw}
              className="mt-3"
            >
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-8">
                  {showRaw ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  Raw Response
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="bg-muted/50 p-3 rounded-lg text-xs font-mono max-h-40 overflow-y-auto border">
                  <pre className="whitespace-pre-wrap">
                    {message.rawResponse}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

        {/* Timestamp and model info with inline actions */}
        <div
          className={cn(
            "text-[10px] text-note-foreground mt-1 mb-4 ml-4 mr-8 flex items-center gap-2",
            message.role === "user" ? "justify-end" : "",
            isMobile && "text-[11px]",
          )}
        >
          {/* User messages: Actions on the left side */}
          {message.role === "user" && (
            <MessageActions
              message={message}
              isMobile={isMobile}
              copied={copied}
              onCopy={() => copyToClipboard(message.content)}
              onEdit={() => {
                /* TODO: Implement edit */
              }}
              showRegenerate={false}
              showShare={false}
              showLike={false}
              showDislike={false}
            />
          )}

          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>

          {/* Streaming status indicator */}
          {message.isLoading && (
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
              <span className="text-xs text-primary">Streaming</span>
            </div>
          )}

          {/* Model info */}
          {message.model && !isMobile && (
            <>
              <span>•</span>
              <span>{message.model}</span>
            </>
          )}

          {/* Assistant messages: Actions on the right side */}
          {message.role === "assistant" && (
            <MessageActions
              message={message}
              isMobile={isMobile}
              copied={copied}
              onCopy={() => copyToClipboard(message.content)}
              onLike={() => {
                /* TODO: Implement like */
              }}
              onDislike={() => {
                /* TODO: Implement dislike */
              }}
              showEdit={false}
            />
          )}
        </div>

        {/* Image preview dialog */}
        <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-1 bg-black/90 border-0">
            <DialogTitle className="sr-only">Image Preview</DialogTitle>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Full size generated image"
                className="w-full h-full object-contain rounded-lg max-h-[85vh]"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default Message;
