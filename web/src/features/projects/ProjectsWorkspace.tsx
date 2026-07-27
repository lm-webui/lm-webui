import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderKanban, Plus, Pencil, Trash2, MessageSquare, ArrowLeft } from "lucide-react";
import { authFetch } from "@/utils/api";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  system_prompt: string;
  conversation_count: number;
}

interface ProjectConversation {
  id: string;
  title: string;
  message_count: number;
}

type View = "list" | "detail";

export default function ProjectsWorkspace() {
  const [view, setView] = useState<View>("list");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [conversations, setConversations] = useState<ProjectConversation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrompt, setFormPrompt] = useState("");

  const BASE = import.meta.env.VITE_BACKEND_URL || "";

  const fetchProjects = async () => {
    try {
      const data = await authFetch(`${BASE}/api/projects`);
      setProjects(data.projects || []);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const openProject = async (project: Project) => {
    setSelectedProject(project);
    setView("detail");
    try {
      const data = await authFetch(`${BASE}/api/projects/${project.id}/conversations`);
      setConversations(data.conversations || []);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    }
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }
    try {
      await authFetch(`${BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, system_prompt: formPrompt }),
      });
      toast.success("Project created");
      setFormName("");
      setFormPrompt("");
      setShowForm(false);
      await fetchProjects();
    } catch (error) {
      toast.error("Failed to create project");
    }
  };

  const handleUpdate = async () => {
    if (!editingProject) return;
    if (!formName.trim() || !formPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }
    try {
      await authFetch(`${BASE}/api/projects/${editingProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, system_prompt: formPrompt }),
      });
      toast.success("Project updated");
      setEditingProject(null);
      setFormName("");
      setFormPrompt("");
      await fetchProjects();
      if (selectedProject) {
        setSelectedProject({ ...selectedProject, name: formName, system_prompt: formPrompt });
      }
    } catch (error) {
      toast.error("Failed to update project");
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!window.confirm("Delete this project? Conversations will remain but won't use its prompt.")) return;
    try {
      await authFetch(`${BASE}/api/projects/${projectId}`, { method: "DELETE" });
      toast.success("Project deleted");
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setView("list");
      }
      await fetchProjects();
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  const startEdit = (project: Project) => {
    setEditingProject(project);
    setFormName(project.name);
    setFormPrompt(project.system_prompt);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingProject(null);
    setFormName("");
    setFormPrompt("");
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {view === "detail" && selectedProject && (
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="icon" onClick={() => { setView("list"); setSelectedProject(null); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold">{selectedProject.name}</h2>
          </div>
        )}

        {view === "list" && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Projects</h2>
              </div>
              <Button size="sm" onClick={() => { setShowForm(true); setEditingProject(null); setFormName(""); setFormPrompt(""); }}>
                <Plus className="h-4 w-4 mr-1" /> New Project
              </Button>
            </div>

            {showForm && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">New Project</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Project Name</Label>
                    <Input placeholder="e.g., Code Review" value={formName} onChange={(e) => setFormName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>System Prompt</Label>
                    <textarea placeholder="You are a senior code reviewer..." value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)} rows={4} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"></textarea>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={cancelForm}>Cancel</Button>
                    <Button size="sm" onClick={handleCreate}>Create</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {editingProject && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Edit Project</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Project Name</Label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>System Prompt</Label>
                    <textarea value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)} rows={4} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"></textarea>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={cancelForm}>Cancel</Button>
                    <Button size="sm" onClick={handleUpdate}>Save</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {projects.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No projects yet</p>
                  <p className="text-xs mt-1">Create a project to set custom instructions for your conversations.</p>
                </div>
              ) : projects.map((project) => (
                <Card key={project.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openProject(project)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{project.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.system_prompt}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {project.conversation_count} conversations</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(project)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => handleDelete(project.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {view === "detail" && selectedProject && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{selectedProject.name}</CardTitle>
                <CardDescription className="line-clamp-3">{selectedProject.system_prompt}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" onClick={() => {
                  const newChatId = `conv_${Date.now()}`;
                  window.dispatchEvent(new CustomEvent("project-new-chat", {
                    detail: { projectId: selectedProject.id, chatId: newChatId },
                  }));
                }}>
                  <Plus className="h-4 w-4 mr-1" /> New Conversation
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No conversations yet in this project.</p>
              ) : conversations.map((conv) => (
                <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{conv.title}</div>
                    <div className="text-xs text-muted-foreground">{conv.message_count} messages</div>
                  </div>
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
