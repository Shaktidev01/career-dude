"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import {
  LayoutDashboard, FileText, ClipboardList,
  Search, Layers, GitBranch, Mic, Building2,
  Send, BarChart, CalendarCheck,
  Briefcase, Settings, LogOut,
  GitCompare, Target, Globe, Zap, Users,
} from "lucide-react";

const EMPLOYEE_NAV = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "core" },
  { name: "Job Evaluator", href: "/evaluator", icon: Search, group: "core" },
  { name: "Compare Jobs", href: "/batch", icon: GitCompare, group: "core" },
  { name: "Career Matching", href: "/career-match", icon: Target, group: "core" },
  { name: "Live Scanner", href: "/scanner", icon: Zap, group: "core" },
  { name: "Job Finder", href: "/job-finder", icon: Globe, group: "core" },
  { name: "App Tracker", href: "/tracker", icon: ClipboardList, group: "track" },
  { name: "Pipeline", href: "/pipeline", icon: GitBranch, group: "track" },
  { name: "Follow-ups", href: "/followup", icon: CalendarCheck, group: "track" },
  { name: "Analytics", href: "/analytics", icon: BarChart, group: "track" },
  { name: "Resume Builder", href: "/resume-builder", icon: FileText, group: "prep" },
  { name: "Interview Prep", href: "/interview-prep", icon: Mic, group: "prep" },
  { name: "Company Research", href: "/research", icon: Building2, group: "prep" },
  { name: "Outreach", href: "/outreach", icon: Send, group: "prep" },
  { name: "Settings", href: "/settings", icon: Settings, group: "settings" },
];

const EMPLOYER_NAV = [
  { name: "CV Screener", href: "/employer", icon: FileText, group: "hire" },
  { name: "JD Generator", href: "/employer?tab=jd-gen", icon: Briefcase, group: "hire" },
  { name: "Interview Questions", href: "/employer?tab=questions", icon: Mic, group: "hire" },
  { name: "Batch Scoring", href: "/employer?tab=batch", icon: Users, group: "hire" },
  { name: "Settings", href: "/settings", icon: Settings, group: "settings" },
];

const GROUP_LABELS: Record<string, string> = {
  core: "Evaluate & Find",
  track: "Track",
  prep: "Prepare",
  hire: "Hiring Tools",
  settings: "",
};

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const [mode, setMode] = useState<"employee" | "employer">("employee");

  const navigation = mode === "employee" ? EMPLOYEE_NAV : EMPLOYER_NAV;
  const groups = mode === "employee"
    ? (["core", "track", "prep", "settings"] as const)
    : (["hire", "settings"] as const);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card/50 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 font-bold text-lg tracking-tight"
        >
          <div className="size-8 rounded-xl bg-gradient-to-br from-primary to-accent text-white flex items-center justify-center shadow-md shadow-primary/20">
            <Briefcase size={16} />
          </div>
          <span>Career Dude</span>
        </Link>
      </div>

      {/* Mode Toggle */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex rounded-xl bg-muted p-1 gap-1">
          <button
            onClick={() => setMode("employee")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${
              mode === "employee"
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Search size={11} /> Employee
          </button>
          <button
            onClick={() => { setMode("employer"); }}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${
              mode === "employer"
                ? "bg-card text-accent shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 size={11} /> Employer
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3 px-3">
        <nav className="space-y-4">
          {groups.map((group) => {
            const items = navigation.filter((n) => n.group === group);
            const label = GROUP_LABELS[group];
            return (
              <div key={group}>
                {label && (
                  <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    {label}
                  </p>
                )}
                <div className="grid gap-0.5">
                  {items.map((item) => {
                    const isActive = pathname === item.href || (item.href.startsWith("/employer") && pathname === "/employer");
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                          isActive
                            ? mode === "employer"
                              ? "bg-accent/10 text-accent shadow-sm"
                              : "bg-primary/10 text-primary shadow-sm"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        <item.icon
                          className={`h-4 w-4 flex-shrink-0 ${isActive ? (mode === "employer" ? "text-accent" : "text-primary") : ""}`}
                        />
                        {item.name}
                        {isActive && (
                          <div className={`ml-auto h-1.5 w-1.5 rounded-full ${mode === "employer" ? "bg-accent" : "bg-primary"}`} />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* User section */}
      {user && (
        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-secondary/50">
            <div className="size-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-xs font-bold text-primary">
              {(user.name || user.email || "U")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {user.name || "User"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {user.email}
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
