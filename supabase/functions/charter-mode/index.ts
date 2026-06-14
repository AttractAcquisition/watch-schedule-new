import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const body = await req.json();
    const { action, vessel_id } = body;

    if (!vessel_id) return err("vessel_id is required.");

    const supabase = adminClient();

    if (action === "activate") {
      const { start_date, end_date, pause_all_watches, resume_mode } = body;
      if (!start_date || !end_date) return err("start_date and end_date are required.");

      // Mark any active charter as completed first
      await supabase
        .from("charter_pauses")
        .update({ status: "completed" })
        .eq("vessel_id", vessel_id)
        .eq("status", "active");

      const { data, error } = await supabase
        .from("charter_pauses")
        .insert({
          vessel_id,
          schedule_run_id: body.schedule_run_id ?? null,
          start_date,
          end_date,
          status: "active",
          resume_mode: resume_mode ?? "manual",
          pause_all_watches: pause_all_watches ?? true,
        })
        .select()
        .single();

      if (error) return err(error.message);
      return json({ charter_pause_id: data.id, message: "Charter Mode activated." });
    }

    if (action === "resume") {
      const { error } = await supabase
        .from("charter_pauses")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("vessel_id", vessel_id)
        .eq("status", "active");

      if (error) return err(error.message);
      return json({ message: "Normal rotation resumed." });
    }

    return err(`Unknown action: ${action}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
