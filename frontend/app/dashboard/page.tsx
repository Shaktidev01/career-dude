"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ClipboardList, Mic, FileText, Sparkles, Target,
  TrendingUp, Award, Zap, ArrowRight, Globe, GitBranch, Radio,
} from "lucide-react";

interface DashboardData {
  total_applications: number;
  active_interviews: number;
  avg_score: string;
  resumes_generated: number;
  offers: number;
  ai_credits: number;
  recent_evaluations: {
    id: string;
    job_title: string | null;
    company: string | null;
    ai_score: string | null;
    archetype: string | null;
    created_at: string;
  }[];
}

const statConfig = [
  { key: "total_applications", label: "Applications", icon: ClipboardList, gradient: "from-blue-500/10 to-blue-600/5", iconColor: "text-blue-600", borderColor: "border-blue-200" },
  { key: "active_interviews", label: "Interviews", icon: Mic, gradient: "from-violet-500/10 to-violet-600/5", iconColor: "text-violet-600", borderColor: "border-violet-200" },
  { key: "resumes_generated", label: "Resumes", icon: FileText, gradient: "from-emerald-500/10 to-emerald-600/5", iconColor: "text-emerald-600", borderColor: "border-emerald-200" },
  { key: "offers", label: "Offers", icon: Award, gradient: "from-amber-500/10 to-amber-600/5", iconColor: "text-amber-600", borderColor: "border-amber-200" },
  { key: "avg_score", label: "Latest Score", icon: Target, gradient: "from-rose-500/10 to-rose-600/5", iconColor: "text-rose-600", borderColor: "border-rose-200" },
  { key: "ai_credits", label: "AI Credits", icon: Zap, gradient: "from-cyan-500/10 to-cyan-600/5", iconColor: "text-cyan-600", borderColor: "border-cyan-200" },
];

function getAvatarColors(company: string): { bg: string; text: string } {
  const palettes = [
    { bg: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-green-100", text: "text-green-700" },
    { bg: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-pink-100", text: "text-pink-700" },
    { bg: "bg-cyan-100", text: "text-cyan-700" },
  ];
  const i = ((company || "?").charCodeAt(0) + ((company || "??").charCodeAt(1) || 0)) % palettes.length;
  return palettes[i];
}

function discoveryScoreStyle(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function discoveryScoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good";
  return "Weak";
}

function getScoreColor(score: string) {
  if (!score || score === "-") return "";
  const s = score.toUpperCase();
  if (s.startsWith("A")) return "text-emerald-600";
  if (s.startsWith("B")) return "text-blue-600";
  if (s.startsWith("C")) return "text-amber-600";
  return "text-red-600";
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [discoveryPreview, setDiscoveryPreview] = useState<{
    jobs: Array<{ id: string; title: string | null; company: string | null; keyword_score: number; source: string | null; discovered_at: string }>;
    unseen: number;
    last_scanned_at: string | null;
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (session?.user) fetchDashboard();
  }, [session]);

  useEffect(() => {
    if (session?.user) fetchDiscoveryPreview();
  }, [session]);

  const fetchDiscoveryPreview = async () => {
    try {
      const res = await fetch("/api/v1/jobs/discovered?unseen_only=false&limit=3", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      if (res.ok) setDiscoveryPreview(await res.json());
    } catch {}
  };

  const quickScan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch("/api/v1/jobs/discover", {
        method: "POST",
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      if (res.ok) await fetchDiscoveryPreview();
    } catch {} finally {
      setIsScanning(false);
    }
  };

  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/v1/dashboard", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error("Failed to fetch dashboard", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Your career search at a glance.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {statConfig.map((stat) => (
          <Card
            key={stat.key}
            className={`overflow-hidden border ${stat.borderColor} hover:shadow-md transition-shadow`}
          >
            <CardContent className={`p-5 bg-gradient-to-br ${stat.gradient}`}>
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-9 w-16" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon size={16} className={stat.iconColor} />
                    <span className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </span>
                  </div>
                  <div className={`text-3xl font-bold ${
                    stat.key === "avg_score"
                      ? getScoreColor((data as any)?.[stat.key] || "")
                      : ""
                  }`}>
                    {(data as any)?.[stat.key] ?? 0}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {[
          { href: "/evaluator", label: "Evaluate Job", icon: Sparkles, desc: "Career Ops A-G analysis" },
          { href: "/scanner", label: "Live Scanner", icon: Zap, desc: "Real listings now" },
          { href: "/job-finder", label: "Job Finder", icon: Globe, desc: "19 portals, 1 click" },
          { href: "/pipeline", label: "Pipeline", icon: GitBranch, desc: "Track all apps" },
          { href: "/resume-builder", label: "Resume", icon: FileText, desc: "ATS-optimized" },
        ].map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="group hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-dashed">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="size-10 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                  <action.icon size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{action.label}</div>
                  <div className="text-xs text-muted-foreground">{action.desc}</div>
                </div>
                <ArrowRight size={16} className="text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Smart Discovery widget */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Smart Discovery</h3>
            {(discoveryPreview?.unseen ?? 0) > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {discoveryPreview!.unseen} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={quickScan}
              disabled={isScanning}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              {isScanning ? "Scanning..." : "▶ Scan Now"}
            </button>
            <Link href="/scanner?tab=discovery" className="text-sm text-primary hover:underline underline-offset-4">
              View all
            </Link>
          </div>
        </div>

        <Card className="border-blue-100">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : !discoveryPreview || discoveryPreview.jobs.length === 0 ? (
              <div className="p-6 text-center">
                <div className="size-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <Radio size={20} className="text-blue-600" />
                </div>
                <p className="text-sm font-medium mb-1">No discovered jobs yet</p>
                <p className="text-xs text-muted-foreground mb-3">Scan once to start seeing matched jobs here.</p>
                <button onClick={quickScan} disabled={isScanning}
                  className="text-xs text-blue-600 font-medium hover:underline disabled:opacity-50">
                  {isScanning ? "Scanning..." : "Run first scan →"}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {discoveryPreview.jobs.map(job => {
                  const av = getAvatarColors(job.company || "?");
                  const initials = (job.company || "?").slice(0, 2).toUpperCase();
                  return (
                    <div key={job.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${av.bg} ${av.text}`}
                        aria-hidden="true">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.title || "Unknown Role"}</p>
                        <p className="text-xs text-muted-foreground">{job.company}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${discoveryScoreStyle(job.keyword_score)}`}>
                        {job.keyword_score}% · {discoveryScoreLabel(job.keyword_score)}
                      </span>
                    </div>
                  );
                })}
                {discoveryPreview.last_scanned_at && (
                  <div className="px-4 py-2 text-xs text-muted-foreground">
                    Last scanned {new Date(discoveryPreview.last_scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent evaluations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Evaluations</h3>
          <Link
            href="/evaluator"
            className="text-sm text-primary hover:underline underline-offset-4"
          >
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : data?.recent_evaluations && data.recent_evaluations.length > 0 ? (
          <div className="space-y-3">
            {data.recent_evaluations.map((ev) => (
              <Card key={ev.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`text-2xl font-bold w-12 text-center ${getScoreColor(ev.ai_score || "")}`}>
                    {ev.ai_score || "-"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {ev.job_title || "Unknown Role"}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {ev.company || "Unknown Company"}
                    </div>
                  </div>
                  {ev.archetype && (
                    <Badge variant="secondary" className="hidden sm:inline-flex text-xs">
                      {ev.archetype}
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {new Date(ev.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={24} className="text-primary" />
              </div>
              <h4 className="font-semibold mb-1">No evaluations yet</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Run your first Career Ops evaluation to see results here.
              </p>
              <Link
                href="/evaluator"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                <Sparkles size={14} />
                Evaluate a Job
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
