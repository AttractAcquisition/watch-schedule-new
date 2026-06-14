import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarOff,
  Anchor,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MOBILE_NAV = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/crew", label: "Crew", Icon: Users },
  { to: "/leave", label: "Leave", Icon: CalendarOff },
  { to: "/charter", label: "Charter", Icon: Anchor },
  { to: "/fairness", label: "Fairness", Icon: BarChart3 },
  { to: "/settings", label: "Settings", Icon: Settings },
];

export function MobileNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-stretch border-t border-border bg-sidebar/95 backdrop-blur-sm md:hidden">
      {MOBILE_NAV.map(({ to, label, Icon }) => {
        const active = location.pathname === to || location.pathname.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
