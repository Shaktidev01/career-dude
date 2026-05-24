"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, TrendingUp, Target, Users } from "lucide-react";

interface Analytics {
  score_distribution: { score: string; count: number }[];
  application_funnel: Record<string, number>;
  top_archetypes: { archetype: string; count: number }[];
  total_evaluations: number;
  weekly_applications: { week: string; count: number }[];
}

const SCORE_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-blue-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  F: "bg-red-500",
};

const FUNNEL_STAGES = ["saved", "applied", "interview", "offer", "rejected"];
const FUNNEL_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};
const FUNNEL_COLORS: Record<string, string> = {
  saved: "bg-muted-foreground/40",
  applied: "bg-primary/60",
  interview: "bg-accent/70",
  offer: "bg-emerald-500",
  rejected: "bg-destructive/50",
};

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon size={18} className="text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { data: session } = useSession();
  const [data, setData] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/v1/analytics", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      })
        .then((r) => r.json())
        .then(setData)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [session]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalApps = Object.values(data?.application_funnel || {}).reduce((a, b) => a + b, 0);
  const interviewRate = totalApps > 0
    ? Math.round(((data?.application_funnel?.interview || 0) / totalApps) * 100)
    : 0;
  const offerRate = totalApps > 0
    ? Math.round(((data?.application_funnel?.offer || 0) / totalApps) * 100)
    : 0;

  const maxFunnelVal = Math.max(...FUNNEL_STAGES.map((s) => data?.application_funnel?.[s] || 0), 1);

  const scoreMax = Math.max(...(data?.score_distribution.map((s) => s.count) || [1]), 1);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BarChart className="text-primary" size={28} />
          Patterns & Analytics
        </h2>
        <p className="text-muted-foreground mt-1">
          Conversion rates, score distributions, and pipeline health.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Target}
          label="Total Evaluations"
          value={data?.total_evaluations || 0}
          sub="jobs analyzed"
        />
        <StatCard
          icon={Users}
          label="Total Applications"
          value={totalApps}
          sub="across all stages"
        />
        <StatCard
          icon={TrendingUp}
          label="Interview Rate"
          value={`${interviewRate}%`}
          sub="applied → interview"
        />
        <StatCard
          icon={BarChart}
          label="Offer Rate"
          value={`${offerRate}%`}
          sub="applied → offer"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>AI evaluation scores across all jobs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.score_distribution.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No evaluations yet.</p>
            )}
            {data?.score_distribution.map((item) => {
              const letter = item.score?.charAt(0).toUpperCase() || "?";
              const color = SCORE_COLORS[letter] || "bg-muted-foreground/40";
              const pct = Math.round((item.count / scoreMax) * 100);
              return (
                <div key={item.score} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-bold text-right">{item.score}</span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-sm text-muted-foreground text-right">{item.count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Application Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Application Funnel</CardTitle>
            <CardDescription>Stage-by-stage breakdown of your pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {FUNNEL_STAGES.map((stage) => {
              const count = data?.application_funnel?.[stage] || 0;
              const pct = Math.round((count / maxFunnelVal) * 100);
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="w-20 text-sm text-muted-foreground text-right capitalize">
                    {FUNNEL_LABELS[stage]}
                  </span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${FUNNEL_COLORS[stage]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-sm text-muted-foreground text-right">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Top Archetypes */}
      {(data?.top_archetypes?.length || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Role Archetypes</CardTitle>
            <CardDescription>Most common archetypes in your evaluated jobs.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data?.top_archetypes.map((a, i) => (
                <div key={a.archetype} className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-full px-4 py-2">
                  <span className="text-xs font-bold text-primary">#{i + 1}</span>
                  <span className="text-sm font-medium">{a.archetype}</span>
                  <Badge variant="outline" className="text-xs">{a.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalApps === 0 && data?.total_evaluations === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <BarChart size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No data yet</p>
          <p className="text-sm mt-1">
            Start evaluating jobs and tracking applications to see analytics here.
          </p>
        </div>
      )}
    </div>
  );
}
