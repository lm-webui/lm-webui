import { useEffect, useState } from "react";
import { Shield, UserCheck, UserPlus, UserX } from "lucide-react";
import { authFetch } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Role = "user" | "admin";
type Status = "active" | "disabled";
type ManagedUser = { id: number; email: string; role: Role; status: Status; last_login_at?: string };

export function UserManagementModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadUsers = async () => {
    try {
      const data = await authFetch("/api/admin/users");
      setUsers(data.users || []);
    } catch (error: any) {
      toast.error(error.message || "Unable to load users");
    }
  };

  useEffect(() => {
    if (open) loadUsers();
  }, [open]);

  const createUser = async () => {
    if (!email.trim() || password.length < 8) {
      toast.error("Enter an email and a password of at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await authFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ email: email.trim(), password, role }) });
      setEmail(""); setPassword(""); setRole("user");
      await loadUsers();
      toast.success("User created");
    } catch (error: any) {
      toast.error(error.message || "Unable to create user");
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (user: ManagedUser, action: "role" | "status", value: string) => {
    setUpdatingId(user.id);
    try {
      await authFetch(`/api/admin/users/${user.id}/${action}`, { method: "PATCH", body: JSON.stringify({ [action]: value }) });
      await loadUsers();
      toast.success("User updated");
    } catch (error: any) {
      toast.error(error.message || "Unable to update user");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>User management</DialogTitle></DialogHeader>

        <section className="grid gap-4 rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><UserPlus className="h-4 w-4" /> Add user</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="managed-user-email">Email</Label><Input id="managed-user-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="off" /></div>
            <div className="space-y-1.5"><Label htmlFor="managed-user-password">Temporary password</Label><Input id="managed-user-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" /></div>
            <div className="space-y-1.5"><Label htmlFor="managed-user-role">Role</Label><select id="managed-user-role" value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="user">User</option><option value="admin">Admin</option></select></div>
          </div>
          <Button onClick={createUser} disabled={loading} className="w-fit">{loading ? "Creating…" : "Create user"}</Button>
        </section>

        <section className="space-y-2" aria-label="Managed users">
          {users.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No users found.</p>}
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.email}</div><div className="text-xs text-muted-foreground">{user.status} · {user.last_login_at ? `last login ${user.last_login_at}` : "never logged in"}</div></div>
              <select aria-label={`Role for ${user.email}`} value={user.role} disabled={updatingId === user.id} onChange={(event) => updateUser(user, "role", event.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="user">User</option><option value="admin">Admin</option></select>
              <Button variant="outline" size="sm" disabled={updatingId === user.id} onClick={() => updateUser(user, "status", user.status === "active" ? "disabled" : "active")}><span className="flex items-center gap-1">{user.status === "active" ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}{user.status === "active" ? "Disable" : "Enable"}</span></Button>
              {user.role === "admin" && <Shield aria-label="Administrator" className="h-4 w-4 text-primary" />}
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
