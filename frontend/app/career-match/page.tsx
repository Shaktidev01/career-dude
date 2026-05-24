"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Target, Sparkles, Plus, X, RefreshCw, History, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DEFAULT_ARCHETYPES = [
  "AI Platform / LLMOps",
  "Agentic / Automation",
  "Technical AI PM",
  "AI Solutions Architect",
  "AI Forward Deployed",
  "AI Transformation",
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "Data / ML Engineer",
  "DevOps / SRE",
];

const HISTORY_KEY = "career-match-history";
const MAX_HISTORY = 20;

interface MatchResult {
  archetypes_analyzed: string[];
  content: string;
}

interface HistoryEntry {
  id: string;
  date: string;
  archetypes: string[];
  topMatch: { archetype: string; pct: number } | null;
  content: string;
}

function extractTopMatch(content: string, archetypes: string[]): { archetype: string; pct: number } | null {
  // Find first archetype with a percentage near it
  let best: { archetype: string; pct: number } | null = null;
  for (const a of archetypes) {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escaped}[^\\n]{0,80}?(\\d{1,3})\\s*%`, "i");
    const m = content.match(re);
    if (m) {
      const pct = parseInt(m[1], 10);
      if (!best || pct > best.pct) best = { archetype: a, pct };
    }
  }
  return best;
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch { /* quota — ignore */ }
}

export default function CareerMatch() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [customArchetype, setCustomArchetype] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [hasCv, setHasCv] = useState<boolean | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/v1/settings/profile", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      })
        .then((r) => r.json())
        .then((data) => {
          setHasCv(!!data.master_profile_cv?.trim());
          if (Array.isArray(data.target_roles) && data.target_roles.length > 0) {
            setSelectedArchetypes(data.target_roles);
          }
        })
        .catch(() => setHasCv(false));
    }
  }, [session]);

  const toggleArchetype = (a: string) => {
    setSelectedArchetypes((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  };

  const addCustom = () => {
    const t = customArchetype.trim();
    if (!t) return;
    if (!selectedArchetypes.includes(t)) setSelectedArchetypes((prev) => [...prev, t]);
    setCustomArchetype("");
  };

  const handleAnalyze = async () => {
    if (selectedArchetypes.length === 0) {
      toast({ title: "Select at least one archetype", variant: "destructive" });
      return;
    }
    if (hasCv === false) {
      toast({ title: "No CV found", description: "Add CV in Settings first.", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/career-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify({ archetypes: selectedArchetypes }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }

      const data: MatchResult = await res.json();
      setResult(data);

      // Save to history
      const topMatch = extractTopMatch(data.content, data.archetypes_analyzed);
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        archetypes: data.archetypes_analyzed,
        topMatch,
        content: data.content,
      };
      const newHistory = [entry, ...history];
      setHistory(newHistory);
      saveHistory(newHistory);

      toast({ title: "Analysis complete", description: topMatch ? `Top: ${topMatch.archetype} — ${topMatch.pct}%` : undefined });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteEntry = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    saveHistory(next);
    if (expandedId === id) setExpandedId(null);
  };

  const clearHistory = () => {
    if (!confirm("Clear all past analyses? This cannot be undone.")) return;
    setHistory([]);
    saveHistory([]);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Target className="text-primary" size={28} />
          Career Matching
        </h2>
        <p className="text-muted-foreground mt-1">
          Score your CV against each target archetype. Find your best fit and your gaps.
        </p>
      </div>

      {hasCv === false && (
        <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 text-sm text-orange-700 dark:text-orange-400">
          <Target size={16} className="shrink-0" />
          No CV found. <a href="/settings" className="underline font-medium">Add your CV in Settings</a> to run career matching.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Select Target Archetypes</CardTitle>
          <CardDescription>
            Pre-filled from Settings target roles. Click to toggle, add custom below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DEFAULT_ARCHETYPES.map((a) => (
              <button
                key={a}
                onClick={() => toggleArchetype(a)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selectedArchetypes.includes(a)
                    ? "bg-primary/10 text-primary border-primary/30 shadow-sm shadow-primary/10"
                    : "bg-muted text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={customArchetype}
              onChange={(e) => setCustomArchetype(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              placeholder="Add custom archetype (e.g. Growth Engineer)..."
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button variant="outline" size="sm" onClick={addCustom} className="gap-1">
              <Plus size={14} /> Add
            </Button>
          </div>

          {selectedArchetypes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedArchetypes.map((a) => (
                <span key={a} className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-sm">
                  {a}
                  <button onClick={() => toggleArchetype(a)} className="hover:text-destructive transition-colors">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || selectedArchetypes.length === 0 || hasCv === false}
            className="gap-2 rounded-full shadow-lg shadow-primary/20"
          >
            {isAnalyzing ? (
              <><RefreshCw size={16} className="animate-spin" /> Analyzing {selectedArchetypes.length} archetypes…</>
            ) : (
              <><Sparkles size={16} /> Run Career Analysis ({selectedArchetypes.length})</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Current result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target size={18} className="text-primary" />
              Latest Career Fit Analysis
            </CardTitle>
            <CardDescription>
              Analyzed against:{" "}
              {result.archetypes_analyzed.map((a, i) => (
                <Badge key={i} variant="outline" className="text-xs mr-1 mb-1">{a}</Badge>
              ))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Past analyses */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History size={18} className="text-muted-foreground" />
                Past Analyses
              </CardTitle>
              <CardDescription>{history.length} previous run{history.length !== 1 ? "s" : ""} stored locally.</CardDescription>
            </div>
            <button onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
              <Trash2 size={12} /> Clear all
            </button>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((entry) => {
              const isOpen = expandedId === entry.id;
              return (
                <div key={entry.id} className="border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : entry.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {entry.topMatch && (
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                          entry.topMatch.pct >= 80 ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                          : entry.topMatch.pct >= 60 ? "bg-blue-500/10 text-blue-700 border-blue-500/30"
                          : "bg-amber-500/10 text-amber-700 border-amber-500/30"
                        }`}>
                          {entry.topMatch.pct}%
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {entry.topMatch ? entry.topMatch.archetype : `${entry.archetypes.length} archetype${entry.archetypes.length !== 1 ? "s" : ""}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.date).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {" · "}{entry.archetypes.length} roles analyzed
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); deleteEntry(entry.id); } }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </span>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/20 px-4 py-4">
                      <div className="flex flex-wrap gap-1 mb-3">
                        {entry.archetypes.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{a}</Badge>
                        ))}
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!result && !isAnalyzing && history.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <Target size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No analyses yet</p>
          <p className="text-sm mt-1">Select target archetypes above and click Run Career Analysis.</p>
        </div>
      )}
    </div>
  );
}
