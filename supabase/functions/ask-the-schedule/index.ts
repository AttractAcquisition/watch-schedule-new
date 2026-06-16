import { corsResponse, err, json } from "../_shared/cors.ts";
import { adminClient, userClient } from "../_shared/client.ts";

const MODEL = "claude-sonnet-4-6";
const MAX_HISTORY_MESSAGES = 12;

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function cleanMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m): m is ChatMessage =>
      m &&
      typeof m === "object" &&
      ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
      typeof (m as ChatMessage).content === "string" &&
      (m as ChatMessage).content.trim().length > 0
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }));
}

async function resolveVesselId(supabase: ReturnType<typeof adminClient>, userId: string) {
  const { data: owned, error: ownedErr } = await supabase
    .from("vessels")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownedErr) throw ownedErr;
  if (owned?.id) return owned.id as string;

  const { data: membership, error: memberErr } = await supabase
    .from("vessel_members")
    .select("vessel_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberErr) throw memberErr;
  return membership?.vessel_id as string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return err("ANTHROPIC_API_KEY not configured.", 500);

    const body = await req.json();
    const messages = cleanMessages(body?.messages);
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return err("A user message is required.");
    }

    const authClient = userClient(req);
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return err("Unauthorised.", 401);

    const supabase = adminClient();
    const vesselId = await resolveVesselId(supabase, user.id);
    if (!vesselId) return err("No vessel found for user.", 404);

    const { data: vessel, error: vesselErr } = await supabase
      .from("vessels")
      .select("id,name,plan_type,watch_mode,timezone,operation_type")
      .eq("id", vesselId)
      .single();
    if (vesselErr) throw vesselErr;

    const { data: latestRun, error: runErr } = await supabase
      .from("schedule_runs")
      .select("id,start_date,end_date,status,watch_mode,fairness_score,warnings,created_at")
      .eq("vessel_id", vesselId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runErr) throw runErr;

    const scheduleRunId = latestRun?.id;

    const [crewRes, assignmentsRes, fairnessRes, healthRes, explanationsRes] = await Promise.all([
      supabase
        .from("crew_members")
        .select("id,full_name,position,rank,department,status,watch_eligible")
        .eq("vessel_id", vesselId)
        .order("full_name", { ascending: true }),
      scheduleRunId
        ? supabase
            .from("schedule_assignments")
            .select("id,crew_member_id,assignment_date,watch_start,watch_end,duty_weight,duty_type,watch_role,is_manual_override,assignment_reason")
            .eq("schedule_run_id", scheduleRunId)
            .order("assignment_date", { ascending: true })
            .limit(120)
        : Promise.resolve({ data: [], error: null }),
      scheduleRunId
        ? supabase
            .from("crew_fairness_scores")
            .select("crew_member_id,crew_fairness_score,fairness_debt,total_watches,weighted_load,friday_watches,weekend_watches,holiday_watches,christmas_watches,consecutive_duty_risk,leave_impact,calculated_at")
            .eq("schedule_run_id", scheduleRunId)
            .order("fairness_debt", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      scheduleRunId
        ? supabase
            .from("schedule_health_scores")
            .select("coverage_gaps,resource_shortages,excessive_overrides,consecutive_duty_risk,rotation_stability_score,schedule_health_score,calculated_at")
            .eq("schedule_run_id", scheduleRunId)
            .order("calculated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      scheduleRunId
        ? supabase
            .from("schedule_explanations")
            .select("explanation_type,explanation_text,crew_member_id,assignment_id,created_at")
            .eq("schedule_run_id", scheduleRunId)
            .order("created_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [crewRes, assignmentsRes, fairnessRes, healthRes, explanationsRes]) {
      if (result.error) throw result.error;
    }

    const crewById = new Map((crewRes.data ?? []).map((c) => [c.id, c.full_name]));
    const context = {
      vessel,
      latest_run: latestRun,
      crew: crewRes.data,
      assignments: (assignmentsRes.data ?? []).map((a) => ({
        ...a,
        crew_name: crewById.get(a.crew_member_id) ?? null,
      })),
      crew_fairness: (fairnessRes.data ?? []).map((f) => ({
        ...f,
        crew_name: crewById.get(f.crew_member_id) ?? null,
      })),
      schedule_health: healthRes.data,
      explanations: (explanationsRes.data ?? []).map((e) => ({
        ...e,
        crew_name: e.crew_member_id ? crewById.get(e.crew_member_id) ?? null : null,
      })),
    };

    const system = `You help captains and chief officers understand watch-schedule fairness and rota reasoning.
You are read-only: never claim to modify schedules, reassign crew, create leave, or change data.
Answer only from the provided vessel schedule context. If the context is missing, say what is missing.
Be concise, practical, and specific. Mention crew names, scores, dates, warnings, and health metrics when relevant.

Schedule context JSON:
${JSON.stringify(context)}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return err(`Anthropic API error: ${errorBody}`, 500);
    }

    const data = await response.json();
    const reply = data?.content?.find((part: { type?: string }) => part?.type === "text")?.text
      ?? data?.content?.[0]?.text
      ?? "I could not produce an answer from the current schedule context.";

    return json({ reply });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Internal error", 500);
  }
});
