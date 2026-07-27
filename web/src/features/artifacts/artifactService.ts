import { authFetch } from "@/utils/api";

export async function createArtifactFromConversation(conversationId: string, title: string) {
  const result = await authFetch("/api/artifacts/from-conversation", {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, title, artifact_type: "document" }),
  });
  return result.artifact;
}
