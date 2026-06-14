import { useState } from "react";
import { ShipWheel, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useCharterPauses, useLatestScheduleRun, useVesselId } from "@/hooks/data";
import { activateCharterMode, resumeCharterMode } from "@/lib/edge";
import { toISODate, addMonths } from "@/lib/utils";

export default function Charter() {
  const vesselId = useVesselId();
  const charterQuery = useCharterPauses();
  const scheduleRun = useLatestScheduleRun();
  const pauses = charterQuery.data ?? [];

  const activeCharter = pauses.find((c) => c.status === "active");
  const history = pauses.filter((c) => c.status !== "active");

  const [busy, setBusy] = useState(false);
  const [startDate, setStartDate] = useState(toISODate(new Date()));
  const [endDate, setEndDate] = useState(toISODate(addMonths(new Date(), 1)));
  const [pauseAll, setPauseAll] = useState(true);
  const [resumeMode, setResumeMode] = useState<"automatic" | "manual">("manual");

  async function handleActivate() {
    if (!vesselId) return;
    setBusy(true);
    try {
      await activateCharterMode({
        vessel_id: vesselId,
        schedule_run_id: scheduleRun.data?.id,
        start_date: startDate,
        end_date: endDate,
        pause_all_watches: pauseAll,
        resume_mode: resumeMode,
      });
      toast.success("Charter Mode activated.");
      charterQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate Charter Mode.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    if (!vesselId) return;
    setBusy(true);
    try {
      await resumeCharterMode({
        vessel_id: vesselId,
        schedule_run_id: scheduleRun.data?.id,
        resume_mode: resumeMode,
      });
      toast.success("Normal rotation resumed.");
      charterQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume rotation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Charter Mode
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold">Charter scheduling</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pause the watch rotation during charters and resume automatically or manually when guests depart.
        </p>
      </div>

      {/* Active charter banner */}
      {activeCharter ? (
        <div className="panel mb-5 flex flex-col gap-4 border-warning/30 bg-warning/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-warning/40 bg-warning/10">
              <ShipWheel className="h-4 w-4 text-warning" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Charter Mode active</span>
                <Badge variant="warning">Active</Badge>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {activeCharter.start_date} → {activeCharter.end_date}
                {activeCharter.resume_mode && ` · Resume: ${activeCharter.resume_mode}`}
              </div>
            </div>
          </div>
          <Button variant="outline" disabled={busy} onClick={handleResume}>
            {busy ? "Resuming…" : "Resume normal rotation"}
          </Button>
        </div>
      ) : null}

      {/* Configure new charter */}
      {!activeCharter && (
        <div className="panel mb-5 p-6">
          <div className="mb-5 text-sm font-medium">Configure Charter Mode</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start">Charter start</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Charter end</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="pauseAll"
                checked={pauseAll}
                onCheckedChange={setPauseAll}
              />
              <Label htmlFor="pauseAll" className="cursor-pointer">
                Pause all watches during charter
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label>Resume mode</Label>
              <Select
                value={resumeMode}
                onValueChange={(v) => setResumeMode(v as "automatic" | "manual")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual — I&apos;ll resume myself</SelectItem>
                  <SelectItem value="automatic">Automatic — resume on end date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-5" disabled={busy} onClick={handleActivate}>
            {busy ? "Activating…" : "Activate Charter Mode"}
          </Button>
        </div>
      )}

      {/* How it works */}
      <div className="panel mb-5 p-5">
        <div className="mb-3 text-sm font-medium">How Charter Mode works</div>
        <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="rounded border border-border bg-background/35 p-3">
            <div className="font-medium text-foreground">Watch rotation paused</div>
            <div className="mt-1">During charter, daily watches are suspended so crew can focus on guest service.</div>
          </div>
          <div className="rounded border border-border bg-background/35 p-3">
            <div className="font-medium text-foreground">Fairness preserved</div>
            <div className="mt-1">Charter days are excluded from fairness calculations so debt doesn&apos;t accumulate unfairly.</div>
          </div>
          <div className="rounded border border-border bg-background/35 p-3">
            <div className="font-medium text-foreground">Seamless resume</div>
            <div className="mt-1">When you resume, the scheduler picks up exactly where it left off, respecting existing fairness scores.</div>
          </div>
        </div>
      </div>

      {/* Charter history */}
      {history.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <div className="text-sm font-medium">Charter history</div>
          </div>
          <div className="divide-y divide-border">
            {history.map((pause) => (
              <div key={pause.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm font-medium">
                    {pause.start_date} → {pause.end_date}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {pause.status} · resume: {pause.resume_mode ?? "manual"}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {pause.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
