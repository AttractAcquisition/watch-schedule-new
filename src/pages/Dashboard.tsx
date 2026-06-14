import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ChevronLeft, ChevronRight, Download, ShipWheel } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import {
  useAssignments,
  useCharterPauses,
  useCrew,
  useCrewFairnessScores,
  useLatestScheduleRun,
  useManualOverrides,
  useScheduleExplanations,
  useScheduleHealth,
  useVesselId,
} from "@/hooks/data";
import { activateCharterMode, exportSchedule, resumeCharterMode } from "@/lib/edge";
import { calculateFairness } from "@/lib/fairness";
import { PLAN_LABEL } from "@/lib/constants";
import {
  cn,
  toISODate,
  addMonths,
  startOfMonth,
  monthKey,
  getDayWeightKind,
} from "@/lib/utils";
import type { PlanType } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildMonthGrid(month: Date) {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function buildWeekGrid(month: Date) {
  const today = new Date();
  const anchor =
    today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear()
      ? today
      : startOfMonth(month);
  const offset = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3.5">
      <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-mono text-xl font-medium text-primary">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const vesselId = useVesselId();
  const { subscription, vessel } = useAuth();
  const crewQuery = useCrew();
  const latestRun = useLatestScheduleRun();
  const assignmentsQuery = useAssignments(latestRun.data?.id);
  const charterQuery = useCharterPauses();
  const persistedFairness = useCrewFairnessScores();
  const scheduleHealth = useScheduleHealth();
  const explanations = useScheduleExplanations();
  const overrides = useManualOverrides();

  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [view, setView] = useState<"month" | "week">("month");
  const [charterBusy, setCharterBusy] = useState(false);

  const crew = crewQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, string>();
    const crewById = new Map(crew.map((m) => [m.id, m.full_name]));
    for (const a of assignments) {
      const date = a.assignment_date ?? a.watch_start.slice(0, 10);
      map.set(date, crewById.get(a.crew_member_id) ?? "—");
    }
    return map;
  }, [assignments, crew]);

  const fairness = useMemo(() => calculateFairness(crew, assignments), [crew, assignments]);

  const persistedMap = new Map(
    (persistedFairness.data ?? []).map((s) => [s.crew_member_id, s]),
  );

  const crewFairnessRows = fairness.crewScores.map((s) => {
    const stored = persistedMap.get(s.crewMemberId);
    return {
      ...s,
      score: stored?.crew_fairness_score ?? s.score,
      fairnessDebt: stored?.fairness_debt ?? s.fairnessDebt,
    };
  });

  const scheduleFairness = latestRun.data?.fairness_score ?? fairness.scheduleFairnessScore;
  const avgFairness =
    crewFairnessRows.length > 0
      ? Math.round(crewFairnessRows.reduce((s, r) => s + r.score, 0) / crewFairnessRows.length)
      : fairness.averageCrewFairnessScore;
  const highestDebt =
    crewFairnessRows.length > 0
      ? Math.max(...crewFairnessRows.map((r) => r.fairnessDebt), 0)
      : fairness.highestFairnessDebt;
  const lowestScore =
    crewFairnessRows.length > 0
      ? Math.min(...crewFairnessRows.map((r) => r.score))
      : fairness.lowestFairnessScore;
  const stability = scheduleHealth.data?.rotation_stability_score ?? fairness.rotationStabilityScore;
  const health = scheduleHealth.data?.schedule_health_score ?? scheduleFairness;

  const runWarnings = Array.isArray(latestRun.data?.warnings)
    ? (latestRun.data!.warnings as string[]).filter((w) => typeof w === "string")
    : [];
  const alerts = [
    ...runWarnings,
    ...(explanations.data ?? [])
      .filter((e) => e.explanation_type === "alert")
      .map((e) => e.explanation_text),
  ];

  const activeCharter = (charterQuery.data ?? []).find((c) => c.status === "active");
  const planType = (subscription?.plan_type ?? vessel?.plan_type) as PlanType | null | undefined;

  const calMonth = monthKey(month);
  const days = view === "month" ? buildMonthGrid(month) : buildWeekGrid(month);
  const todayIso = toISODate(new Date());
  const maxMonth = startOfMonth(addMonths(startOfMonth(new Date()), 3));

  async function handleExport() {
    if (!latestRun.data?.id) {
      toast("No schedule yet. Save & regenerate from Settings first.");
      return;
    }
    try {
      const result = await exportSchedule({
        schedule_run_id: latestRun.data.id,
        export_type: "bridge",
        vessel_id: vesselId ?? undefined,
      });
      toast.success(result.file_url ? "Schedule exported." : "Export started.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function handleCharterToggle(next: boolean) {
    if (!vesselId) return;
    setCharterBusy(true);
    try {
      if (next) {
        const today = toISODate(new Date());
        const end = toISODate(addMonths(new Date(), 1));
        await activateCharterMode({
          vessel_id: vesselId,
          schedule_run_id: latestRun.data?.id,
          start_date: today,
          end_date: end,
          pause_all_watches: true,
          resume_mode: "manual",
        });
        toast.success("Charter Mode active.");
      } else {
        await resumeCharterMode({
          vessel_id: vesselId,
          schedule_run_id: latestRun.data?.id,
          resume_mode: "manual",
        });
        toast.success("Normal rotation resumed.");
      }
      charterQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Charter mode update failed.");
    } finally {
      setCharterBusy(false);
    }
  }

  return (
    <AppShell>
      {/* Header strip */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Daily Watch Rota
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold">
            {vessel?.name ?? "Your vessel"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {planType && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {PLAN_LABEL[planType]}
              </Badge>
            )}
            <Badge
              variant={activeCharter ? "warning" : "success"}
              className="text-[10px] uppercase tracking-wider"
            >
              {activeCharter ? "Charter Mode" : "Normal Rotation"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2">
            <Switch
              checked={!!activeCharter}
              disabled={charterBusy}
              onCheckedChange={handleCharterToggle}
              aria-label="Toggle Charter Mode"
            />
            <span className="text-xs text-muted-foreground">
              {activeCharter ? "Charter" : "Normal"}
            </span>
          </div>
          <Button size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Export Schedule
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={charterBusy}
          onClick={() => handleCharterToggle(!activeCharter)}
        >
          <ShipWheel className="h-3.5 w-3.5" />
          {activeCharter ? "Resume Rotation" : "Pause for Charter"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/crew")}>
          Edit Crew
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/settings#watch-rules")}>
          Regenerate Schedule
        </Button>
      </div>

      {/* Bridge metrics */}
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Schedule Fairness" value={`${scheduleFairness || "—"}%`} />
        <Metric label="Avg Crew Fairness" value={`${avgFairness || "—"}%`} />
        <Metric label="Highest Debt" value={String(highestDebt || "—")} />
        <Metric label="Lowest Fairness" value={`${lowestScore || "—"}%`} />
        <Metric label="Rotation Stability" value={`${stability || "—"}%`} />
        <Metric label="Schedule Health" value={`${health || "—"}%`} />
      </div>

      {/* Calendar + fairness panel */}
      <div className="grid gap-5 xl:grid-cols-[1fr_296px]">
        {/* Calendar */}
        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Daily Watch Calendar
              </div>
              <h2 className="mt-0.5 font-display text-lg font-semibold">
                {new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={view} onValueChange={(v) => setView(v as "month" | "week")}>
                <TabsList className="h-8">
                  <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
                  <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={month <= startOfMonth(new Date())}
                onClick={() => setMonth(addMonths(month, -1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={month >= maxMonth}
                onClick={() => setMonth(addMonths(month, 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border bg-background/40 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 md:px-3">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const iso = toISODate(day);
              const assignee = assignmentsByDate.get(iso);
              const inMonth = day.getMonth() === month.getMonth();
              const kind = getDayWeightKind(day);
              const isWeekend = kind === "saturday" || kind === "sunday";
              const isTransition = kind === "monday" || kind === "friday";
              const isToday = iso === todayIso;
              const inMonthOrWeek =
                view === "week" || (inMonth && iso.startsWith(calMonth));

              return (
                <div
                  key={iso}
                  className={cn(
                    "min-h-[5.5rem] border-b border-r border-border p-2 text-sm md:p-3",
                    !inMonth && view === "month" && "bg-background/30 opacity-50",
                    inMonthOrWeek && isWeekend && "bg-warning/5",
                    inMonthOrWeek && isTransition && !isWeekend && "bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px]",
                      isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {day.getDate()}
                  </div>
                  <div className="mt-2 min-h-6">
                    {assignee ? (
                      <div className="text-[12px] font-medium leading-tight">{assignee}</div>
                    ) : inMonthOrWeek ? (
                      <div className="text-[11px] text-muted-foreground/50">—</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {!assignments.length && (
            <div className="border-t border-border px-5 py-5 text-sm text-muted-foreground">
              No schedule generated yet.{" "}
              <button
                className="text-primary hover:underline"
                onClick={() => navigate("/settings#watch-rules")}
              >
                Configure and regenerate from Settings
              </button>
              .
            </div>
          )}
        </div>

        {/* Fairness panel */}
        <aside className="panel flex flex-col gap-5 p-5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Crew Fairness
            </div>
            <div className="mt-0.5 font-display text-lg font-semibold">
              {scheduleFairness || "—"}% score
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-border bg-background/35 p-3">
              <div className="text-muted-foreground">Highest debt</div>
              <div className="mt-1 font-mono text-primary">{highestDebt || "—"}</div>
            </div>
            <div className="rounded border border-border bg-background/35 p-3">
              <div className="text-muted-foreground">Rotation stability</div>
              <div className="mt-1 font-mono text-success">{stability || "—"}%</div>
            </div>
          </div>

          {fairness.mostDueToServe && (
            <div className="rounded border border-primary/30 bg-primary/8 p-3 text-xs">
              <div className="text-muted-foreground">Most due to serve</div>
              <div className="mt-0.5 font-medium">{fairness.mostDueToServe.crewName}</div>
            </div>
          )}

          <div className="divide-y divide-border">
            {crewFairnessRows.length > 0 ? (
              crewFairnessRows.map((row) => (
                <div key={row.crewMemberId} className="flex items-center justify-between py-2.5">
                  <span className="text-sm">{row.crewName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    <span className="text-primary">{row.score}%</span>
                    {" · "}
                    <span className={row.fairnessDebt > 0 ? "text-warning" : "text-success"}>
                      {row.fairnessDebt > 0 ? "+" : ""}
                      {row.fairnessDebt}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <div className="py-4 text-sm text-muted-foreground">
                Add active crew to calculate fairness.
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="rounded border border-border bg-background/35 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Alerts
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              {alerts.length > 0 ? (
                alerts.slice(0, 4).map((a, i) => (
                  <div key={i} className="border-l-2 border-warning/40 pl-2">{a}</div>
                ))
              ) : (
                <div>No fairness alerts.</div>
              )}
              {!!overrides.data?.length && (
                <div className="mt-1 text-muted-foreground/70">
                  {overrides.data.length} manual override{overrides.data.length !== 1 ? "s" : ""}.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
