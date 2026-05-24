"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GitBranch, ExternalLink, Trophy, Briefcase, Users, Star } from "lucide-react";

interface PipelineItem {
  id: string;
  status: string;
  notes: string | null;
  job_title: string | null;
  company: string | null;
  ai_score: string | null;
  archetype: string | null;
  job_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// DB statuses + display labels
const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "saved",     label: "Evaluated",   color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "applied",   label: "Applied",     color: "text-violet-600 bg-violet-50 border-violet-200" },
  { value: "interview", label: "Interview",   color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "offer",     label: "Offer 🎉",    color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { value: "rejected",  label: "Rejected",    color: "text-red-500 bg-red-50 border-red-200" },
];

const STATUS_DISPLAY: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]));
const STATUS_COLOR: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.color]));

type FilterTab = "all" | "saved" | "applied" | "interview" | "top" | "rejected";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "saved",     label: "Evaluated" },
  { key: "applied",   label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "top",       label: "Top (A grade)" },
  { key: "rejected",  label: "Rejected" },
];

function scoreGrade(score: string | null): number {
  if (!score) return 0;
  const s = score.toUpperCase().trim();
  if (s === "A+") return 5;
  if (s === "A")  return 4;
  if (s === "A-") return 3;
  if (s === "B+") return 2.5;
  if (s === "B")  return 2;
  if (s === "B-") return 1.5;
  if (s === "C")  return 1;
  return 0;
}

function isTopGrade(score: string | null): boolean {
  if (!score) return false;
  const s = score.toUpperCase().trim();
  return s === "A+" || s === "A" || s === "A-";
}

function ScoreBadge({ score }: { score: string | null }) {
  if (!score) return <span className="text-muted-foreground text-sm">—</span>;
  const s = score.toUpperCase();
  let cls = "text-xs font-bold px-2.5 py-1 rounded-lg border ";
  if (s.startsWith("A")) cls += "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
  else if (s.startsWith("B")) cls += "bg-blue-500/10 text-blue-700 border-blue-500/30";
  else if (s.startsWith("C")) cls += "bg-amber-500/10 text-amber-700 border-amber-500/30";
  else cls += "bg-red-500/10 text-red-700 border-red-500/30";
  return <span className={cls}>{score}</span>;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

export default function Pipeline() {
  const { data: session } = useSession();
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchPipeline = useCallback(() => {
    if (!session?.user) return;
    fetch("/api/v1/pipeline", {
      headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [session]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await fetch(`/api/v1/pipeline/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify({ status }),
      });
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
    } catch (e) { console.error(e); }
    finally { setUpdatingId(null); }
  };

  // Stats
  const active = items.filter(i => !["rejected"].includes(i.status));
  const interviews = items.filter(i => i.status === "interview");
  const bestItem = [...items].sort((a, b) => scoreGrade(b.ai_score) - scoreGrade(a.ai_score))[0];

  // Filter
  const filtered = items.filter((item) => {
    if (filter === "all")       return true;
    if (filter === "top")       return isTopGrade(item.ai_score);
    return item.status === filter;
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="text-primary" size={28} />
          Application Pipeline
        </h2>
        <p className="text-muted-foreground mt-1">
          Track and manage your job applications. Update status inline as you progress.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Briefcase className="text-primary" size={18} />
          </div>
          <div>
            <p className="text-2xl font-bold">{active.length}</p>
            <p className="text-xs text-muted-foreground">Active Apps</p>
          </div>
        </div>
        <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Users className="text-amber-600" size={18} />
          </div>
          <div>
            <p className="text-2xl font-bold">{interviews.length}</p>
            <p className="text-xs text-muted-foreground">Interviews</p>
          </div>
        </div>
        <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Trophy className="text-emerald-600" size={18} />
          </div>
          <div>
            <p className="text-2xl font-bold">{bestItem?.ai_score || "—"}</p>
            <p className="text-xs text-muted-foreground">Best Score</p>
          </div>
        </div>
        <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
          <div className="size-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Star className="text-violet-600" size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{bestItem?.company || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{bestItem?.archetype || "Best Match"}</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b">
        {FILTER_TABS.map((tab) => {
          const count = tab.key === "all" ? items.length
            : tab.key === "top" ? items.filter(i => isTopGrade(i.ai_score)).length
            : items.filter(i => i.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                filter === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                filter === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-16 text-center text-muted-foreground">
          <GitBranch size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-base">Pipeline empty</p>
          <p className="text-sm mt-1">Evaluate a job and save it to tracker — it appears here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <p className="font-medium">No applications in this filter</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company & Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28 hidden md:table-cell">Added</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Archetype</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors group">
                  {/* Company & Role */}
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate max-w-xs">{item.job_title || "Untitled Role"}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.company || "Unknown Company"}</p>
                    </div>
                  </td>

                  {/* Score */}
                  <td className="px-4 py-3">
                    <ScoreBadge score={item.ai_score} />
                  </td>

                  {/* Status inline dropdown */}
                  <td className="px-4 py-3">
                    <div className="relative">
                      <select
                        value={item.status}
                        disabled={updatingId === item.id}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                        className={`text-xs font-medium rounded-lg border px-2 py-1.5 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-50 ${STATUS_COLOR[item.status] || "bg-muted text-muted-foreground border-border"}`}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs opacity-60">▾</span>
                    </div>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {formatDate(item.created_at)}
                  </td>

                  {/* Archetype */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {item.archetype ? (
                      <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{item.archetype}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.job_url && (
                        <a
                          href={item.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="View job posting"
                        >
                          <ExternalLink size={12} /> Apply
                        </a>
                      )}
                      <a
                        href={`/evaluator?title=${encodeURIComponent(item.job_title || "")}&company=${encodeURIComponent(item.company || "")}`}
                        className="text-xs text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Re-evaluate"
                      >
                        Report
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
            Showing {filtered.length} of {items.length} applications
          </div>
        </div>
      )}
    </div>
  );
}
