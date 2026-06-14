import { useState } from "react";
import { Pencil, Plus, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CrewPhotoImport, ExtractedCrewPreview } from "@/components/crew/CrewPhotoImport";
import { useCrew, useVesselId } from "@/hooks/data";
import {
  addCrewMember,
  updateCrewMember,
  archiveCrewMember,
  deleteCrewMember,
} from "@/lib/api";
import { DEPT_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Department, CrewStatus } from "@/lib/types";
import type { ExtractedCrewMember } from "@/lib/edge";

interface CrewForm {
  full_name: string;
  position: string;
  rank: string;
  department: Department;
  watch_eligible: boolean;
}

const EMPTY_FORM: CrewForm = {
  full_name: "",
  position: "",
  rank: "",
  department: "deck",
  watch_eligible: true,
};

const STATUS_LABELS: Record<CrewStatus, string> = {
  active: "Active",
  on_leave: "On leave",
  offboarded: "Offboarded",
};

const STATUS_VARIANTS: Record<
  CrewStatus,
  "default" | "success" | "warning" | "destructive" | "outline"
> = {
  active: "success",
  on_leave: "warning",
  offboarded: "outline",
};

export default function Crew() {
  const vesselId = useVesselId();
  const crewQuery = useCrew();
  const crew = crewQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CrewForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<CrewStatus | "all">("active");
  const [showPhotoImport, setShowPhotoImport] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedCrewMember[]>([]);

  const filtered =
    filterStatus === "all" ? crew : crew.filter((m) => m.status === filterStatus);

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(id: string) {
    const member = crew.find((m) => m.id === id);
    if (!member) return;
    setEditId(id);
    setForm({
      full_name: member.full_name,
      position: member.position ?? "",
      rank: member.rank ?? "",
      department: (member.department as Department) ?? "deck",
      watch_eligible: member.watch_eligible ?? true,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!vesselId || !form.full_name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateCrewMember(editId, {
          full_name: form.full_name.trim(),
          position: form.position || null,
          rank: form.rank || null,
          department: form.department,
          watch_eligible: form.watch_eligible,
        });
        toast.success("Crew member updated.");
      } else {
        await addCrewMember({
          vessel_id: vesselId,
          full_name: form.full_name.trim(),
          position: form.position || null,
          rank: form.rank || null,
          department: form.department,
          watch_eligible: form.watch_eligible,
          status: "active",
        });
        toast.success("Crew member added.");
      }
      setOpen(false);
      crewQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(id: string) {
    try {
      await archiveCrewMember(id);
      toast.success("Crew member archived.");
      crewQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this crew member? This cannot be undone.")) return;
    try {
      await deleteCrewMember(id);
      toast.success("Crew member deleted.");
      crewQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  async function handleImportExtracted() {
    if (!vesselId || !extracted.length) return;
    setSaving(true);
    try {
      await Promise.all(
        extracted.map((m) =>
          addCrewMember({
            vessel_id: vesselId,
            full_name: m.full_name,
            position: m.position ?? null,
            rank: m.rank ?? null,
            department: m.department as Department,
            watch_eligible: true,
            status: "active",
          }),
        ),
      );
      toast.success(`Imported ${extracted.length} crew members.`);
      setExtracted([]);
      setShowPhotoImport(false);
      crewQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Crew Management
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold">Your crew</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPhotoImport((v) => !v)}
          >
            {showPhotoImport ? "Hide photo import" : "Import from photo"}
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Add crew member
          </Button>
        </div>
      </div>

      {/* Photo import */}
      {showPhotoImport && (
        <div className="panel mb-5 space-y-3 p-5">
          <div className="text-sm font-medium">Import crew from photo</div>
          <CrewPhotoImport onExtracted={setExtracted} />
          {extracted.length > 0 && (
            <>
              <ExtractedCrewPreview crew={extracted} onDiscard={() => setExtracted([])} />
              <Button size="sm" disabled={saving} onClick={handleImportExtracted}>
                {saving ? "Importing…" : `Add ${extracted.length} to crew`}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["active", "on_leave", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              filterStatus === s
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
            )}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Crew table */}
      <div className="panel overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-sm text-muted-foreground">
            <UserX className="mb-3 h-8 w-8 opacity-30" />
            {filterStatus === "active"
              ? "No active crew. Add your first crew member."
              : "No crew members in this category."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-medium text-primary">
                    {member.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {member.full_name}
                      <Badge variant={STATUS_VARIANTS[member.status as CrewStatus] ?? "outline"}>
                        {STATUS_LABELS[member.status as CrewStatus] ?? member.status}
                      </Badge>
                      {!member.watch_eligible && (
                        <Badge variant="outline" className="text-[10px]">
                          Watch exempt
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[member.position, member.rank, DEPT_LABELS[member.department as Department]]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-13 sm:pl-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(member.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {member.status !== "offboarded" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => handleArchive(member.id)}
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive/70 hover:text-destructive"
                      onClick={() => handleDelete(member.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit crew member" : "Add crew member"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name *</Label>
              <Input
                id="name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="e.g. 2nd Officer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rank">Rank</Label>
                <Input
                  id="rank"
                  value={form.rank}
                  onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
                  placeholder="e.g. OOW"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={form.department}
                onValueChange={(v) => setForm((f) => ({ ...f, department: v as Department }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="command">Command</SelectItem>
                  <SelectItem value="deck">Deck</SelectItem>
                  <SelectItem value="interior">Interior</SelectItem>
                  <SelectItem value="engineering">Engineering</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="watchEligible"
                checked={form.watch_eligible}
                onCheckedChange={(v) => setForm((f) => ({ ...f, watch_eligible: v }))}
              />
              <Label htmlFor="watchEligible" className="cursor-pointer">
                Watch eligible
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : editId ? "Save changes" : "Add crew member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
