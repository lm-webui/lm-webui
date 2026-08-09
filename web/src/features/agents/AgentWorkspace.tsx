import { Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Agent workspace — placeholder page. Mirrors the container/layout pattern of
 * ImageWorkspace and ProjectsWorkspace so navigation feels consistent.
 */
export default function AgentWorkspace() {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Agent</h2>
        </div>

        <Card>
          <CardContent className="p-10 text-center">
            <Bot className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Coming soon</p>
            <p className="text-xs text-muted-foreground mt-1">
              Agents orchestration and multi-step task execution are on the way.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
