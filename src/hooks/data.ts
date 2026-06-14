import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  listCrew,
  getLatestScheduleRun,
  listAssignments,
  listLeaveRequests,
  listCharterPauses,
  listExports,
  listWatchTemplates,
  getWatchSettings,
  listCrewFairnessScores,
  getLatestScheduleHealth,
  listScheduleExplanations,
  listManualOverrides,
} from "@/lib/api";

export function useVesselId(): string | null {
  return useAuth().vessel?.id ?? null;
}

export function useCrew() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["crew", vesselId],
    enabled: !!vesselId,
    queryFn: () => listCrew(vesselId!),
  });
}

export function useLatestScheduleRun() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["schedule-run", vesselId],
    enabled: !!vesselId,
    queryFn: () => getLatestScheduleRun(vesselId!),
  });
}

export function useAssignments(scheduleRunId: string | null | undefined) {
  return useQuery({
    queryKey: ["assignments", scheduleRunId],
    enabled: !!scheduleRunId,
    queryFn: () => listAssignments(scheduleRunId!),
  });
}

export function useLeaveRequests() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["leave-requests", vesselId],
    enabled: !!vesselId,
    queryFn: () => listLeaveRequests(vesselId!),
  });
}

export function useCharterPauses() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["charter", vesselId],
    enabled: !!vesselId,
    queryFn: () => listCharterPauses(vesselId!),
  });
}

export function useExports() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["exports", vesselId],
    enabled: !!vesselId,
    queryFn: () => listExports(vesselId!),
  });
}

export const useExportHistory = useExports;

export function useWatchTemplates() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["templates", vesselId],
    enabled: !!vesselId,
    queryFn: () => listWatchTemplates(vesselId!),
  });
}

export function useWatchSettings() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["watch-settings", vesselId],
    enabled: !!vesselId,
    queryFn: () => getWatchSettings(vesselId!),
  });
}

export function useCrewFairnessScores() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["crew-fairness", vesselId],
    enabled: !!vesselId,
    queryFn: () => listCrewFairnessScores(vesselId!),
  });
}

export function useScheduleHealth() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["schedule-health", vesselId],
    enabled: !!vesselId,
    queryFn: () => getLatestScheduleHealth(vesselId!),
  });
}

export function useScheduleExplanations() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["schedule-explanations", vesselId],
    enabled: !!vesselId,
    queryFn: () => listScheduleExplanations(vesselId!),
  });
}

export function useManualOverrides() {
  const vesselId = useVesselId();
  return useQuery({
    queryKey: ["manual-overrides", vesselId],
    enabled: !!vesselId,
    queryFn: () => listManualOverrides(vesselId!),
  });
}

export function useInvalidateVesselData() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["crew"] });
    qc.invalidateQueries({ queryKey: ["schedule-run"] });
    qc.invalidateQueries({ queryKey: ["assignments"] });
    qc.invalidateQueries({ queryKey: ["leave-requests"] });
    qc.invalidateQueries({ queryKey: ["charter"] });
    qc.invalidateQueries({ queryKey: ["exports"] });
    qc.invalidateQueries({ queryKey: ["templates"] });
    qc.invalidateQueries({ queryKey: ["watch-settings"] });
    qc.invalidateQueries({ queryKey: ["crew-fairness"] });
    qc.invalidateQueries({ queryKey: ["schedule-health"] });
    qc.invalidateQueries({ queryKey: ["schedule-explanations"] });
    qc.invalidateQueries({ queryKey: ["manual-overrides"] });
  };
}
