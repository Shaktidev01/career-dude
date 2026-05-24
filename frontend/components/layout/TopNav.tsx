import { Zap } from "lucide-react";
import Link from "next/link";

export function TopNav() {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        {/* Breadcrumbs or page title could go here */}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <Zap className="h-4 w-4" />
          <span>150 AI Credits</span>
          <Link href="/billing" className="ml-2 text-xs underline underline-offset-2">
            Upgrade
          </Link>
        </div>
        <div className="size-8 rounded-full bg-secondary flex items-center justify-center font-medium text-sm border">
          U
        </div>
      </div>
    </header>
  );
}
