import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAssignments,
  useCrew,
  useCrewFairnessScores,
  useExportHistory,
  useLatestScheduleRun,
  useVesselId,
} from "@/hooks/data";
import { useAuth } from "@/lib/auth";
import { exportSchedule } from "@/lib/edge";
import { buildExportCSV, downloadBlob, exportFilename, type ExportType } from "@/lib/exportUtils";

const EXPORT_TYPES: { id: ExportType; label: string }[] = [
  { id: "bridge",     label: "Bridge Schedule" },
  { id: "captain",    label: "Captain's Report" },
  { id: "crew",       label: "Crew Copy" },
  { id: "payroll",    label: "Payroll Hours" },
  { id: "port_state", label: "Port State / STCW" },
];

export default function Reports() {
  const { vessel } = useAuth();
  const vesselId = useVesselId();
  const latestRun = useLatestScheduleRun();
  const assignments = useAssignments(latestRun.data?.id);
  const crewQuery = useCrew();
  const fairnessQuery = useCrewFairnessScores();
  const exportHistory = useExportHistory();

  const [exportType, setExportType] = useState<ExportType>("bridge");
  const [exporting, setExporting] = useState(false);

  const hasAssignments = (assignments.data?.length ?? 0) > 0;

  async function handleExport() {
    const run = latestRun.data;
    if (!run?.id) {
      toast.error("Generate a schedule first from Settings.");
      return;
    }
    const rows = assignments.data;
    if (!rows?.length) {
      toast.error("No schedule assignments found. Generate a schedule first.");
      return;
    }

    setExporting(true);
    try {
      const crewMap = new Map((crewQuery.data ?? []).map((c) => [c.id, c]));
      const vesselName = vessel?.name ?? "Vessel";
      const label = EXPORT_TYPES.find((t) => t.id === exportType)?.label ?? exportType;

      const csv = buildExportCSV(exportType, rows, crewMap, vesselName, run, fairnessQuery.data ?? []);
      downloadBlob(csv, exportFilename(exportType));
      toast.success(`${label} downloaded.`);

      // Log in background
      exportSchedule({ schedule_run_id: run.id, export_type: exportType, vessel_id: vesselId ?? undefined })
        .then(() => exportHistory.refetch())
        .catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const history = exportHistory.data ?? [];

  return (
    <AppShell>
      <div className="mb-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Reports & Exports
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold">Schedule reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export your watch schedule in various formats for the bridge, captain, crew, and regulatory compliance.
        </p>
      </div>

      {/* Export card */}
      <div className="panel mb-5 p-6">
        <div className="mb-4 text-sm font-medium">Generate export</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Report type</label>
            <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={exporting || !hasAssignments}
            onClick={handleExport}
            className="shrink-0"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Generating…" : "Download CSV"}
          </Button>
        </div>
        {!latestRun.data?.id && !latestRun.isLoading && (
          <p className="mt-3 text-xs text-muted-foreground">
            No schedule yet.{" "}
            <a href="/settings" className="text-primary hover:underline">
              Generate one in Settings.
            </a>
          </p>
        )}
      </div>

      {/* Export type descriptions */}
      <div className="panel mb-5 p-5">
        <div className="mb-3 text-sm font-medium">Export types</div>
        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Bridge Schedule",     desc: "Daily watch assignments for bridge display. Shows watchkeeper per day." },
            { title: "Captain's Report",    desc: "Fairness scores, debt analysis and schedule health for management." },
            { title: "Crew Copy",           desc: "Personal schedule per crew member, grouped by name." },
            { title: "Payroll Hours",       desc: "Watch count and weighted load for payroll and overtime calculation." },
            { title: "Port State / STCW",   desc: "STCW hours of rest report for Port State Control inspections." },
          ].map((item) => (
            <div key={item.title} className="rounded border border-border bg-background/35 p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">{item.title}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Export history */}
      <div className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-medium">Export history</div>
        </div>
        {history.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No exports yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm font-medium capitalize">
                    {item.export_type?.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">CSV</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
