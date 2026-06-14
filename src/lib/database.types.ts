export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_type: "solo_watch" | "dual_watch" | "triple_watch" | null;
  status: "inactive" | "trialing" | "active" | "past_due" | "cancelled";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface VesselRow {
  id: string;
  owner_id: string;
  name: string;
  length_range: string | null;
  length_meters: number | null;
  operation_type: string | null;
  timezone: string;
  plan_type: string | null;
  watch_mode: "solo" | "dual" | "triple";
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface VesselMemberRow {
  id: string;
  vessel_id: string;
  user_id: string;
  role: "captain_admin" | "officer" | "department_head" | "crew_member" | "viewer";
  created_at: string;
}

export interface CrewMemberRow {
  id: string;
  vessel_id: string;
  full_name: string;
  position: string | null;
  rank: string | null;
  department: "command" | "deck" | "interior" | "engineering" | "unassigned";
  watch_eligible: boolean;
  eligible_roles: string[];
  status: "active" | "on_leave" | "sick" | "off_vessel" | "training" | "unavailable";
  is_rotational: boolean;
  is_relief: boolean;
  crew_lifecycle_status: "active" | "joiner" | "leaver" | "archived";
  notes: string | null;
  last_scheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchTemplateRow {
  id: string;
  vessel_id: string;
  name: string | null;
  watch_mode: "solo" | "dual" | "triple" | null;
  watch_blocks: Json;
  coverage_rules: Json;
  rotation_rules: Json;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRunRow {
  id: string;
  vessel_id: string;
  watch_template_id: string | null;
  start_date: string;
  end_date: string;
  status: "draft" | "confirmed" | "paused" | "archived";
  version: number;
  published_at: string | null;
  published_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
  approval_status: "draft" | "captain_approved" | "oow_approved" | "published" | "locked";
  fairness_score: number | null;
  fairness_summary: Json;
  warnings: Json;
  generated_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleAssignmentRow {
  id: string;
  schedule_run_id: string;
  vessel_id: string;
  crew_member_id: string;
  department: string | null;
  watch_role: string | null;
  watch_start: string;
  watch_end: string;
  assignment_date: string | null;
  duty_weight: number;
  duty_type: string;
  assignment_reason: string | null;
  is_manual_override: boolean;
  created_at: string;
}

export interface LeaveRequestRow {
  id: string;
  vessel_id: string;
  crew_member_id: string;
  start_date: string;
  end_date: string;
  leave_type: "leave" | "sick" | "training" | "off_vessel" | "unavailable";
  status: "requested" | "approved" | "rejected" | "cancelled";
  impact_score: number;
  forecast_result: Json;
  notes: string | null;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharterPauseRow {
  id: string;
  vessel_id: string;
  schedule_run_id: string | null;
  start_date: string;
  end_date: string;
  pause_all_watches: boolean;
  keep_engineering_watch_active: boolean;
  keep_security_watch_active: boolean;
  resume_mode: "automatic" | "manual";
  resume_next_crew_member_id: string | null;
  status: "draft" | "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface WatchSettingsRow {
  id: string;
  vessel_id: string;
  schedule_type: "daily_watch";
  weekend_mode: "standard" | "heavy" | "friday_sunday" | "saturday_sunday" | "custom";
  duty_weights: Json;
  rotation_rules: Json;
  charter_rules: Json;
  fairness_rules: Json;
  publishing_rules: Json;
  intelligence_rules: Json;
  created_at: string;
  updated_at: string;
}

export interface CrewFairnessScoreRow {
  id: string;
  vessel_id: string;
  crew_member_id: string;
  schedule_run_id: string | null;
  crew_fairness_score: number;
  fairness_debt: number;
  historical_fairness_score: number | null;
  total_duties: number;
  friday_duties: number;
  weekend_duties: number;
  public_holiday_duties: number;
  christmas_new_year_duties: number;
  consecutive_duty_risk: number;
  leave_impact: number;
  most_due_rank: Json;
  calculated_at: string;
}

export interface ManualOverrideRow {
  id: string;
  vessel_id: string;
  schedule_run_id: string | null;
  assignment_id: string | null;
  changed_by: string | null;
  old_crew_member_id: string | null;
  new_crew_member_id: string | null;
  reason: string | null;
  fairness_impact_before: Json;
  fairness_impact_after: Json;
  created_at: string;
}

export interface ScheduleExplanationRow {
  id: string;
  vessel_id: string;
  schedule_run_id: string | null;
  crew_member_id: string | null;
  assignment_id: string | null;
  explanation_type: string;
  explanation_text: string;
  input_snapshot: Json;
  created_at: string;
}

export interface ScheduleHealthScoreRow {
  id: string;
  vessel_id: string;
  schedule_run_id: string | null;
  coverage_gaps: number;
  resource_shortages: number;
  excessive_overrides: number;
  consecutive_duty_risk: number;
  rotation_stability_score: number;
  schedule_health_score: number;
  calculated_at: string;
}

export interface ExportHistoryRow {
  id: string;
  vessel_id: string;
  schedule_run_id: string;
  export_type: "bridge" | "crew_mess" | "department" | "compliance_support";
  version: number;
  generated_by: string | null;
  status: string;
  file_url: string | null;
  file_name: string | null;
  generated_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  vessel_id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Json;
  new_value: Json;
  reason: string | null;
  created_at: string;
}

type TableShape<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow>;
      subscriptions: TableShape<SubscriptionRow>;
      vessels: TableShape<VesselRow>;
      vessel_members: TableShape<VesselMemberRow>;
      crew_members: TableShape<CrewMemberRow>;
      watch_templates: TableShape<WatchTemplateRow>;
      schedule_runs: TableShape<ScheduleRunRow>;
      schedule_assignments: TableShape<ScheduleAssignmentRow>;
      leave_requests: TableShape<LeaveRequestRow>;
      charter_pauses: TableShape<CharterPauseRow>;
      watch_settings: TableShape<WatchSettingsRow>;
      crew_fairness_scores: TableShape<CrewFairnessScoreRow>;
      manual_overrides: TableShape<ManualOverrideRow>;
      schedule_explanations: TableShape<ScheduleExplanationRow>;
      schedule_health_scores: TableShape<ScheduleHealthScoreRow>;
      export_history: TableShape<ExportHistoryRow>;
      audit_logs: TableShape<AuditLogRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
