import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Segmented } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { SettingsSection } from "./parts";

interface User {
  id: string;
  username: string;
  role: "admin" | "member";
  createdAt: number;
  lastLoginAt: number | null;
}

export function UsersSection() {
  const client = useQueryClient();
  const session = useSession();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: User[] }>("/api/users"), select: (data) => data.users });
  const [adding, setAdding] = useState(false);
  const [passwordFor, setPasswordFor] = useState<User>();
  const [removing, setRemoving] = useState<User>();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("member");
  const refresh = () => client.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: () => api.post("/api/users", { username: username.trim(), password, role }),
    onSuccess: () => {
      setAdding(false);
      setUsername("");
      setPassword("");
      return refresh();
    },
  });
  const changePassword = useMutation({
    mutationFn: () => api.post(`/api/users/${passwordFor!.id}/password`, { password, currentPassword: currentPassword || undefined }),
    onSuccess: () => {
      toast.success(`Password changed for ${passwordFor!.username}. Their other devices were signed out.`);
      setPasswordFor(undefined);
      setPassword("");
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/users/${removing!.id}`),
    onSuccess: () => {
      setRemoving(undefined);
      return refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <SettingsSection id="people" title="People" description="Administrators can change storage, downloads and settings. Members can read, search, write notes and add documents.">
      <ul className="divide-y divide-border border-y border-border">
        {users.data?.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-small font-medium text-ink">
                {user.username}
                {user.id === session.data?.user?.id ? <Badge>You</Badge> : null}
              </span>
              <span className="block text-small text-ink-muted">
                {user.role === "admin" ? "Administrator" : "Member"}, last signed in {timeAgo(user.lastLoginAt)}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setPassword(""); setCurrentPassword(""); setPasswordFor(user); }}>
              <KeyRound /> Change password
            </Button>
            {user.id !== session.data?.user?.id ? (
              <Button variant="danger-ghost" size="sm" onClick={() => setRemoving(user)}>
                <Trash2 /> Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div>
        <Button onClick={() => { setPassword(""); setAdding(true); }}>
          <Plus /> Add a person
        </Button>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Add a person" size="sm">
          <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
            <DialogBody className="grid gap-4">
              <Field label="Username">{(ids) => <Input {...ids} value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" spellCheck={false} autoComplete="off" required />}</Field>
              <Field label="Password" hint="At least 10 characters. They can change it after signing in.">
                {(ids) => <Input {...ids} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required />}
              </Field>
              <div className="grid gap-1.5">
                <span className="text-small font-medium text-ink">Role</span>
                <Segmented label="Role" value={role} onChange={setRole} options={[{ value: "member", label: "Member" }, { value: "admin", label: "Administrator" }]} />
              </div>
              {create.isError ? <Notice tone="danger">{errorMessage(create.error)}</Notice> : null}
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={create.isPending}>Add person</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordFor)} onOpenChange={(open) => !open && setPasswordFor(undefined)}>
        <DialogContent title={`Change password for ${passwordFor?.username ?? ""}`} size="sm">
          <form onSubmit={(event) => { event.preventDefault(); changePassword.mutate(); }}>
            <DialogBody className="grid gap-4">
              {passwordFor?.id === session.data?.user?.id ? (
                <Field label="Your current password">
                  {(ids) => <Input {...ids} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" autoFocus required />}
                </Field>
              ) : null}
              <Field label="New password" hint="At least 10 characters. Signs this person out everywhere else.">
                {(ids) => <Input {...ids} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required />}
              </Field>
              {changePassword.isError ? <Notice tone="danger">{errorMessage(changePassword.error)}</Notice> : null}
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setPasswordFor(undefined)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={changePassword.isPending}>Change password</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={`Remove ${removing?.username ?? ""}?`}
        description="They will be signed out and can no longer sign in. Notes and documents they added stay in the library."
        confirmLabel="Remove person"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </SettingsSection>
  );
}
