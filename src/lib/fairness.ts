import type { CrewMemberRow, ScheduleAssignmentRow } from "./database.types";
import { DEFAULT_DUTY_WEIGHTS } from "./constants";

type DutyType = keyof typeof DEFAULT_DUTY_WEIGHTS;

export interface CrewFairnessMetric {
  crewMemberId: string;
  crewName: string;
  score: number;
  fairnessDebt: number;
  totalWatches: number;
  fridayCount: number;
  weekendCount: number;
  holidayCount: number;
  christmasCount: number;
  consecutiveDutyRisk: number;
  weightedLoad: number;
}

export interface FairnessResult {
  crewScores: CrewFairnessMetric[];
  scheduleFairnessScore: number;
  averageCrewFairnessScore: number;
  highestFairnessDebt: number;
  lowestFairnessScore: number;
  rotationStabilityScore: number;
  mostDueToServe: CrewFairnessMetric | null;
}

function getDutyType(dateIso: string): DutyType {
  const [, month, day] = dateIso.split("-").map(Number);
  if (month === 12 && day === 24) return "christmas_eve";
  if (month === 12 && day === 25) return "christmas_day";
  if (month === 12 && day === 26) return "boxing_day";
  if (month === 12 && day === 31) return "new_years_eve";
  if (month === 1 && day === 1) return "new_years_day";
  const weekday = new Date(`${dateIso}T00:00:00`).getDay();
  if (weekday === 1) return "monday";
  if (weekday === 5) return "friday";
  if (weekday === 6) return "saturday";
  if (weekday === 0) return "sunday";
  return "standard_weekday";
}

function roundScore(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function calculateFairness(
  crew: CrewMemberRow[],
  assignments: ScheduleAssignmentRow[],
  weights = DEFAULT_DUTY_WEIGHTS as Record<string, number>,
): FairnessResult {
  const eligibleCrew = crew.filter((m) => m.status === "active" && m.watch_eligible);
  if (!eligibleCrew.length) {
    return {
      crewScores: [],
      scheduleFairnessScore: 0,
      averageCrewFairnessScore: 0,
      highestFairnessDebt: 0,
      lowestFairnessScore: 0,
      rotationStabilityScore: 0,
      mostDueToServe: null,
    };
  }

  const byCrewId = new Map<string, ScheduleAssignmentRow[]>();
  for (const a of assignments) {
    const list = byCrewId.get(a.crew_member_id) ?? [];
    list.push(a);
    byCrewId.set(a.crew_member_id, list);
  }

  const weightedLoads = new Map(eligibleCrew.map((m) => [m.id, 0]));
  for (const a of assignments) {
    if (!weightedLoads.has(a.crew_member_id)) continue;
    const date = a.assignment_date ?? a.watch_start.slice(0, 10);
    const dt = getDutyType(date);
    const w = weights[dt] ?? 1;
    weightedLoads.set(a.crew_member_id, (weightedLoads.get(a.crew_member_id) ?? 0) + w);
  }

  const totalLoad = [...weightedLoads.values()].reduce((s, v) => s + v, 0);
  const expectedLoad = totalLoad / eligibleCrew.length;

  const crewScores = eligibleCrew.map((member): CrewFairnessMetric => {
    const memberAssignments = byCrewId.get(member.id) ?? [];
    const load = weightedLoads.get(member.id) ?? 0;
    const fairnessDebt = Math.max(0, Math.round((load - expectedLoad) * 100) / 100);

    const fridays = memberAssignments.filter(
      (a) => getDutyType(a.assignment_date ?? a.watch_start.slice(0, 10)) === "friday",
    ).length;
    const weekends = memberAssignments.filter((a) => {
      const dt = getDutyType(a.assignment_date ?? a.watch_start.slice(0, 10));
      return dt === "saturday" || dt === "sunday";
    }).length;
    const holidays = memberAssignments.filter(
      (a) => getDutyType(a.assignment_date ?? a.watch_start.slice(0, 10)) === "public_holiday",
    ).length;
    const christmasNewYear = memberAssignments.filter((a) => {
      const dt = getDutyType(a.assignment_date ?? a.watch_start.slice(0, 10));
      return ["christmas_eve", "christmas_day", "boxing_day", "new_years_eve", "new_years_day"].includes(dt);
    }).length;

    const dates = memberAssignments
      .map((a) => a.assignment_date ?? a.watch_start.slice(0, 10))
      .sort();
    let consecutiveRisk = 0;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + "T00:00:00");
      const curr = new Date(dates[i] + "T00:00:00");
      if (curr.getTime() - prev.getTime() === 86400000) consecutiveRisk++;
    }

    const score =
      assignments.length > 0
        ? roundScore(100 - fairnessDebt * 8 - consecutiveRisk * 5)
        : roundScore(94);

    return {
      crewMemberId: member.id,
      crewName: member.full_name,
      score,
      fairnessDebt,
      totalWatches: memberAssignments.length,
      fridayCount: fridays,
      weekendCount: weekends,
      holidayCount: holidays,
      christmasCount: christmasNewYear,
      consecutiveDutyRisk: consecutiveRisk,
      weightedLoad: Math.round(load * 100) / 100,
    };
  });

  const avg = roundScore(crewScores.reduce((s, m) => s + m.score, 0) / crewScores.length);
  const highestDebt = Math.max(...crewScores.map((m) => m.fairnessDebt), 0);
  const lowestScore = crewScores.length ? Math.min(...crewScores.map((m) => m.score)) : 0;
  const totalConsecutive = crewScores.reduce((s, m) => s + m.consecutiveDutyRisk, 0);
  const rotationStability = roundScore(100 - totalConsecutive * 8);
  const scheduleFairness = roundScore(avg * 0.75 + rotationStability * 0.25 - highestDebt * 2);

  const mostDue =
    [...crewScores].sort((a, b) => {
      if (a.fairnessDebt !== b.fairnessDebt) return a.fairnessDebt - b.fairnessDebt;
      return a.weightedLoad - b.weightedLoad;
    })[0] ?? null;

  return {
    crewScores,
    scheduleFairnessScore: scheduleFairness,
    averageCrewFairnessScore: avg,
    highestFairnessDebt: highestDebt,
    lowestFairnessScore: lowestScore,
    rotationStabilityScore: rotationStability,
    mostDueToServe: mostDue,
  };
}
