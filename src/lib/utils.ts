import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getDayWeightKind(
  date: Date,
): "standard_weekday" | "monday" | "friday" | "saturday" | "sunday" {
  const day = date.getDay();
  if (day === 1) return "monday";
  if (day === 5) return "friday";
  if (day === 6) return "saturday";
  if (day === 0) return "sunday";
  return "standard_weekday";
}
