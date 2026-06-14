import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/client.ts";
import { generateSchedule } from "../_shared/scheduler.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { vessel_id, schedule_run_id } = await req.json();
    if (!vessel_id) return err("vessel_id is required.");

    const supabase = adminClient();

    // Load crew
    const { data: crew, error: crewErr } = await supabase
      .from("crew_members")
      .select("*")
      .eq("vessel_id", vessel_id);
    if (crewErr) return err(crewErr.message);

    // Load assignments
    let assignQuery = supabase
      .from("schedule_assignments")
      .select("*")
      .eq("vessel_id", vessel_id);
    if (schedule_run_id) assignQuery = assignQuery.eq("schedule_run_id", schedule_run_id);

    const { data: assignments, error: aErr } = await assignQuery;
    if (aErr) return err(aErr.message);

    // Compute fairness from existing assignments
    const loads: Record<string, number> = {};
    const totals: Record<string, number> = {};
    for (const m of (crew ?? []).filter((c) => c.watch_eligible)) {
      loads[m.id] = 0;
      totals[m.id] = 0;
    }
    for (const a of assignments ?? []) {
      if (loads[a.crew_member_id] !== undefined) {
        loads[a.crew_member_id]++;
        totals[a.crew_member_id]++;
      }
    }

    const loadValues = Object.values(loads);
    const avg = loadValues.reduce((s, v) => s + v, 0) / (loadValues.length || 1);
    const variance = loadValues.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (loadValues.length || 1);
    const fairness_score = Math.max(0, Math.min(100, Math.round(100 - variance * 5)));

    return json({ fairness_score, crew_loads: loads });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
