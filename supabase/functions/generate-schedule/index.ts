import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/client.ts";
import { generateSchedule } from "../_shared/scheduler.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const body = await req.json();
    const { vessel_id, start_date, end_date, crew_ids, replace_existing } = body;

    if (!vessel_id || !start_date || !end_date) {
      return err("vessel_id, start_date, end_date are required.");
    }

    const supabase = adminClient();

    // Load crew
    let crewQuery = supabase.from("crew_members").select("*").eq("vessel_id", vessel_id);
    if (crew_ids?.length) {
      crewQuery = crewQuery.in("id", crew_ids);
    }
    const { data: crew, error: crewErr } = await crewQuery;
    if (crewErr) return err(crewErr.message);

    // Load approved/requested leave
    const { data: leaves, error: leaveErr } = await supabase
      .from("leave_requests")
      .select("crew_member_id, start_date, end_date, status")
      .eq("vessel_id", vessel_id)
      .in("status", ["requested", "approved"]);
    if (leaveErr) return err(leaveErr.message);

    // Load watch settings
    const { data: settings } = await supabase
      .from("watch_settings")
      .select("*")
      .eq("vessel_id", vessel_id)
      .maybeSingle();

    const dutyWeights = (settings?.duty_weights as Record<string, number>) ?? undefined;
    const avoidConsecutive = settings?.avoid_consecutive ?? true;

    // Load existing fairness for continuity
    const { data: existingFairness } = await supabase
      .from("crew_fairness_scores")
      .select("*")
      .eq("vessel_id", vessel_id);

    const fairnessMap: Record<string, {
      weighted_load: number;
      total_watches: number;
      friday_watches: number;
      weekend_watches: number;
      holiday_watches: number;
      christmas_watches: number;
    }> = {};
    for (const row of existingFairness ?? []) {
      fairnessMap[row.crew_member_id] = {
        weighted_load: row.weighted_load,
        total_watches: row.total_watches,
        friday_watches: row.friday_watches,
        weekend_watches: row.weekend_watches,
        holiday_watches: row.holiday_watches,
        christmas_watches: row.christmas_watches,
      };
    }

    const result = generateSchedule(
      crew ?? [],
      start_date,
      end_date,
      leaves ?? [],
      dutyWeights,
      avoidConsecutive,
      fairnessMap,
    );

    // Archive old schedule if replacing
    if (replace_existing) {
      await supabase
        .from("schedule_runs")
        .update({ status: "archived" })
        .eq("vessel_id", vessel_id)
        .neq("status", "archived");
    }

    // Create schedule run
    const { data: run, error: runErr } = await supabase
      .from("schedule_runs")
      .insert({
        vessel_id,
        start_date,
        end_date,
        status: "draft",
        watch_mode: "solo",
        fairness_score: result.fairness_score,
        warnings: result.warnings,
      })
      .select()
      .single();
    if (runErr) return err(runErr.message);

    // Insert assignments
    if (result.assignments.length) {
      const rows = result.assignments.map((a) => ({
        ...a,
        schedule_run_id: run.id,
        vessel_id,
      }));
      const { error: aErr } = await supabase.from("schedule_assignments").insert(rows);
      if (aErr) return err(aErr.message);
    }

    // Upsert fairness scores
    const fairnessRows = result.crew_fairness.map((f) => ({
      vessel_id,
      schedule_run_id: run.id,
      crew_member_id: f.crew_member_id,
      total_watches: f.total_watches,
      weighted_load: f.weighted_load,
      friday_watches: f.friday_watches,
      weekend_watches: f.weekend_watches,
      holiday_watches: f.holiday_watches,
      christmas_watches: f.christmas_watches,
      fairness_debt: 0,
      crew_fairness_score: result.fairness_score,
    }));
    await supabase.from("crew_fairness_scores").insert(fairnessRows);

    // Insert health score
    const coverageGaps = result.warnings.filter((w) => w.startsWith("No crew available")).length;
    const resourceShortages = result.warnings.filter((w) => w.startsWith("No eligible crew")).length;
    const { error: healthErr } = await supabase.from("schedule_health_scores").insert({
      vessel_id,
      schedule_run_id: run.id,
      coverage_gaps: coverageGaps,
      resource_shortages: resourceShortages,
      excessive_overrides: 0,
      consecutive_duty_risk: 0,
      schedule_health_score: result.fairness_score,
      rotation_stability_score: Math.min(100, result.fairness_score + 5),
    });
    if (healthErr) return err(healthErr.message);

    // Insert warnings as explanations
    if (result.warnings.length) {
      await supabase.from("schedule_explanations").insert(
        result.warnings.map((w) => ({
          vessel_id,
          schedule_run_id: run.id,
          explanation_type: "warning",
          explanation_text: w,
        })),
      );
    }

    return json({
      schedule_run_id: run.id,
      assignments: result.assignments,
      fairness_score: result.fairness_score,
      warnings: result.warnings,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
