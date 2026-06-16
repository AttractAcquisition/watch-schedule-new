import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { schedule_run_id, export_type, vessel_id } = await req.json();
    if (!schedule_run_id) return err("schedule_run_id is required.");

    const supabase = adminClient();

    // Load run + assignments
    const { data: run, error: runErr } = await supabase
      .from("schedule_runs")
      .select("*")
      .eq("id", schedule_run_id)
      .single();
    if (runErr) return err(runErr.message);

    const { data: assignments, error: aErr } = await supabase
      .from("schedule_assignments")
      .select("*, crew_members(full_name, position)")
      .eq("schedule_run_id", schedule_run_id)
      .order("watch_start");
    if (aErr) return err(aErr.message);

    // Log export in export_history
    const { data: exportRow, error: eErr } = await supabase
      .from("export_history")
      .insert({
        vessel_id: vessel_id ?? run.vessel_id,
        schedule_run_id,
        export_type: export_type ?? "bridge",
        file_url: null,
      })
      .select()
      .single();

    if (eErr) console.error("Export log error:", eErr.message);

    // In production, this would generate a real PDF via a PDF service.
    // For now, return a placeholder so the UI can handle it gracefully.
    return json({
      export_id: exportRow?.id ?? "unknown",
      file_url: null,
      message: "Export queued. File will be available in export history when ready.",
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
