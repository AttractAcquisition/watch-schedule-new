import { supabase } from "./supabase";
import type {
  ProfileRow,
  VesselRow,
  CrewMemberRow,
  ScheduleRunRow,
  ScheduleAssignmentRow,
  LeaveRequestRow,
  CharterPauseRow,
  WatchTemplateRow,
  WatchSettingsRow,
  CrewFairnessScoreRow,
  ScheduleHealthScoreRow,
  ScheduleExplanationRow,
  ManualOverrideRow,
  ExportHistoryRow,
} from "./database.types";
import type { Department } from "./types";

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  if (res.data == null) throw new Error("No data returned.");
  return res.data as NonNullable<T>;
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function updateProfile(userId: string, patch: Partial<Pick<ProfileRow, "full_name">>) {
  return unwrap(
    await supabase.from("profiles").update(patch).eq("id", userId).select().single(),
  );
}

// ── Vessel ───────────────────────────────────────────────────────────────────

export async function getVesselForUser(userId: string): Promise<VesselRow | null> {
  const { data, error } = await supabase
    .from("vessels")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateVessel(vesselId: string, patch: Partial<VesselRow>) {
  return unwrap(
    await supabase.from("vessels").update(patch).eq("id", vesselId).select().single(),
  );
}

export interface OnboardingPayload {
  userId: string;
  vessel: {
    name: string;
    lengthRange?: string;
    lengthMeters?: number;
    operationType?: string;
    timezone?: string;
    watchMode: "solo" | "dual" | "triple";
    planType: string;
  };
  crew: Array<{
    fullName: string;
    position?: string;
    rank?: string;
    department?: Department;
    watchEligible?: boolean;
  }>;
}

export async function completeOnboarding(payload: OnboardingPayload): Promise<VesselRow> {
  const { userId, vessel, crew } = payload;
  const existing = await getVesselForUser(userId);

  const vesselFields = {
    owner_id: userId,
    name: vessel.name,
    length_range: vessel.lengthRange ?? null,
    length_meters: vessel.lengthMeters ?? null,
    operation_type: vessel.operationType ?? null,
    timezone: vessel.timezone ?? "UTC",
    plan_type: vessel.planType,
    watch_mode: vessel.watchMode,
  };

  const vesselRow = existing
    ? unwrap(
        await supabase
          .from("vessels")
          .update(vesselFields)
          .eq("id", existing.id)
          .select()
          .single(),
      )
    : unwrap(await supabase.from("vessels").insert(vesselFields).select().single());

  await supabase
    .from("vessel_members")
    .upsert(
      { vessel_id: vesselRow.id, user_id: userId, role: "captain_admin" },
      { onConflict: "vessel_id,user_id" },
    );

  if (crew.length) {
    await supabase.from("crew_members").delete().eq("vessel_id", vesselRow.id);
    unwrap(
      await supabase
        .from("crew_members")
        .insert(
          crew.map((c) => ({
            vessel_id: vesselRow.id,
            full_name: c.fullName,
            position: c.position ?? null,
            rank: c.rank ?? null,
            department: c.department ?? "unassigned",
            watch_eligible: c.watchEligible ?? true,
            eligible_roles: [],
            status: "active" as const,
            is_rotational: true,
            is_relief: false,
            crew_lifecycle_status: "active" as const,
          })),
        )
        .select(),
    );
  }

  await supabase.from("watch_templates").insert({
    vessel_id: vesselRow.id,
    name: "Default rota",
    watch_mode: vessel.watchMode,
    watch_blocks: [],
    coverage_rules: {},
    rotation_rules: {},
  });

  return unwrap(
    await supabase
      .from("vessels")
      .update({ onboarding_completed: true })
      .eq("id", vesselRow.id)
      .select()
      .single(),
  );
}

// ── Crew ─────────────────────────────────────────────────────────────────────

export async function listCrew(vesselId: string): Promise<CrewMemberRow[]> {
  return unwrap(
    await supabase
      .from("crew_members")
      .select("*")
      .eq("vessel_id", vesselId)
      .neq("crew_lifecycle_status", "archived")
      .order("created_at", { ascending: true }),
  );
}

export async function createCrew(
  vesselId: string,
  input: Omit<Partial<CrewMemberRow>, "id" | "vessel_id" | "created_at" | "updated_at"> & {
    full_name: string;
  },
) {
  return unwrap(
    await supabase
      .from("crew_members")
      .insert({ ...input, vessel_id: vesselId })
      .select()
      .single(),
  );
}

export function addCrewMember(input: {
  vessel_id: string;
  full_name: string;
  position?: string | null;
  rank?: string | null;
  department?: Department;
  watch_eligible?: boolean;
  status?: string;
}) {
  return createCrew(input.vessel_id, {
    full_name: input.full_name,
    position: input.position ?? null,
    rank: input.rank ?? null,
    department: input.department ?? "unassigned",
    watch_eligible: input.watch_eligible ?? true,
    status: (input.status ?? "active") as CrewMemberRow["status"],
    eligible_roles: [],
    is_rotational: true,
    is_relief: false,
    crew_lifecycle_status: "active",
  });
}

export async function updateCrew(id: string, patch: Partial<CrewMemberRow>) {
  return unwrap(
    await supabase.from("crew_members").update(patch).eq("id", id).select().single(),
  );
}

export function updateCrewMember(id: string, patch: Partial<CrewMemberRow>) {
  return updateCrew(id, patch);
}

export async function archiveCrew(id: string) {
  return updateCrew(id, {
    crew_lifecycle_status: "archived",
    status: "unavailable",
    watch_eligible: false,
  });
}

export function archiveCrewMember(id: string) {
  return archiveCrew(id);
}

export async function deleteCrewMember(id: string) {
  const { error } = await supabase.from("crew_members").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export async function getLatestScheduleRun(vesselId: string): Promise<ScheduleRunRow | null> {
  const { data, error } = await supabase
    .from("schedule_runs")
    .select("*")
    .eq("vessel_id", vesselId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listAssignments(scheduleRunId: string): Promise<ScheduleAssignmentRow[]> {
  return unwrap(
    await supabase
      .from("schedule_assignments")
      .select("*")
      .eq("schedule_run_id", scheduleRunId)
      .order("watch_start", { ascending: true }),
  );
}

export async function confirmScheduleRun(runId: string, userId: string) {
  return unwrap(
    await supabase
      .from("schedule_runs")
      .update({ status: "confirmed", confirmed_by: userId, confirmed_at: new Date().toISOString() })
      .eq("id", runId)
      .select()
      .single(),
  );
}

export async function manualOverrideAssignment(
  vesselId: string,
  scheduleRunId: string,
  assignmentId: string,
  oldCrewMemberId: string,
  newCrewMemberId: string,
  changedBy: string,
  reason?: string,
) {
  await supabase
    .from("schedule_assignments")
    .update({ crew_member_id: newCrewMemberId, is_manual_override: true })
    .eq("id", assignmentId);
  await supabase.from("manual_overrides").insert({
    vessel_id: vesselId,
    schedule_run_id: scheduleRunId,
    assignment_id: assignmentId,
    old_crew_member_id: oldCrewMemberId,
    new_crew_member_id: newCrewMemberId,
    changed_by: changedBy,
    reason: reason ?? null,
    fairness_impact_before: {},
    fairness_impact_after: {},
  });
}

// ── Watch Templates & Settings ────────────────────────────────────────────────

export async function listWatchTemplates(vesselId: string): Promise<WatchTemplateRow[]> {
  return unwrap(
    await supabase
      .from("watch_templates")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("created_at", { ascending: false }),
  );
}

export async function getWatchSettings(vesselId: string): Promise<WatchSettingsRow | null> {
  const { data, error } = await supabase
    .from("watch_settings")
    .select("*")
    .eq("vessel_id", vesselId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertWatchSettings(
  vesselId: string,
  patch: Partial<Omit<WatchSettingsRow, "id" | "vessel_id" | "created_at" | "updated_at">>,
) {
  return unwrap(
    await supabase
      .from("watch_settings")
      .upsert({ ...patch, vessel_id: vesselId }, { onConflict: "vessel_id" })
      .select()
      .single(),
  );
}

export async function updateWatchSettings(
  id: string,
  patch: Partial<Omit<WatchSettingsRow, "id" | "created_at" | "updated_at">>,
) {
  return unwrap(
    await supabase.from("watch_settings").update(patch).eq("id", id).select().single(),
  );
}

// ── Leave Requests ────────────────────────────────────────────────────────────

export async function listLeaveRequests(vesselId: string): Promise<LeaveRequestRow[]> {
  return unwrap(
    await supabase
      .from("leave_requests")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("start_date", { ascending: false }),
  );
}

export async function createLeaveRequest(input: {
  vessel_id: string;
  crew_member_id: string;
  start_date: string;
  end_date: string;
  leave_type: LeaveRequestRow["leave_type"];
  status?: LeaveRequestRow["status"];
  notes?: string | null;
}) {
  return unwrap(
    await supabase
      .from("leave_requests")
      .insert({
        vessel_id: input.vessel_id,
        crew_member_id: input.crew_member_id,
        start_date: input.start_date,
        end_date: input.end_date,
        leave_type: input.leave_type,
        status: input.status ?? "requested",
        impact_score: 0,
        forecast_result: {},
        notes: input.notes ?? null,
      })
      .select()
      .single(),
  );
}

export async function updateLeaveRequest(id: string, patch: Partial<LeaveRequestRow>) {
  return unwrap(
    await supabase.from("leave_requests").update(patch).eq("id", id).select().single(),
  );
}

export async function deleteLeaveRequest(id: string) {
  const { error } = await supabase.from("leave_requests").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Charter Pauses ────────────────────────────────────────────────────────────

export async function listCharterPauses(vesselId: string): Promise<CharterPauseRow[]> {
  return unwrap(
    await supabase
      .from("charter_pauses")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("start_date", { ascending: false }),
  );
}

// ── Fairness & Intelligence ───────────────────────────────────────────────────

export async function listCrewFairnessScores(vesselId: string): Promise<CrewFairnessScoreRow[]> {
  return unwrap(
    await supabase
      .from("crew_fairness_scores")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("calculated_at", { ascending: false }),
  );
}

export async function getLatestScheduleHealth(
  vesselId: string,
): Promise<ScheduleHealthScoreRow | null> {
  const { data, error } = await supabase
    .from("schedule_health_scores")
    .select("*")
    .eq("vessel_id", vesselId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listScheduleExplanations(
  vesselId: string,
): Promise<ScheduleExplanationRow[]> {
  return unwrap(
    await supabase
      .from("schedule_explanations")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("created_at", { ascending: false })
      .limit(20),
  );
}

export async function listManualOverrides(vesselId: string): Promise<ManualOverrideRow[]> {
  return unwrap(
    await supabase
      .from("manual_overrides")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("created_at", { ascending: false })
      .limit(20),
  );
}

// ── Exports ───────────────────────────────────────────────────────────────────

export async function listExports(vesselId: string): Promise<ExportHistoryRow[]> {
  return unwrap(
    await supabase
      .from("export_history")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("created_at", { ascending: false }),
  );
}
