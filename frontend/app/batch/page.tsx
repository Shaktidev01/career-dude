"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { GitCompare, Plus, Trash2, Sparkles, Trophy, AlertTriangle, CheckCircle } from "lucide-react";

interface JobSlot {
  id: number;
  title: string;
  company: string;
  description: string;
}

interface CompareResult {
  rank: number;
  title: string;
  company: string;
  score: string;
  archetype: string;
  match_pct: number;
  top_strengths: string[];
  top_gaps: string[];
  comp_range: string;
  verdict: string;
  block_g_flag: string;
}

function scoreColor(score: string | null) {
  if (!score) return "bg-muted-foreground/40";
  const s = score.toUpperCase();
  if (s.startsWith("A")) return "bg-emerald-500";
  if (s.startsWith("B")) return "bg-blue-500";
  if (s.startsWith("C")) return "bg-yellow-500";
  if (s.startsWith("D")) return "bg-orange-500";
  return "bg-red-500";
}

function LegitBadge({ flag }: { flag: string }) {
  if (flag === "LEGITIMATE")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle size={12} /> Legitimate
      </span>
    );
  if (flag === "SUSPICIOUS")
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertTriangle size={12} /> Suspicious
      </span>
    );
  return <span className="text-xs text-muted-foreground">Unverified</span>;
}

export default function CompareJobs() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [slots, setSlots] = useState<JobSlot[]>([
    { id: 1, title: "", company: "", description: "" },
    { id: 2, title: "", company: "", description: "" },
  ]);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  const addSlot = () => {
    if (slots.length >= 5) {
      toast({ title: "Maximum 5 jobs per comparison", variant: "destructive" });
      return;
    }
    setSlots((prev) => [...prev, { id: Date.now(), title: "", company: "", description: "" }]);
  };

  const removeSlot = (id: number) => {
    if (slots.length <= 2) {
      toast({ title: "Need at least 2 jobs to compare", variant: "destructive" });
      return;
    }
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSlot = (id: number, field: keyof JobSlot, value: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleCompare = async () => {
    const validSlots = slots.filter((s) => s.description.trim().length > 50);
    if (validSlots.length < 2) {
      toast({ title: "Need at least 2 jobs with descriptions (50+ chars)", variant: "destructive" });
      return;
    }

    setIsComparing(true);
    setResults([]);
    try {
      const res = await fetch("/api/v1/compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify({
          jobs: validSlots.map((s) => ({
            title: s.title || null,
            company: s.company || null,
            description: s.description,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Comparison failed");
      }

      const data = await res.json();
      setResults(data.ranked || []);
      toast({
        title: "Comparison complete!",
        description: `${data.credits_used} credits used. ${data.count} jobs ranked.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <GitCompare className="text-primary" size={28} />
          Parallel Job Comparison
        </h2>
        <p className="text-muted-foreground mt-1">
          Paste 2–5 job descriptions. AI evaluates all simultaneously and ranks them against your CV.
        </p>
      </div>

      {/* Job input slots */}
      <div className="grid md:grid-cols-2 gap-4">
        {slots.map((slot, i) => (
          <Card
            key={slot.id}
            className={
              results.length > 0 && i === 0
                ? "border-primary/40 ring-1 ring-primary/20"
                : ""
            }
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {results[i] && (
                  <span
                    className={`size-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${scoreColor(results[i]?.score)}`}
                  >
                    {results[i]?.score?.charAt(0)}
                  </span>
                )}
                Job {i + 1}
                {i === 0 && results.length > 0 && (
                  <Badge variant="default" className="text-xs gap-1 ml-1">
                    <Trophy size={10} /> Top Pick
                  </Badge>
                )}
              </CardTitle>
              <button
                onClick={() => removeSlot(slot.id)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
              >
                <Trash2 size={14} />
              </button>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Title</Label>
                  <Input
                    value={slot.title}
                    onChange={(e) => updateSlot(slot.id, "title", e.target.value)}
                    placeholder="Senior Engineer"
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Company</Label>
                  <Input
                    value={slot.company}
                    onChange={(e) => updateSlot(slot.id, "company", e.target.value)}
                    placeholder="Acme Corp"
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Job Description *</Label>
                <textarea
                  value={slot.description}
                  onChange={(e) => updateSlot(slot.id, "description", e.target.value)}
                  placeholder="Paste the full job description here..."
                  className="w-full min-h-[150px] mt-1 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          onClick={addSlot}
          disabled={slots.length >= 5}
          className="gap-2"
        >
          <Plus size={14} /> Add Job ({slots.length}/5)
        </Button>
        <Button
          onClick={handleCompare}
          disabled={isComparing}
          className="gap-2 rounded-full shadow-lg shadow-primary/20"
        >
          <Sparkles size={16} />
          {isComparing
            ? `Evaluating ${slots.filter((s) => s.description.trim().length > 50).length} jobs in parallel...`
            : `Compare Jobs (${slots.filter((s) => s.description.trim().length > 50).length} credits)`}
        </Button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-primary" />
            <h3 className="text-lg font-semibold">
              Ranked Results —{" "}
              <span className="text-primary">
                {results[0]?.title || results[0]?.company || "Job 1"}
              </span>{" "}
              wins
            </h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {results.map((result, i) => (
              <Card
                key={i}
                className={`relative overflow-hidden ${i === 0 ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
              >
                {i === 0 && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                    <Trophy size={10} /> #1 Best Fit
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <div
                      className={`size-11 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0 ${scoreColor(result.score)}`}
                    >
                      {result.score?.charAt(0) || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">
                        {result.title || `Job ${i + 1}`}
                      </CardTitle>
                      {result.company && (
                        <CardDescription className="truncate">{result.company}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs font-mono">
                      {result.score}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${scoreColor(result.score)}`}
                          style={{ width: `${result.match_pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {result.match_pct}%
                      </span>
                    </div>
                    <LegitBadge flag={result.block_g_flag} />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {result.archetype && (
                      <span className="inline-block text-xs bg-primary/10 text-primary rounded-full px-2.5 py-0.5">
                        {result.archetype}
                      </span>
                    )}
                    {result.comp_range && (
                      <span className="text-xs text-muted-foreground">💰 {result.comp_range}</span>
                    )}
                  </div>

                  {(result.top_strengths || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 mb-1">Strengths</p>
                      {result.top_strengths.map((s, si) => (
                        <p key={si} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-emerald-500 shrink-0">✓</span>
                          {s}
                        </p>
                      ))}
                    </div>
                  )}

                  {(result.top_gaps || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-orange-500 mb-1">Gaps</p>
                      {result.top_gaps.map((g, gi) => (
                        <p key={gi} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-orange-400 shrink-0">△</span>
                          {g}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="border-t pt-2">
                    <p className="text-xs italic text-muted-foreground">{result.verdict}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && !isComparing && (
        <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-muted-foreground">
          <GitCompare size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Paste job descriptions above to compare</p>
          <p className="text-sm mt-1">
            AI evaluates all jobs in parallel against your CV and ranks by fit score.
          </p>
        </div>
      )}
    </div>
  );
}
