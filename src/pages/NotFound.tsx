import { Link } from "react-router-dom";
import { Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
          <Anchor className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="font-display text-4xl font-semibold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is off the chart. Let&apos;s get you back on course.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
