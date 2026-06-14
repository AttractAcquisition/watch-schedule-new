import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { crew_member_id, start_date, end_date, vessel_id } = await req.json();
    if (!crew_member_id || !start_date || !end_date) {
      return err("crew_member_id, start_date, end_date are required.");
    }

    const supabase = adminClient();
    const warnings: string[] = [];
    let impact_score = 0;

    // Count days of leave
    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

    // Count existing approved leave overlaps for the same crew member
    if (vessel_id) {
      const { data: existing } = await supabase
        .from("leave_requests")
        .select("crew_member_id")
        .eq("vessel_id", vessel_id)
        .in("status", ["requested", "approved"])
        .lte("start_date", end_date)
        .gte("end_date", start_date)
        .neq("crew_member_id", crew_member_id);

      // Count how many crew are already on leave during this period
      const overlappingCrew = new Set(existing?.map((r) => r.crew_member_id) ?? []).size;
      if (overlappingCrew >= 2) {
        warnings.push(`${overlappingCrew} other crew members are also on leave during this period.`);
        impact_score += overlappingCrew * 10;
      }
    }

    if (days > 14) {
      warnings.push(`Long leave of ${days} days may impact watch rotation balance.`);
      impact_score += 20;
    }

    const weekendCount = Array.from({ length: days }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d.getDay();
    }).filter((dow) => dow === 0 || dow === 6).length;

    if (weekendCount > 2) {
      warnings.push(`Leave covers ${weekendCount} weekend days — fairness debt will increase.`);
      impact_score += weekendCount * 5;
    }

    const summary = warnings.length
      ? warnings.join(" ")
      : `${days}-day leave period — low schedule impact.`;

    return json({ impact_score, warnings, summary });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
