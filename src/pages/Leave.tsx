import { useState } from "react";
import { Plus, X } from "lucide-react";
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
import { useCrew, useLeaveRequests, useVesselId } from "@/hooks/data";
import {
  createLeaveRequest,
  updateLeaveRequest,
  deleteLeaveRequest,
} from "@/lib/api";
import { calculateLeaveImpact } from "@/lib/edge";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { cn, toISODate } from "@/lib/utils";
import type { LeaveType, LeaveStatus } from "@/lib/types";

const STATUS_LABELS: Record<LeaveStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};

const STATUS_VARIANTS: Record<
  LeaveStatus,
  "default" | "success" | "warning" | "destructive" | "outline"
> = {
  requested: "warning",
  approved: "success",
  denied: "destructive",
  cancelled: "outline",
};

interface LeaveForm {
  crew_member_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  notes: string;
}

const EMPTY_FORM: LeaveForm = {
  crew_member_id: "",
  leave_type: "leave",
  start_date: toISODate(new Date()),
  end_date: toISODate(new Date()),
  notes: "",
};

export default function Leave() {
  const vesselId = useVesselId();
  const crewQuery = useCrew();
  const leaveQuery = useLeaveRequests();
  const crew = crewQuery.data ?? [];
  const leaves = leaveQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeaveForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LeaveStatus | "all">("all");
  const [impact, setImpact] = useState<string | null>(null);

  const crewById = new Map(crew.map((m) => [m.id, m]));

  const filtered =
    filterStatus === "all"
      ? leaves
      : leaves.filter((l) => l.status === filterStatus);

  function openAdd() {
    setForm({ ...EMPTY_FORM, crew_member_id: crew[0]?.id ?? "" });
    setImpact(null);
    setOpen(true);
  }

  async function checkImpact() {
    if (!form.crew_member_id || !form.start_date || !form.end_date) return;
    try {
      const res = await calculateLeaveImpact({
        crew_member_id: form.crew_member_id,
        start_date: form.start_date,
        end_date: form.end_date,
        leave_type: form.leave_type,
      });
      const msg = res.summary ?? (res.warnings?.length ? res.warnings.join("; ") : null);
      setImpact(msg);
    } catch {
      setImpact(null);
    }
  }

  async function handleSave() {
    if (!vesselId || !form.crew_member_id) {
      toast.error("Select a crew member.");
      return;
    }
    setSaving(true);
    try {
      await createLeaveRequest({
        vessel_id: vesselId,
        crew_member_id: form.crew_member_id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes || null,
        status: "requested",
      });
      toast.success("Leave request created.");
      setOpen(false);
      leaveQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: string) {
    try {
      await updateLeaveRequest(id, { status: "approved" });
      toast.success("Leave approved.");
      leaveQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve.");
    }
  }

  async function handleDeny(id: string) {
    try {
      await updateLeaveRequest(id, { status: "denied" });
      toast.success("Leave denied.");
      leaveQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deny.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this leave request?")) return;
    try {
      await deleteLeaveRequest(id);
      toast.success("Deleted.");
      leaveQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Leave Management
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold">Leave requests</h1>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add leave
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "requested", "approved", "denied"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              filterStatus === s
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Leave list */}
      <div className="panel overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {filterStatus === "all"
              ? "No leave requests yet."
              : `No ${filterStatus} leave requests.`}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((leave) => {
              const member = crewById.get(leave.crew_member_id);
              const isRequested = leave.status === "requested";
              return (
                <div key={leave.id} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {member?.full_name ?? "Unknown crew"}
                      </span>
                      <Badge variant={STATUS_VARIANTS[leave.status as LeaveStatus] ?? "outline"}>
                        {STATUS_LABELS[leave.status as LeaveStatus] ?? leave.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {LEAVE_TYPE_LABELS[leave.leave_type as LeaveType] ?? leave.leave_type}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {leave.start_date} → {leave.end_date}
                      {leave.notes && ` · ${leave.notes}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isRequested && (
                      <>
                        <Button size="sm" onClick={() => handleApprove(leave.id)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeny(leave.id)}>
                          Deny
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => handleDelete(leave.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add leave request</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Crew member *</Label>
              <Select
                value={form.crew_member_id}
                onValueChange={(v) => setForm((f) => ({ ...f, crew_member_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select crew member" />
                </SelectTrigger>
                <SelectContent>
                  {crew.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leave type</Label>
              <Select
                value={form.leave_type}
                onValueChange={(v) => setForm((f) => ({ ...f, leave_type: v as LeaveType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start">Start date</Label>
                <Input
                  id="start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end">End date</Label>
                <Input
                  id="end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            {impact && (
              <div className="rounded border border-warning/30 bg-warning/8 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-warning">Schedule impact:</span> {impact}
              </div>
            )}
            <Button variant="ghost" size="sm" type="button" onClick={checkImpact}>
              Check schedule impact
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Add leave request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
