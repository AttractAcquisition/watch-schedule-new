import type { CrewFairnessScoreRow, CrewMemberRow, ScheduleAssignmentRow, ScheduleRunRow } from "./database.types";

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
  const rows = [
    `WatchSchedule – Bridge Schedule – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    "",
    "Date,Day,Watchkeeper,Position,Role",
  ];
  for (const a of assignments) {
    const c = crewMap.get(a.crew_member_id);
    const d = assignmentDate(a);
    rows.push([fmtDate(d), dayName(d), c?.full_name ?? "", c?.position ?? "", a.watch_role ?? "Watchkeeper"].join(","));
  }
  return rows.join("\n");
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
  const rows = [`WatchSchedule – Crew Copy – ${vessel}`, `Generated: ${new Date().toLocaleDateString("en-GB")}`, ""];
  for (const [id, items] of byMember.entries()) {
    const c = crewMap.get(id);
    rows.push(`${c?.full_name ?? "Unknown"} – ${c?.position ?? ""}`, "Date,Day");
    for (const a of items) {
      const d = assignmentDate(a);
      rows.push(`${fmtDate(d)},${dayName(d)}`);
    }
    rows.push("");
  }
  return rows.join("\n");
}

export function buildPayrollCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const totals = new Map<string, { name: string; position: string; watches: number; weight: number }>();
  for (const a of assignments) {
    const c = crewMap.get(a.crew_member_id);
    const entry = totals.get(a.crew_member_id) ?? { name: c?.full_name ?? "", position: c?.position ?? "", watches: 0, weight: 0 };
    entry.watches++;
    entry.weight += a.duty_weight ?? 1;
    totals.set(a.crew_member_id, entry);
  }
  const first = assignments[0] ? fmtDate(assignmentDate(assignments[0])) : "";
  const last = assignments[assignments.length - 1] ? fmtDate(assignmentDate(assignments[assignments.length - 1])) : "";
  const rows = [
    `WatchSchedule – Payroll Hours – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    `Period: ${first} – ${last}`,
    "",
    "Name,Position,Watch Days,Weighted Load,Est. Watch Hours",
  ];
  for (const e of totals.values()) {
    rows.push([e.name, e.position, e.watches, e.weight.toFixed(2), e.watches * 24].join(","));
  }
  return rows.join("\n");
}

export function buildCaptainCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  fairness: CrewFairnessScoreRow[],
  vessel: string,
  run: ScheduleRunRow,
) {
  const rows = [
    `WatchSchedule – Captain's Report – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    "",
    `Schedule Fairness Score: ${run.fairness_score ?? "N/A"}%`,
    `Total Assignments: ${assignments.length}`,
    "",
    "Crew Fairness Summary",
    "Name,Position,Total Watches,Fairness Score,Fairness Debt",
  ];
  for (const f of fairness) {
    const c = crewMap.get(f.crew_member_id);
    rows.push([c?.full_name ?? "", c?.position ?? "", f.total_duties, f.crew_fairness_score, f.fairness_debt].join(","));
  }
  return rows.join("\n");
}

export function buildStcwCSV(
  assignments: ScheduleAssignmentRow[],
  crewMap: Map<string, CrewMemberRow>,
  vessel: string,
) {
  const rows = [
    `WatchSchedule – Port State / STCW Hours of Rest – ${vessel}`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    "",
    "Name,Position,Date,Watch Hours,Rest Hours (Est.),STCW Compliant",
  ];
  for (const a of assignments) {
    const c = crewMap.get(a.crew_member_id);
    const d = assignmentDate(a);
    rows.push([c?.full_name ?? "", c?.position ?? "", fmtDate(d), 24, 0, "Review"].join(","));
  }
  return rows.join("\n");
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
