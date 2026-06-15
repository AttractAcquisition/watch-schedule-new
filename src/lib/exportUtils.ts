import type { CrewFairnessScoreRow, CrewMemberRow, ScheduleAssignmentRow, ScheduleRunRow } from "./database.types";

// Wrap a value in quotes and escape inner quotes (RFC 4180)
function q(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function row(...values: (string | number | null | undefined)[]): string {
  return values.map(q).join(",");
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function dayName(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", timeZone: "UTC",
  });
}

function assignmentDate(a: ScheduleAssignmentRow) {
  return a.assignment_date ?? a.watch_start.slice(0, 10);
}

export function downloadBlob(content: string, filename: string) {
  // BOM makes Excel open UTF-8 CSVs correctly
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportFilename(type: string) {
  return `watchschedule_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
}

export function buildBridgeCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const lines = [
    row("WatchSchedule - Bridge Schedule", vessel),
    row("Generated", new Date().toLocaleDateString("en-GB")),
    "",
    row("Date", "Day", "Watchkeeper", "Position", "Role"),
  ];
  for (const a of assignments) {
    const c = crewMap.get(a.crew_member_id);
    const d = assignmentDate(a);
    lines.push(row(fmtDate(d), dayName(d), c?.full_name, c?.position, a.watch_role ?? "Watchkeeper"));
  }
  return lines.join("\r\n");
}

export function buildCrewCSV(
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
  const lines = [
    row("WatchSchedule - Crew Copy", vessel),
    row("Generated", new Date().toLocaleDateString("en-GB")),
    "",
  ];
  for (const [id, items] of byMember.entries()) {
    const c = crewMap.get(id);
    lines.push(row(c?.full_name ?? "Unknown", c?.position ?? ""));
    lines.push(row("Date", "Day"));
    for (const a of items) {
      const d = assignmentDate(a);
      lines.push(row(fmtDate(d), dayName(d)));
    }
    lines.push("");
  }
  return lines.join("\r\n");
}

export function buildPayrollCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const totals = new Map<string, { name: string; position: string; watches: number; weight: number }>();
  for (const a of assignments) {
    const c = crewMap.get(a.crew_member_id);
    const entry = totals.get(a.crew_member_id) ?? {
      name: c?.full_name ?? "",
      position: c?.position ?? "",
      watches: 0,
      weight: 0,
    };
    entry.watches++;
    entry.weight += a.duty_weight ?? 1;
    totals.set(a.crew_member_id, entry);
  }
  const first = assignments[0] ? fmtDate(assignmentDate(assignments[0])) : "";
  const last = assignments[assignments.length - 1] ? fmtDate(assignmentDate(assignments[assignments.length - 1])) : "";
  const lines = [
    row("WatchSchedule - Payroll Hours", vessel),
    row("Generated", new Date().toLocaleDateString("en-GB")),
    row("Period", `${first} to ${last}`),
    "",
    row("Name", "Position", "Watch Days", "Weighted Load", "Est. Watch Hours"),
  ];
  for (const e of totals.values()) {
    lines.push(row(e.name, e.position, e.watches, e.weight.toFixed(2), e.watches * 24));
  }
  return lines.join("\r\n");
}

export function buildCaptainCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  fairness: CrewFairnessScoreRow[],
  vessel: string,
  run: ScheduleRunRow,
) {
  const lines = [
    row("WatchSchedule - Captain's Report", vessel),
    row("Generated", new Date().toLocaleDateString("en-GB")),
    "",
    row("Schedule Fairness Score", `${run.fairness_score ?? "N/A"}%`),
    row("Total Assignments", assignments.length),
    "",
    row("Name", "Position", "Total Watches", "Fairness Score", "Fairness Debt"),
  ];
  for (const f of fairness) {
    const c = crewMap.get(f.crew_member_id);
    lines.push(row(c?.full_name, c?.position, f.total_duties, f.crew_fairness_score, f.fairness_debt));
  }
  return lines.join("\r\n");
}

export function buildStcwCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const lines = [
    row("WatchSchedule - Port State / STCW Hours of Rest", vessel),
    row("Generated", new Date().toLocaleDateString("en-GB")),
    "",
    row("Name", "Position", "Date", "Watch Hours", "Rest Hours (Est.)", "STCW Compliant"),
  ];
  for (const a of assignments) {
    const c = crewMap.get(a.crew_member_id);
    lines.push(row(c?.full_name, c?.position, fmtDate(assignmentDate(a)), 24, 0, "Review"));
  }
  return lines.join("\r\n");
}

export type ExportType = "bridge" | "captain" | "crew" | "payroll" | "port_state";

export function buildExportCSV(
  type: ExportType,
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
  run: ScheduleRunRow,
  fairness: CrewFairnessScoreRow[],
) {
  if (type === "bridge")     return buildBridgeCSV(assignments, crewMap, vessel);
  if (type === "crew")       return buildCrewCSV(assignments, crewMap, vessel);
  if (type === "payroll")    return buildPayrollCSV(assignments, crewMap, vessel);
  if (type === "captain")    return buildCaptainCSV(assignments, crewMap, fairness, vessel, run);
  if (type === "port_state") return buildStcwCSV(assignments, crewMap, vessel);
  return buildBridgeCSV(assignments, crewMap, vessel);
}
