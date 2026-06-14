import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { completeOnboarding } from "@/lib/api";
import { CrewPhotoImport, ExtractedCrewPreview } from "@/components/crew/CrewPhotoImport";
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
import { BRAND, PLAN_LABEL } from "@/lib/constants";
import type { ExtractedCrewMember } from "@/lib/edge";
import type { PlanType } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  "Vessel setup",
  "Import your crew",
  "Review and confirm",
];

const PLAN_TO_MODE = {
  solo_watch: "solo",
  dual_watch: "dual",
  triple_watch: "triple",
} as const;

interface CrewEntry {
  fullName: string;
  position: string;
  rank: string;
  department: string;
}

function emptyEntry(): CrewEntry {
  return { fullName: "", position: "", rank: "", department: "deck" };
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, subscription, refreshAppState } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 0 — vessel
  const [vesselName, setVesselName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [operationType, setOperationType] = useState("private");

  // Step 1 — crew
  const [extractedCrew, setExtractedCrew] = useState<ExtractedCrewMember[]>([]);
  const [manualCrew, setManualCrew] = useState<CrewEntry[]>([emptyEntry()]);
  const [usePhotoImport, setUsePhotoImport] = useState(true);

  const plan = (subscription?.plan_type ?? "solo_watch") as PlanType;
  const watchMode = PLAN_TO_MODE[plan];

  const allCrew: CrewEntry[] =
    extractedCrew.length > 0
      ? extractedCrew.map((m) => ({
          fullName: m.full_name,
          position: m.position ?? "",
          rank: m.rank ?? "",
          department: m.department,
        }))
      : manualCrew.filter((c) => c.fullName.trim());

  function canProceed() {
    if (step === 0) return vesselName.trim().length > 0;
    return true;
  }

  async function handleComplete() {
    if (!user) return;
    if (!vesselName.trim()) {
      toast.error("Enter a vessel name.");
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      await completeOnboarding({
        userId: user.id,
        vessel: {
          name: vesselName.trim(),
          timezone,
          operationType,
          watchMode,
          planType: plan,
        },
        crew: allCrew.map((c) => ({
          fullName: c.fullName,
          position: c.position || undefined,
          rank: c.rank || undefined,
          department: c.department as "command" | "deck" | "interior" | "engineering" | "unassigned",
          watchEligible: true,
        })),
      });
      await refreshAppState();
      toast.success("Vessel created. Welcome aboard!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
          {BRAND.name} · Vessel Setup
        </div>
        <h1 className="font-display text-2xl font-semibold">{STEPS[step]}</h1>
        {subscription?.plan_type && (
          <div className="mt-1 text-sm text-muted-foreground">
            Plan: <span className="text-foreground">{PLAN_LABEL[subscription.plan_type]}</span>
            {" · "}Watch mode: <span className="text-foreground capitalize">{watchMode}</span>
          </div>
        )}

        {/* Progress */}
        <div className="mt-5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium",
                  i < step
                    ? "border-success/40 bg-success/10 text-success"
                    : i === step
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-px w-8 flex-1", i < step ? "bg-success/40" : "bg-border")} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="mt-8">
          {/* Step 0: Vessel */}
          {step === 0 && (
            <div className="panel grid gap-4 p-6">
              <div className="space-y-1.5">
                <Label htmlFor="vesselName">Vessel name *</Label>
                <Input
                  id="vesselName"
                  value={vesselName}
                  onChange={(e) => setVesselName(e.target.value)}
                  placeholder="M/Y Oceania"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="Europe/Monaco">Europe/Monaco</SelectItem>
                    <SelectItem value="Europe/Athens">Europe/Athens</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="America/Fort_Lauderdale">America/Fort_Lauderdale</SelectItem>
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
              <p className="text-xs text-muted-foreground">
                Watch mode <span className="font-medium capitalize">{watchMode}</span> is set by your plan. You can change your plan later.
              </p>
            </div>
          )}

          {/* Step 1: Crew import */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/50 p-3">
                <button
                  onClick={() => setUsePhotoImport(true)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                    usePhotoImport ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Photo import
                </button>
                <button
                  onClick={() => setUsePhotoImport(false)}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                    !usePhotoImport ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Manual entry
                </button>
              </div>

              {usePhotoImport ? (
                <div className="space-y-3">
                  <CrewPhotoImport onExtracted={setExtractedCrew} />
                  {extractedCrew.length > 0 && (
                    <ExtractedCrewPreview crew={extractedCrew} onDiscard={() => setExtractedCrew([])} />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Upload a photo of your crew list. AI will extract names, positions, and departments.
                    You can edit crew details after setup.
                  </p>
                </div>
              ) : (
                <div className="panel space-y-3 p-5">
                  <div className="text-sm font-medium text-muted-foreground">
                    Add crew members manually. You can add more from the Crew page after setup.
                  </div>
                  {manualCrew.map((entry, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={entry.fullName}
                        onChange={(e) =>
                          setManualCrew((prev) =>
                            prev.map((c, i) =>
                              i === idx ? { ...c, fullName: e.target.value } : c,
                            ),
                          )
                        }
                        placeholder={`Crew member ${idx + 1} name`}
                      />
                      <Select
                        value={entry.department}
                        onValueChange={(v) =>
                          setManualCrew((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, department: v } : c)),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="command">Command</SelectItem>
                          <SelectItem value="deck">Deck</SelectItem>
                          <SelectItem value="interior">Interior</SelectItem>
                          <SelectItem value="engineering">Engineering</SelectItem>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualCrew((prev) => [...prev, emptyEntry()])}
                  >
                    + Add another crew member
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div className="panel space-y-4 p-6">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Vessel
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name: </span>
                    <span className="font-medium">{vesselName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Timezone: </span>
                    {timezone}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Operation: </span>
                    {operationType.replace(/_/g, " ")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Watch mode: </span>
                    <span className="capitalize">{watchMode}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Crew ({allCrew.length} member{allCrew.length === 1 ? "" : "s"})
                </div>
                {allCrew.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {allCrew.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{c.fullName}</span>
                        {c.position && (
                          <span className="text-muted-foreground">· {c.position}</span>
                        )}
                        <span className="text-muted-foreground capitalize">· {c.department}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No crew added. You can add crew from the Crew page after setup.
                  </p>
                )}
              </div>

              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                Completing setup will create your vessel dashboard and default watch template.
                You can customise everything from Settings.
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : (
            <div />
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Continue
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={saving}>
              {saving ? "Creating…" : "Create vessel dashboard"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
