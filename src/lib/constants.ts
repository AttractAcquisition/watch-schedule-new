import type { PlanType } from "./types";

export const BRAND = {
  name: "Watch Schedule",
  domain: "watchschedule.com",
  app: "app.watchschedule.com",
  tagline: "Professional watch scheduling for superyacht teams.",
};

export interface PlanDef {
  id: PlanType;
  name: string;
  price: string;
  per: string;
  blurb: string;
  features: string[];
  typical: string;
  cta: string;
  popular?: boolean;
}

export const PLANS: PlanDef[] = [
  {
    id: "solo_watch",
    name: "Solo Watch",
    price: "£29",
    per: "/month",
    blurb: "One watchkeeper per day — the standard superyacht daily rota.",
    features: [
      "Daily watch rota",
      "Leave management",
      "Charter mode",
      "PDF export",
      "Fairness balancing",
    ],
    typical: "Typical vessels: 30m–50m",
    cta: "Continue with Solo Watch",
  },
  {
    id: "dual_watch",
    name: "Dual Watch",
    price: "£59",
    per: "/month",
    blurb: "Watchkeeper + OOW, or Day/Night rotations on larger vessels.",
    features: [
      "Two simultaneous schedules",
      "Leave management",
      "Fairness balancing",
      "Schedule optimisation",
      "Charter mode",
    ],
    typical: "Typical vessels: 50m–65m",
    cta: "Continue with Dual Watch",
    popular: true,
  },
  {
    id: "triple_watch",
    name: "Triple Watch",
    price: "£99",
    per: "/month",
    blurb: "Deck/OOW, Interior Watchkeeper, and Engineering OOW independently scheduled.",
    features: [
      "Three independent watch systems",
      "Department-specific rules",
      "Leave management",
      "Charter mode",
      "Advanced reporting",
    ],
    typical: "Typical vessels: 60m–120m+",
    cta: "Continue with Triple Watch",
  },
];

export const PLAN_LABEL: Record<PlanType, string> = {
  solo_watch: "Solo Watch",
  dual_watch: "Dual Watch",
  triple_watch: "Triple Watch",
};

export const DEPT_LABELS: Record<string, string> = {
  command: "Command",
  deck: "Deck",
  interior: "Interior",
  engineering: "Engineering",
  unassigned: "Unassigned",
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  leave: "Annual leave",
  sick: "Sick leave",
  training: "Training",
  off_vessel: "Off vessel",
  unavailable: "Unavailable",
};

export const DEFAULT_DUTY_WEIGHTS = {
  standard_weekday: 1,
  monday: 1,
  friday: 1.25,
  saturday: 1.5,
  sunday: 1.5,
  public_holiday: 1.5,
  christmas_eve: 2,
  christmas_day: 2.5,
  boxing_day: 2,
  new_years_eve: 2.5,
  new_years_day: 2,
} as const;

export const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/crew", label: "Crew" },
  { to: "/leave", label: "Leave" },
  { to: "/charter", label: "Charter" },
  { to: "/fairness", label: "Fairness" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" },
] as const;
