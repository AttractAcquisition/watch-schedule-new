import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useLatestScheduleRun, useWatchSettings, useVesselId, useCrew } from "@/hooks/data";
import { updateVessel, updateWatchSettings } from "@/lib/api";
import { generateSchedule, createCustomerPortalSession } from "@/lib/edge";
import { DEFAULT_DUTY_WEIGHTS, PLAN_LABEL } from "@/lib/constants";
import type { PlanType } from "@/lib/types";

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { user, vessel, subscription, refreshAppState } = useAuth();
  const vesselId = useVesselId();
  const crewQuery = useCrew();
  const watchSettingsQuery = useWatchSettings();
  const latestRun = useLatestScheduleRun();

  const [vesselName, setVesselName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [operationType, setOperationType] = useState("private");
  const [vesselBusy, setVesselBusy] = useState(false);

  const [avoidConsecutive, setAvoidConsecutive] = useState(true);
  const [weekendWeight, setWeekendWeight] = useState(DEFAULT_DUTY_WEIGHTS.saturday.toString());
  const [fridayWeight, setFridayWeight] = useState(DEFAULT_DUTY_WEIGHTS.friday.toString());
  const [holidayWeight, setHolidayWeight] = useState(DEFAULT_DUTY_WEIGHTS.public_holiday.toString());
  const [christmasWeight, setChristmasWeight] = useState(DEFAULT_DUTY_WEIGHTS.christmas_day.toString());
  const [settingsBusy, setSettingsBusy] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [months, setMonths] = useState(3);

  const [portalBusy, setPortalBusy] = useState(false);

  const ws = watchSettingsQuery.data;

  useEffect(() => {
    if (vessel) {
      setVesselName(vessel.name ?? "");
      setTimezone(vessel.timezone ?? "UTC");
      setOperationType(vessel.operation_type ?? "private");
    }
  }, [vessel]);

  useEffect(() => {
    if (ws) {
      setAvoidConsecutive(ws.avoid_consecutive ?? true);
      setWeekendWeight((ws.duty_weights as Record<string, number>)?.saturday?.toString() ?? DEFAULT_DUTY_WEIGHTS.saturday.toString());
      setFridayWeight((ws.duty_weights as Record<string, number>)?.friday?.toString() ?? DEFAULT_DUTY_WEIGHTS.friday.toString());
      setHolidayWeight((ws.duty_weights as Record<string, number>)?.public_holiday?.toString() ?? DEFAULT_DUTY_WEIGHTS.public_holiday.toString());
      setChristmasWeight((ws.duty_weights as Record<string, number>)?.christmas_day?.toString() ?? DEFAULT_DUTY_WEIGHTS.christmas_day.toString());
    }
  }, [ws]);

  async function handleSaveVessel() {
    if (!vesselId) return;
    setVesselBusy(true);
    try {
      await updateVessel(vesselId, {
        name: vesselName.trim(),
        timezone,
        operation_type: operationType,
      });
      await refreshAppState();
      toast.success("Vessel settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setVesselBusy(false);
    }
  }

  async function handleSaveWatchRules() {
    if (!vesselId || !ws?.id) return;
    setSettingsBusy(true);
    try {
      await updateWatchSettings(ws.id, {
        avoid_consecutive: avoidConsecutive,
        duty_weights: {
          standard_weekday: 1,
          monday: parseFloat(fridayWeight),
          friday: parseFloat(fridayWeight),
          saturday: parseFloat(weekendWeight),
          sunday: parseFloat(weekendWeight),
          public_holiday: parseFloat(holidayWeight),
          christmas_day: parseFloat(christmasWeight),
        },
      });
      toast.success("Watch rules saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleGenerateSchedule() {
    if (!vesselId) return;
    const crew = crewQuery.data ?? [];
    if (crew.length === 0) {
      toast.error("Add crew members before generating a schedule.");
      return;
    }
    setGenerating(true);
    try {
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);
      const end = new Date(today);
      end.setMonth(end.getMonth() + months);
      const endDate = end.toISOString().slice(0, 10);

      await generateSchedule({
        vessel_id: vesselId,
        start_date: startDate,
        end_date: endDate,
        crew_ids: crew.filter((m) => m.watch_eligible && m.status === "active").map((m) => m.id),
        replace_existing: true,
      });
      toast.success("Schedule generated successfully.");
      latestRun.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Schedule generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleBillingPortal() {
    setPortalBusy(true);
    try {
      const { url } = await createCustomerPortalSession({
        return_url: window.location.href,
      });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal.");
      setPortalBusy(false);
    }
  }

  const planType = (subscription?.plan_type ?? vessel?.plan_type) as PlanType | null | undefined;

  return (
    <AppShell>
      <div className="mb-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Configuration
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold">Settings</h1>
      </div>

      <div className="space-y-5">
        {/* Vessel */}
        <Section id="vessel" title="Vessel details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vesselName">Vessel name</Label>
              <Input
                id="vesselName"
                value={vesselName}
                onChange={(e) => setVesselName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tz">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="tz">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="Europe/Monaco">Europe/Monaco</SelectItem>
                  <SelectItem value="Europe/Athens">Europe/Athens</SelectItem>
                  <SelectItem value="America/New_York">America/New_York</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                  <SelectItem value="Pacific/Auckland">Pacific/Auckland</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia/Sydney</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Operation type</Label>
              <Select value={operationType} onValueChange={setOperationType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="charter">Charter</SelectItem>
                  <SelectItem value="private_charter">Private + Charter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" disabled={vesselBusy} onClick={handleSaveVessel}>
            {vesselBusy ? "Saving…" : "Save vessel details"}
          </Button>
        </Section>

        {/* Watch rules */}
        <Section id="watch-rules" title="Watch rules">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="avoidConsecutive"
                checked={avoidConsecutive}
                onCheckedChange={setAvoidConsecutive}
              />
              <Label htmlFor="avoidConsecutive" className="cursor-pointer">
                Avoid consecutive duty days
              </Label>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Duty weights (multiplier applied to that day type)
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Weekend (Sat/Sun)", state: weekendWeight, set: setWeekendWeight },
                  { label: "Mon/Fri", state: fridayWeight, set: setFridayWeight },
                  { label: "Public holiday", state: holidayWeight, set: setHolidayWeight },
                  { label: "Christmas / NY", state: christmasWeight, set: setChristmasWeight },
                ].map(({ label, state, set }) => (
                  <div key={label} className="space-y-1.5">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="1"
                      max="5"
                      value={state}
                      onChange={(e) => set(e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <Button disabled={settingsBusy} onClick={handleSaveWatchRules}>
              {settingsBusy ? "Saving…" : "Save watch rules"}
            </Button>
          </div>
        </Section>

        {/* Generate schedule */}
        <Section id="generate" title="Generate schedule">
          <p className="mb-4 text-sm text-muted-foreground">
            Generate a new watch schedule based on your current crew and rules.
            This will replace any existing schedule assignments.
          </p>
          <div className="mb-4 flex items-center gap-3">
            <Label className="shrink-0 text-sm">Months to generate</Label>
            <Select
              value={months.toString()}
              onValueChange={(v) => setMonths(parseInt(v))}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 month</SelectItem>
                <SelectItem value="2">2 months</SelectItem>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateSchedule} disabled={generating}>
            {generating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating schedule…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Generate {months}-month schedule
              </span>
            )}
          </Button>
          {latestRun.data && (
            <p className="mt-3 text-xs text-muted-foreground">
              Last run:{" "}
              {new Date(latestRun.data.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              · Fairness score: {latestRun.data.fairness_score ?? "—"}%
            </p>
          )}
        </Section>

        {/* Account */}
        <Section id="account" title="Account">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{user?.email}</span>
            </div>
            {planType && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span>{PLAN_LABEL[planType]}</span>
              </div>
            )}
            {subscription && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Billing status</span>
                <span className="capitalize">{subscription.status}</span>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="mt-4"
            disabled={portalBusy}
            onClick={handleBillingPortal}
          >
            {portalBusy ? (
              "Opening…"
            ) : (
              <span className="flex items-center gap-2">
                Manage billing <ExternalLink className="h-3.5 w-3.5" />
              </span>
            )}
          </Button>
        </Section>
      </div>
    </AppShell>
  );
}
