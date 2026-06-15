import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssignments, useCrew, useCrewFairnessScores, useExportHistory, useLatestScheduleRun, useVesselId } from "@/hooks/data";
import { useAuth } from "@/lib/auth";
import { exportSchedule } from "@/lib/edge";
import type { CrewFairnessScoreRow, CrewMemberRow, ScheduleAssignmentRow } from "@/lib/database.types";

const EXPORT_TYPES = [
  { id: "bridge", label: "Bridge Schedule", ext: "csv" },
  { id: "captain", label: "Captain's Report", ext: "csv" },
  { id: "crew", label: "Crew Copy", ext: "csv" },
  { id: "payroll", label: "Payroll Hours", ext: "csv" },
  { id: "port_state", label: "Port State / STCW", ext: "csv" },
] as const;

type ExportType = (typeof EXPORT_TYPES)[number]["id"];

function downloadBlob(content: string, filename: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dayName(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function buildBridgeCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const lines = [
    `WatchSchedule – Bridge Schedule – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    "",
    "Date,Day,Watchkeeper,Position,Role",
  ];
  for (const a of assignments) {
    const crew = crewMap.get(a.crew_member_id);
    const date = a.assignment_date ?? a.watch_start.slice(0, 10);
    lines.push([
      fmtDate(date),
      dayName(date),
      crew?.full_name ?? "Unknown",
      crew?.position ?? "",
      a.watch_role ?? "Watchkeeper",
    ].join(","));
  }
  return lines.join("\n");
}

function buildCrewCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const byMember = new Map<string, ScheduleAssignmentRow[]>();
  for (const a of assignments) {
    const list = byMember.get(a.crew_member_id) ?? [];
    list.push(a);
    byMember.set(a.crew_member_id, list);
  }
  const lines = [`WatchSchedule – Crew Copy – ${vessel}`, `Generated: ${new Date().toLocaleDateString("en-GB")}`, ""];
  for (const [memberId, rows] of byMember.entries()) {
    const crew = crewMap.get(memberId);
    lines.push(`${crew?.full_name ?? "Unknown"} – ${crew?.position ?? ""}`, "Date,Day");
    for (const a of rows) {
      const date = a.assignment_date ?? a.watch_start.slice(0, 10);
      lines.push(`${fmtDate(date)},${dayName(date)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildPayrollCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const totals = new Map<string, { name: string; position: string; watches: number; weight: number }>();
  for (const a of assignments) {
    const crew = crewMap.get(a.crew_member_id);
    const name = crew?.full_name ?? "Unknown";
    const position = crew?.position ?? "";
    const entry = totals.get(a.crew_member_id) ?? { name, position, watches: 0, weight: 0 };
    entry.watches++;
    entry.weight += a.duty_weight ?? 1;
    totals.set(a.crew_member_id, entry);
  }
  const lines = [
    `WatchSchedule – Payroll Hours – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    `Period: ${fmtDate(assignments[0]?.assignment_date ?? assignments[0]?.watch_start.slice(0,10) ?? "")} – ${fmtDate(assignments[assignments.length - 1]?.assignment_date ?? assignments[assignments.length - 1]?.watch_start.slice(0,10) ?? "")}`,
    "",
    "Name,Position,Watch Days,Weighted Load,Avg Hours/Day,Est. Watch Hours",
  ];
  for (const entry of totals.values()) {
    const estHours = entry.watches * 24;
    lines.push([entry.name, entry.position, entry.watches, entry.weight.toFixed(2), "24", estHours].join(","));
  }
  return lines.join("\n");
}

function buildCaptainCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  fairness: CrewFairnessScoreRow[],
  vessel: string,
  fairnessScore: number | null,
) {
  const lines = [
    `WatchSchedule – Captain's Report – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    "",
    `Schedule Fairness Score: ${fairnessScore ?? "N/A"}%`,
    `Total Assignments: ${assignments.length}`,
    "",
    "Crew Fairness Summary",
    "Name,Position,Total Watches,Fairness Score,Fairness Debt",
  ];
  for (const f of fairness) {
    const crew = crewMap.get(f.crew_member_id);
    lines.push([
      crew?.full_name ?? "Unknown",
      crew?.position ?? "",
      f.total_duties,
      f.crew_fairness_score,
      f.fairness_debt,
    ].join(","));
  }
  return lines.join("\n");
}

function buildStcwCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const lines = [
    `WatchSchedule – Port State / STCW Hours of Rest – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    "",
    "Name,Position,Date,Watch Hours,Rest Hours (Est.),STCW Compliant",
  ];
  for (const a of assignments) {
    const crew = crewMap.get(a.crew_member_id);
    const date = a.assignment_date ?? a.watch_start.slice(0, 10);
    const watchHrs = 24;
    const restHrs = 0;
    const compliant = restHrs >= 10 ? "Yes" : "Review";
    lines.push([
      crew?.full_name ?? "Unknown",
      crew?.position ?? "",
      fmtDate(date),
      watchHrs,
      restHrs,
      compliant,
    ].join(","));
  }
  return lines.join("\n");
}

export default function Reports() {
  const { vessel } = useAuth();
  const vesselId = useVesselId();
  const latestRun = useLatestScheduleRun();
  const assignments = useAssignments(latestRun.data?.id);
  const crewQuery = useCrew();
  const fairnessQuery = useCrewFairnessScores();
  const exportHistory = useExportHistory();

  const [exportType, setExportType] = useState<ExportType>("bridge");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    const run = latestRun.data;
    if (!run?.id) {
      toast("Generate a schedule first from Settings.");
      return;
    }
    const rows = assignments.data;
    if (!rows?.length) {
      toast.error("No schedule assignments found. Try regenerating.");
      return;
    }

    setExporting(true);
    try {
      const crewMap = new Map((crewQuery.data ?? []).map((c) => [c.id, c]));
      const vesselName = vessel?.name ?? "Vessel";
      const label = EXPORT_TYPES.find((t) => t.id === exportType)?.label ?? exportType;
      const filename = `watchschedule_${exportType}_${new Date().toISOString().slice(0, 10)}.csv`;

      let csv = "";
      if (exportType === "bridge") csv = buildBridgeCSV(rows, crewMap, vesselName);
      else if (exportType === "crew") csv = buildCrewCSV(rows, crewMap, vesselName);
      else if (exportType === "payroll") csv = buildPayrollCSV(rows, crewMap, vesselName);
      else if (exportType === "captain") csv = buildCaptainCSV(rows, crewMap, fairnessQuery.data ?? [], vesselName, run.fairness_score ?? null);
      else if (exportType === "port_state") csv = buildStcwCSV(rows, crewMap, vesselName);

      downloadBlob(csv, filename);
      toast.success(`${label} downloaded.`);

      // Log in background — don't block on it
      exportSchedule({ schedule_run_id: run.id, export_type: exportType, vessel_id: vesselId ?? undefined })
        .then(() => exportHistory.refetch())
        .catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const history = exportHistory.data ?? [];

  return (
    <AppShell>
      <div className="mb-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Reports & Exports
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold">Schedule reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export your watch schedule in various formats for the bridge, captain, crew, and regulatory compliance.
        </p>
      </div>

      {/* Export card */}
      <div className="panel mb-5 p-6">
        <div className="mb-4 text-sm font-medium">Generate export</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Report type</label>
            <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={exporting || !latestRun.data?.id || !assignments.data?.length}
            onClick={handleExport}
            className="shrink-0"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Generating…" : "Download CSV"}
          </Button>
        </div>
        {!latestRun.data?.id && (
          <p className="mt-3 text-xs text-muted-foreground">
            No schedule available. Generate one from{" "}
            <a href="/settings" className="text-primary hover:underline">
              Settings
            </a>
            .
          </p>
        )}
      </div>

      {/* Export type descriptions */}
      <div className="panel mb-5 p-5">
        <div className="mb-3 text-sm font-medium">Export types</div>
        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Bridge Schedule",
              desc: "Daily watch assignments formatted for bridge display. Shows assigned watchkeeper per day.",
            },
            {
              title: "Captain's Report",
              desc: "Summary report with fairness scores, debt analysis, and schedule health for management review.",
            },
            {
              title: "Crew Copy",
              desc: "Simplified personal schedule cards for crew members to keep in their cabin.",
            },
            {
              title: "Payroll Hours",
              desc: "Watch hours breakdown for payroll and overtime calculation including weighted holiday duties.",
            },
            {
              title: "Port State / STCW",
              desc: "STCW hours of rest compliance report for Port State Control inspections.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded border border-border bg-background/35 p-3"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">{item.title}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Export history */}
      <div className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-medium">Export history</div>
        </div>
        {history.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No exports yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <div className="text-sm font-medium capitalize">
                    {item.export_type?.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  CSV
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
