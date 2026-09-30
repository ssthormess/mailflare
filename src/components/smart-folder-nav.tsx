"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AtSign, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/auth/client";
import type { FolderCount } from "@/hooks/types";
import { NavItem } from "./components-nav";

type SmartFolderLink = {
  id: string;
  name: string;
  domain: string;
};

export function SmartFolderNav({
  mailboxId,
  counts,
  minimal,
}: {
  mailboxId?: string;
  counts?: Record<string, FolderCount>;
  minimal?: boolean;
}) {
  const [folders, setFolders] = useState<SmartFolderLink[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mailboxId) {
      setFolders([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ mailboxId });
    authFetch(`/api/smart-folders?${params.toString()}`)
      .then((response) => response.json() as Promise<{ smartFolders?: SmartFolderLink[] }>)
      .then((data) => {
        if (!cancelled) setFolders(data.smartFolders ?? []);
      })
      .catch(() => {
        if (!cancelled) setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mailboxId]);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mailboxId || !domain.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await authFetch("/api/smart-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId,
          domain,
          name: name.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as SmartFolderLink & { error?: string };
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not create that folder");
        return;
      }
      setFolders((items) =>
        [...items, payload].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDomain("");
      setName("");
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!mailboxId) return null;
  if (minimal && folders.length === 0) return null;

  return (
    <>
      {!minimal && (
        <div className="mt-2 flex h-8 items-center justify-between px-3">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Smart
          </span>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-blue-50 hover:text-blue-700"
                aria-label="Create smart folder"
              >
                <Plus className="h-4 w-4" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Smart folder</DialogTitle>
                <DialogDescription>
                  Shows every message received at this domain. Mail stays in Inbox, Archive, and Spam.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createFolder} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="smartFolderDomain">Domain</Label>
                  <Input
                    id="smartFolderDomain"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                    placeholder="panorama.onl"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smartFolderName">Name</Label>
                  <Input
                    id="smartFolderName"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Same as the domain"
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" disabled={saving || !domain.trim()}>
                  {saving ? "Creating..." : "Create smart folder"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}
      {folders.map((folder) => (
        <NavItem
          key={folder.id}
          link={{
            href: `/smart-folders/${folder.id}`,
            label: folder.name,
            icon: AtSign,
            preloadMessages: true,
            count: counts?.[folder.id]?.unread,
          }}
        />
      ))}
    </>
  );
}
