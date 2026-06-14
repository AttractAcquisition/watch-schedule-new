import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/client.ts";
import { generateSchedule } from "../_shared/scheduler.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { schedule_run_id, mode } = await req.json();
    if (!schedule_run_id) return err("schedule_run_id is required.");

    const supabase = adminClient();

    // Load original run
    const { data: run, error: runErr } = await supabase
      .from("schedule_runs")
      .select("*")
      .eq("id", schedule_run_id)
      .single();
    if (runErr) return err(runErr.message);

    // Load crew, leaves, settings — then re-run the scheduler
    const { data: crew } = await supabase
      .from("crew_members")
      .select("*")
      .eq("vessel_id", run.vessel_id);

    const { data: leaves } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("vessel_id", run.vessel_id)
      .in("status", ["requested", "approved"]);

    const { data: settings } = await supabase
      .from("watch_settings")
      .select("*")
      .eq("vessel_id", run.vessel_id)
      .maybeSingle();

    const result = generateSchedule(
      crew ?? [],
      run.start_date,
      run.end_date,
      leaves ?? [],
      (settings?.duty_weights as Record<string, number>) ?? undefined,
      settings?.avoid_consecutive ?? true,
    );

    // Archive old, create new
    await supabase
      .from("schedule_runs")
      .update({ status: "archived" })
      .eq("id", schedule_run_id);

    const { data: newRun, error: newErr } = await supabase
      .from("schedule_runs")
      .insert({
        vessel_id: run.vessel_id,
        template_id: run.template_id,
        start_date: run.start_date,
        end_date: run.end_date,
        status: "draft",
        watch_mode: run.watch_mode,
        fairness_score: result.fairness_score,
        warnings: result.warnings,
      })
      .select()
      .single();
    if (newErr) return err(newErr.message);

    if (result.assignments.length) {
      await supabase.from("schedule_assignments").insert(
        result.assignments.map((a) => ({
          ...a,
          schedule_run_id: newRun.id,
          vessel_id: run.vessel_id,
        })),
      );
    }

    return json({
      schedule_run_id: newRun.id,
      fairness_score: result.fairness_score,
      warnings: result.warnings,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
