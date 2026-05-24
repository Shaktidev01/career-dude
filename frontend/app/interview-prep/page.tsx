"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Mic, Sparkles, ChevronRight, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Evaluation {
  id: string;
  job_title: string | null;
  company: string | null;
  ai_score: string | null;
}

interface PrepSheet {
  id: string;
  content: string;
  linked_job_id: string | null;
  created_at: string;
}

function scoreVariant(score: string | null): "default" | "secondary" | "outline" | "destructive" {
  if (!score) return "secondary";
  const s = score.toUpperCase();
  if (s.startsWith("A")) return "default";
  if (s.startsWith("B")) return "secondary";
  if (s.startsWith("C")) return "outline";
  return "destructive";
}

export default function InterviewPrep() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [savedSheets, setSavedSheets] = useState<PrepSheet[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeSheet, setActiveSheet] = useState<PrepSheet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session?.user) fetchData();
  }, [session]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${(session as any)?.accessToken}` };
      const [evalsRes, sheetsRes] = await Promise.all([
        fetch("/api/v1/evaluations", { headers }),
        fetch("/api/v1/interview-prep", { headers }),
      ]);
      if (evalsRes.ok) setEvals(await evalsRes.json());
      if (sheetsRes.ok) setSavedSheets(await sheetsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedEvalId) {
      toast({ title: "Select a job evaluation first", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/v1/interview-prep", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify({ job_evaluation_id: selectedEvalId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }

      const sheet: PrepSheet = await res.json();
      setActiveSheet(sheet);
      setSavedSheets((prev) => [sheet, ...prev]);
      toast({ title: "Interview prep generated!", description: "1 AI credit used." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Mic className="text-primary" size={28} />
          Interview Prep
        </h2>
        <p className="text-muted-foreground mt-1">
          STAR+R stories, expected technical questions, and red-flag probes — mapped to the JD.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate Prep Sheet</CardTitle>
          <CardDescription>
            Select an evaluated job. The AI maps your CV experience to the JD requirements as STAR+R stories.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select onValueChange={setSelectedEvalId} value={selectedEvalId}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select a job evaluation..." />
            </SelectTrigger>
            <SelectContent>
              {evals.length === 0 ? (
                <SelectItem value="_none" disabled>
                  No evaluations yet — evaluate a job first
                </SelectItem>
              ) : (
                evals.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <div className="flex items-center gap-2">
                      <span>{e.job_title || "Untitled"}</span>
                      {e.company && (
                        <span className="text-muted-foreground">@ {e.company}</span>
                      )}
                      {e.ai_score && (
                        <Badge variant={scoreVariant(e.ai_score)} className="text-xs ml-1">
                          {e.ai_score}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedEvalId}
            className="gap-2 rounded-full shadow-lg shadow-primary/20"
          >
            <Sparkles size={16} />
            {isGenerating
              ? "Generating... (this takes ~30s)"
              : "Generate Interview Prep (1 credit)"}
          </Button>
        </CardContent>
      </Card>

      {/* Active prep sheet */}
      {activeSheet && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              Interview Prep Sheet
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setActiveSheet(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {activeSheet.content}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved sheets list */}
      {savedSheets.length > 0 && !activeSheet && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Prep Sheets</CardTitle>
            <CardDescription>Click to view a previously generated prep sheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {savedSheets.map((sheet) => (
              <button
                key={sheet.id}
                onClick={() => setActiveSheet(sheet)}
                className="w-full text-left flex items-center justify-between px-4 py-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-primary shrink-0" />
                  <span className="text-sm font-medium">
                    Prep Sheet — {new Date(sheet.created_at).toLocaleDateString()}
                  </span>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {savedSheets.length === 0 && !activeSheet && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <Mic size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No prep sheets yet</p>
          <p className="text-sm mt-1">
            Select a job evaluation above and generate your first interview prep sheet.
          </p>
        </div>
      )}
    </div>
  );
}
