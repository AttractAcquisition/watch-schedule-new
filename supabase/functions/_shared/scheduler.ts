// Fairness-based daily watch scheduler
// Assigns one watchkeeper per day (solo mode) using weighted duty scores.
// Weights: weekday 1, Mon/Fri 1.25, Sat/Sun 1.5, holiday 1.5, Christmas/NY 2.5

export interface CrewMember {
  id: string;
  full_name: string;
  watch_eligible: boolean;
  status: string;
}

export interface LeaveRequest {
  crew_member_id: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface Assignment {
  crew_member_id: string;
  assignment_date: string;
  watch_start: string;
  watch_end: string;
  role: string;
  watch_type: string;
}

export interface FairnessSummary {
  crew_member_id: string;
  full_name: string;
  total_watches: number;
  weighted_load: number;
  friday_watches: number;
  weekend_watches: number;
  holiday_watches: number;
  christmas_watches: number;
}

export interface ScheduleResult {
  assignments: Assignment[];
  fairness_score: number;
  crew_fairness: FairnessSummary[];
  warnings: string[];
}

const WEIGHTS: Record<string, number> = {
  weekday: 1,
  monday: 1.25,
  friday: 1.25,
  saturday: 1.5,
  sunday: 1.5,
  holiday: 1.5,
  christmas_eve: 2,
  christmas_day: 2.5,
  boxing_day: 2,
  new_years_eve: 2.5,
  new_years_day: 2,
};

const UK_HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25",
  "2026-08-31", "2026-12-25", "2026-12-26",
]);

function getDayKind(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if ((month === 12 && day === 25) || (month === 12 && day === 26)) return "christmas_day";
  if (month === 12 && day === 24) return "christmas_eve";
  if ((month === 12 && day === 31) || (month === 1 && day === 1 && date.getFullYear() > 2025)) return "new_years_eve";
  if (month === 1 && day === 1) return "new_years_day";
  if (UK_HOLIDAYS_2026.has(iso)) return "holiday";
  const dow = date.getDay();
  if (dow === 6) return "saturday";
  if (dow === 0) return "sunday";
  if (dow === 1) return "monday";
  if (dow === 5) return "friday";
  return "weekday";
}

function getWeight(date: Date, overrides?: Record<string, number>): number {
  const kind = getDayKind(date);
  if (overrides?.[kind] != null) return overrides[kind];
  return WEIGHTS[kind] ?? 1;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachDay(startDate: string, endDate: string): Date[] {
  const days: Date[] = [];
  const cur = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function isOnLeave(crewId: string, date: string, leaves: LeaveRequest[]): boolean {
  return leaves.some(
    (l) =>
      l.crew_member_id === crewId &&
      ["requested", "approved"].includes(l.status) &&
      l.start_date <= date &&
      l.end_date >= date,
  );
}

export function generateSchedule(
  crew: CrewMember[],
  startDate: string,
  endDate: string,
  leaves: LeaveRequest[],
  dutyWeightOverrides?: Record<string, number>,
  avoidConsecutive = true,
  existingFairness?: Record<string, FairnessSummary>,
): ScheduleResult {
  const eligible = crew.filter(
    (m) => m.watch_eligible && ["active", "on_leave"].includes(m.status),
  );

  if (eligible.length === 0) {
    return { assignments: [], fairness_score: 0, crew_fairness: [], warnings: ["No eligible crew to schedule."] };
  }

  const days = eachDay(startDate, endDate);
  const loads: Record<string, number> = {};
  const totals: Record<string, number> = {};
  const fridays: Record<string, number> = {};
  const weekends: Record<string, number> = {};
  const holidays: Record<string, number> = {};
  const christmas: Record<string, number> = {};
  const lastServed: Record<string, string | null> = {};
  const assignments: Assignment[] = [];
  const warnings: string[] = [];

  for (const m of eligible) {
    loads[m.id] = existingFairness?.[m.id]?.weighted_load ?? 0;
    totals[m.id] = existingFairness?.[m.id]?.total_watches ?? 0;
    fridays[m.id] = existingFairness?.[m.id]?.friday_watches ?? 0;
    weekends[m.id] = existingFairness?.[m.id]?.weekend_watches ?? 0;
    holidays[m.id] = existingFairness?.[m.id]?.holiday_watches ?? 0;
    christmas[m.id] = existingFairness?.[m.id]?.christmas_watches ?? 0;
    lastServed[m.id] = null;
  }

  for (const day of days) {
    const iso = isoDate(day);
    const weight = getWeight(day, dutyWeightOverrides);
    const kind = getDayKind(day);

    const available = eligible.filter((m) => !isOnLeave(m.id, iso, leaves));

    if (available.length === 0) {
      warnings.push(`No crew available on ${iso}.`);
      continue;
    }

    available.sort((a, b) => {
      // Avoid consecutive if enabled
      if (avoidConsecutive) {
        const aConsec = lastServed[a.id] === isoDate(new Date(day.getTime() - 86400000));
        const bConsec = lastServed[b.id] === isoDate(new Date(day.getTime() - 86400000));
        if (aConsec !== bConsec) return aConsec ? 1 : -1;
      }
      // Lowest weighted load first
      const diff = loads[a.id] - loads[b.id];
      if (Math.abs(diff) > 0.01) return diff;
      // Alphabetical as tiebreaker
      return a.full_name.localeCompare(b.full_name);
    });

    const picked = available[0];
    loads[picked.id] += weight;
    totals[picked.id]++;
    lastServed[picked.id] = iso;

    if (kind === "friday") fridays[picked.id]++;
    if (kind === "saturday" || kind === "sunday") weekends[picked.id]++;
    if (kind === "holiday") holidays[picked.id]++;
    if (kind.startsWith("christmas") || kind.startsWith("new_years")) christmas[picked.id]++;

    assignments.push({
      crew_member_id: picked.id,
      assignment_date: iso,
      watch_start: `${iso}T00:00:00Z`,
      watch_end: `${iso}T23:59:59Z`,
      role: "watchkeeper",
      watch_type: "deck",
    });
  }

  // Fairness score: lower variance = higher score
  const loadValues = eligible.map((m) => loads[m.id]);
  const avg = loadValues.reduce((s, v) => s + v, 0) / (loadValues.length || 1);
  const variance = loadValues.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (loadValues.length || 1);
  const fairness_score = Math.max(0, Math.min(100, Math.round(100 - variance * 5)));

  const expectedPerCrew = assignments.length / (eligible.length || 1);
  const crew_fairness: FairnessSummary[] = eligible.map((m) => ({
    crew_member_id: m.id,
    full_name: m.full_name,
    total_watches: totals[m.id],
    weighted_load: Math.round(loads[m.id] * 100) / 100,
    friday_watches: fridays[m.id],
    weekend_watches: weekends[m.id],
    holiday_watches: holidays[m.id],
    christmas_watches: christmas[m.id],
  }));

  return { assignments, fairness_score, crew_fairness, warnings };
}
