import React from "react";
import { Copy, RefreshCw, Edit, Share, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface MessageActionsProps {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
  };
  isMobile: boolean;
  copied: boolean;
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  onLike?: () => void;
  onDislike?: () => void;
  showRegenerate?: boolean;
  showEdit?: boolean;
  showShare?: boolean;
  showLike?: boolean;
  showDislike?: boolean;
}

export function MessageActions({
  message,
  isMobile,
  copied,
  onCopy,
  onRegenerate,
  onEdit,
  onShare,
  onLike,
  onDislike,
  showRegenerate = true,
  showEdit = true,
  showShare = true,
  showLike = true,
  showDislike = true,
}: MessageActionsProps) {
  const isUser = message.role === "user";

  if (isUser) {
    // User messages:
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-6 w-6 p-0 transition-colors text-note-foreground",
            copied ? "text-green-400" : "hover:text-blue-400",
            isMobile ? "h-7 w-7" : "h-6 w-6"
          )}
          onClick={onCopy}
          title={copied ? "Copied!" : "Copy"}
        >
          {copied ? <Check className={cn(isMobile ? "h-3 w-3" : "h-3.5 w-3.5")} /> : <Copy className={cn(isMobile ? "h-3 w-3" : "h-3.5 w-3.5")} />}
        </Button>
        {showEdit && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-6 w-6 p-0 transition-colors text-note-foreground hover:text-blue-400",
              isMobile ? "h-7 w-7" : "h-6 w-6"
            )}
            onClick={onEdit}
            title="Edit"
          >
            <Edit className={cn(isMobile ? "h-3 w-3" : "h-3.5 w-3.5")} />
          </Button>
        )}
      </div>
    );
  }

  // Assistant messages: 
  const assistantActions = [
    showRegenerate ? {
      icon: RefreshCw,
      label: "Regenerate",
      onClick: onRegenerate,
      className: "hover:text-blue-400",
    } : null,
    showLike ? {
      icon: ThumbsUp,
      label: "Like",
      onClick: onLike,
      className: "hover:text-green-400",
    } : null,
    showDislike ? {
      icon: ThumbsDown,
      label: "Dislike",
      onClick: onDislike,
      className: "hover:text-red-400",
    } : null,
    showShare ? {
      icon: Share,
      label: "Share",
      onClick: onShare,
      className: "hover:text-purple-400",
    } : null,
    {
      icon: copied ? Check : Copy,
      label: copied ? "Copied!" : "Copy",
      onClick: onCopy,
      className: copied ? "text-green-400" : "hover:text-blue-400",
    },
  ].filter((action): action is NonNullable<typeof action> => action !== null);

  return (
    <div className="flex items-center gap-2 ml-2">
      {assistantActions.map((action, index) => (
        <Button
          key={index}
          size="sm"
          variant="ghost"
          className={cn(
            "h-6 w-6 p-0 transition-colors text-note-foreground",
            action.className,
            isMobile ? "h-7 w-7" : "h-6 w-6"
          )}
          onClick={action.onClick}
          title={action.label}
        >
          <action.icon className={cn(isMobile ? "h-3 w-3" : "h-3.5 w-3.5")} />
        </Button>
      ))}
    </div>
  );
}
