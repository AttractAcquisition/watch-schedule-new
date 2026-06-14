import { Link, useLocation } from "react-router-dom";
import { LogOut, Settings, User } from "lucide-react";
import { useAuth, initialsFromName } from "@/lib/auth";
import { NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const { vessel, profile, user, signOut } = useAuth();
  const location = useLocation();
  const initials = initialsFromName(profile?.full_name, user?.email);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-sidebar/95 px-4 backdrop-blur-sm md:px-6">
      {/* Wordmark */}
      <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-primary">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 5v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="hidden text-[13px] font-semibold tracking-tight text-foreground sm:block">
          Watch Schedule
        </span>
      </Link>

      {/* Vessel name */}
      {vessel && (
        <div className="hidden border-l border-border pl-4 text-[12px] text-muted-foreground md:block">
          {vessel.name}
        </div>
      )}

      {/* Nav */}
      <nav className="ml-auto flex items-center gap-0.5">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const active =
            location.pathname === item.to ||
            (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "hidden rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors md:block",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground ring-offset-background hover:opacity-90">
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5">
            <div className="text-sm font-medium">{profile?.full_name || "Captain"}</div>
            <div className="text-xs text-muted-foreground">{user?.email}</div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
