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
import { useExportHistory, useLatestScheduleRun, useVesselId } from "@/hooks/data";
import { exportSchedule } from "@/lib/edge";

const EXPORT_TYPES = [
  { id: "bridge", label: "Bridge Schedule" },
  { id: "captain", label: "Captain's Report" },
  { id: "crew", label: "Crew Copy" },
  { id: "payroll", label: "Payroll Hours" },
  { id: "port_state", label: "Port State / STCW" },
] as const;

type ExportType = (typeof EXPORT_TYPES)[number]["id"];

export default function Reports() {
  const vesselId = useVesselId();
  const latestRun = useLatestScheduleRun();
  const exportHistory = useExportHistory();

  const [exportType, setExportType] = useState<ExportType>("bridge");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!latestRun.data?.id) {
      toast("Generate a schedule first from Settings.");
      return;
    }
    setExporting(true);
    try {
      const result = await exportSchedule({
        schedule_run_id: latestRun.data.id,
        export_type: exportType,
        vessel_id: vesselId ?? undefined,
      });
      if (result.file_url) {
        window.open(result.file_url, "_blank");
        toast.success("Export ready. Opening download.");
      } else {
        toast.success("Export started. Check export history below.");
      }
      exportHistory.refetch();
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
            disabled={exporting || !latestRun.data?.id}
            onClick={handleExport}
            className="shrink-0"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Generating…" : "Export PDF"}
          </Button>
        </div>
        {!latestRun.data?.id && (
          <p className="mt-3 text-xs text-muted-foreground">
            No schedule available. Generate one from{" "}
            <a href="/settings" className="text-primary hover:underline">
              Settings
            </a>
            .
          </p>
        )}
      </div>

      {/* Export type descriptions */}
      <div className="panel mb-5 p-5">
        <div className="mb-3 text-sm font-medium">Export types</div>
        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Bridge Schedule",
              desc: "Daily watch assignments formatted for bridge display. Shows assigned watchkeeper per day.",
            },
            {
              title: "Captain's Report",
              desc: "Summary report with fairness scores, debt analysis, and schedule health for management review.",
            },
            {
              title: "Crew Copy",
              desc: "Simplified personal schedule cards for crew members to keep in their cabin.",
            },
            {
              title: "Payroll Hours",
              desc: "Watch hours breakdown for payroll and overtime calculation including weighted holiday duties.",
            },
            {
              title: "Port State / STCW",
              desc: "STCW hours of rest compliance report for Port State Control inspections.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded border border-border bg-background/35 p-3"
            >
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
          <div className="py-12 text-center text-sm text-muted-foreground">
            No exports yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <div className="text-sm font-medium capitalize">
                    {item.export_type?.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {item.export_format ?? "pdf"}
                  </Badge>
                  {item.file_url && (
                    <a
                      href={item.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
