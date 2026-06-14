import { useMemo } from "react";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  useAssignments,
  useCrew,
  useCrewFairnessScores,
  useLatestScheduleRun,
  useManualOverrides,
  useScheduleHealth,
} from "@/hooks/data";
import { calculateFairness } from "@/lib/fairness";
import { cn } from "@/lib/utils";

function ScoreBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full rounded-full bg-border">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 80 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  good,
}: {
  label: string;
  value: string | number;
  sub?: string;
  good?: boolean;
}) {
  return (
    <div className="panel p-4">
      <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-2 font-mono text-2xl font-medium", good === false ? "text-warning" : "text-primary")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function Fairness() {
  const navigate = useNavigate();
  const crewQuery = useCrew();
  const latestRun = useLatestScheduleRun();
  const assignmentsQuery = useAssignments(latestRun.data?.id);
  const persistedFairness = useCrewFairnessScores();
  const scheduleHealth = useScheduleHealth();
  const overrides = useManualOverrides();

  const crew = crewQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];

  const fairness = useMemo(() => calculateFairness(crew, assignments), [crew, assignments]);

  const persistedMap = new Map(
    (persistedFairness.data ?? []).map((s) => [s.crew_member_id, s]),
  );

  const crewRows = fairness.crewScores.map((s) => {
    const stored = persistedMap.get(s.crewMemberId);
    return {
      ...s,
      score: stored?.crew_fairness_score ?? s.score,
      fairnessDebt: stored?.fairness_debt ?? s.fairnessDebt,
      totalWatches: stored?.total_watches ?? s.totalWatches,
      fridayCount: stored?.friday_watches ?? s.fridayCount,
      weekendCount: stored?.weekend_watches ?? s.weekendCount,
      holidayCount: stored?.holiday_watches ?? s.holidayCount,
    };
  });

  const scheduleFairness = latestRun.data?.fairness_score ?? fairness.scheduleFairnessScore;
  const avgFairness =
    crewRows.length > 0
      ? Math.round(crewRows.reduce((s, r) => s + r.score, 0) / crewRows.length)
      : 0;
  const health = scheduleHealth.data?.schedule_health_score ?? scheduleFairness;
  const stability = scheduleHealth.data?.rotation_stability_score ?? fairness.rotationStabilityScore;

  return (
    <AppShell>
      <div className="mb-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Fairness Engine
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold">Schedule fairness</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time fairness analysis across your crew rotation. The engine weights duties
          by day type (weekends, holidays, Fridays) to ensure balanced distribution.
        </p>
      </div>

      {/* Top metrics */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Schedule Fairness"
          value={`${scheduleFairness || "—"}%`}
          sub="Overall schedule score"
          good={scheduleFairness >= 80}
        />
        <MetricCard
          label="Avg Crew Fairness"
          value={`${avgFairness || "—"}%`}
          sub="Mean across active crew"
          good={avgFairness >= 80}
        />
        <MetricCard
          label="Rotation Stability"
          value={`${stability || "—"}%`}
          sub="Consecutive-day avoidance"
          good={stability >= 80}
        />
        <MetricCard
          label="Schedule Health"
          value={`${health || "—"}%`}
          sub="Combined health score"
          good={health >= 80}
        />
      </div>

      {/* Fairness insight */}
      {fairness.mostDueToServe && (
        <div className="panel mb-5 flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm">
            <span className="font-medium">{fairness.mostDueToServe.crewName}</span>{" "}
            <span className="text-muted-foreground">
              has the highest fairness debt ({fairness.mostDueToServe.fairnessDebt} points) and
              should be prioritised for the next watch assignment.
            </span>
          </div>
        </div>
      )}

      {/* Per-crew breakdown */}
      <div className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-medium">Crew fairness breakdown</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Debt = actual watches − expected. Positive = owed more, negative = ahead.
          </div>
        </div>

        {crewRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <p>No assignments yet.</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => navigate("/settings")}
            >
              Configure and generate schedule
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {crewRows
              .sort((a, b) => b.fairnessDebt - a.fairnessDebt)
              .map((row) => (
                <div key={row.crewMemberId} className="px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary">
                        {row.crewName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          {row.crewName}
                          {row.fairnessDebt > 2 && (
                            <Badge variant="warning" className="text-[9px]">
                              High debt
                            </Badge>
                          )}
                          {row.fairnessDebt < -2 && (
                            <Badge variant="success" className="text-[9px]">
                              Ahead
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.totalWatches} total · {row.weekendCount} weekends ·{" "}
                          {row.fridayCount} Fridays · {row.holidayCount} holidays
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-mono text-sm font-medium">
                          {row.score}%
                        </div>
                        <div
                          className={cn(
                            "flex items-center gap-1 text-xs",
                            row.fairnessDebt > 0 ? "text-warning" : "text-success",
                          )}
                        >
                          {row.fairnessDebt > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {row.fairnessDebt > 0 ? "+" : ""}
                          {row.fairnessDebt} debt
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ScoreBar value={row.score} />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Manual overrides summary */}
      {(overrides.data?.length ?? 0) > 0 && (
        <div className="panel mt-5 p-5">
          <div className="mb-3 text-sm font-medium">
            Manual overrides ({overrides.data!.length})
          </div>
          <div className="space-y-2">
            {overrides.data!.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{o.assignment_date}</span>
                <span>→ override applied</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Manual overrides are excluded from fairness calculations.
          </p>
        </div>
      )}

      {/* Day-weight explanation */}
      <div className="panel mt-5 p-5">
        <div className="mb-3 text-sm font-medium">Duty weight reference</div>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Regular weekday", weight: "1.0×" },
            { label: "Monday / Friday", weight: "1.5×" },
            { label: "Saturday / Sunday", weight: "2.0×" },
            { label: "Public holiday", weight: "2.5×" },
            { label: "Christmas Eve/Day", weight: "3.0×" },
            { label: "New Year's Eve/Day", weight: "3.0×" },
          ].map((d) => (
            <div key={d.label} className="flex items-center justify-between rounded border border-border bg-background/35 px-3 py-2">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-mono font-medium text-primary">{d.weight}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
