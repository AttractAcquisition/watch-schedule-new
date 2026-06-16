import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { AskTheSchedule } from "@/components/schedule/AskTheSchedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import {
  useAssignments,
  useCrew,
  useCrewFairnessScores,
  useLatestScheduleRun,
  useScheduleHealth,
  useVesselId,
} from "@/hooks/data";
import { exportSchedule } from "@/lib/edge";
import { buildBridgeCSV, downloadBlob, exportFilename } from "@/lib/exportUtils";
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

export default function Dashboard() {
  const navigate = useNavigate();
  const vesselId = useVesselId();
  const { subscription, vessel } = useAuth();
  const crewQuery = useCrew();
  const latestRun = useLatestScheduleRun();
  const assignmentsQuery = useAssignments(latestRun.data?.id);
  const persistedFairness = useCrewFairnessScores();
  const scheduleHealth = useScheduleHealth();

  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [view, setView] = useState<"month" | "week">("month");

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
  const highestDebt =
    crewFairnessRows.length > 0
      ? Math.max(...crewFairnessRows.map((r) => r.fairnessDebt), 0)
      : fairness.highestFairnessDebt;
  const stability = scheduleHealth.data?.rotation_stability_score ?? fairness.rotationStabilityScore;

  const planType = (subscription?.plan_type ?? vessel?.plan_type) as PlanType | null | undefined;

  const calMonth = monthKey(month);
  const days = view === "month" ? buildMonthGrid(month) : buildWeekGrid(month);
  const todayIso = toISODate(new Date());
  const maxMonth = startOfMonth(addMonths(startOfMonth(new Date()), 3));

  async function handleExport() {
    const run = latestRun.data;
    if (!run?.id) {
      toast.error("No schedule yet. Generate one from Settings first.");
      return;
    }
    const rows = assignmentsQuery.data;
    if (!rows?.length) {
      toast.error("No assignments found. Generate a schedule from Settings first.");
      return;
    }
    try {
      const crewMap = new Map((crewQuery.data ?? []).map((c) => [c.id, c]));
      const csv = buildBridgeCSV(rows, crewMap, vessel?.name ?? "Vessel");
      downloadBlob(csv, exportFilename("bridge"));
      toast.success("Bridge schedule downloaded.");
      exportSchedule({ schedule_run_id: run.id, export_type: "bridge", vessel_id: vesselId ?? undefined }).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">
              {vessel?.name ?? "Your vessel"}
            </h1>
            {planType && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {PLAN_LABEL[planType]}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/settings#watch-rules")}>
            <RotateCw className="h-3.5 w-3.5" /> Generate Schedule
          </Button>
          <Button size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
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

          <AskTheSchedule />
        </aside>
      </div>
    </AppShell>
  );
}
