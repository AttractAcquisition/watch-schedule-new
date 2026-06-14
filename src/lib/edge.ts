import { supabase } from "./supabase";

async function callEdge<T>(fnName: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) throw new Error(error.message);
  return data as T;
}

export interface ExtractedCrewMember {
  full_name: string;
  position: string | null;
  rank: string | null;
  department: "command" | "deck" | "interior" | "engineering" | "unassigned";
}

export async function extractCrewFromPhoto(
  imageBase64: string,
  mediaType = "image/jpeg",
): Promise<ExtractedCrewMember[]> {
  const res = await callEdge<{ crew: ExtractedCrewMember[] }>("extract-crew-from-photo", {
    image_base64: imageBase64,
    media_type: mediaType,
  });
  return res.crew ?? [];
}

export async function generateSchedule(input: {
  vessel_id: string;
  watch_template_id?: string;
  start_date: string;
  end_date: string;
  watch_mode?: string;
  crew_ids?: string[];
  replace_existing?: boolean;
}): Promise<{ schedule_run_id: string; assignments: unknown[]; fairness_score: number; warnings: string[] }> {
  return callEdge("generate-schedule", input);
}

export async function regenerateSchedule(input: {
  schedule_run_id: string;
  mode?: "full" | "partial";
  change_context?: Record<string, unknown>;
}): Promise<{ schedule_run_id: string }> {
  return callEdge("regenerate-schedule", input);
}

export async function createCheckoutSession(input: {
  plan_type: string;
  success_url: string;
  cancel_url: string;
}): Promise<{ url: string }> {
  return callEdge("create-checkout-session", input);
}

export async function createCustomerPortalSession(input: {
  return_url: string;
}): Promise<{ url: string }> {
  return callEdge("create-customer-portal-session", input);
}

export async function activateCharterMode(input: {
  vessel_id: string;
  schedule_run_id?: string | null;
  start_date: string;
  end_date: string;
  pause_all_watches?: boolean;
  keep_engineering_watch_active?: boolean;
  keep_security_watch_active?: boolean;
  resume_mode?: "automatic" | "manual";
}): Promise<{ charter_pause_id: string }> {
  return callEdge("charter-mode", { ...input, action: "activate" });
}

export async function resumeCharterMode(input: {
  vessel_id: string;
  schedule_run_id?: string | null;
  resume_mode?: "automatic" | "manual";
}): Promise<{ message: string }> {
  return callEdge("charter-mode", { ...input, action: "resume" });
}

export async function exportSchedule(input: {
  schedule_run_id: string;
  export_type: string;
  vessel_id?: string;
}): Promise<{ file_url: string | null; export_id: string }> {
  return callEdge("export-schedule", input);
}

export async function calculateLeaveImpact(input: {
  crew_member_id: string;
  start_date: string;
  end_date: string;
  vessel_id?: string;
  leave_type?: string;
}): Promise<{ impact_score: number; warnings: string[]; summary?: string }> {
  return callEdge("leave-impact", input);
}

export async function calculateFairness(input: {
  vessel_id: string;
  schedule_run_id?: string;
}): Promise<{ fairness_score: number }> {
  return callEdge("calculate-fairness", input);
}
