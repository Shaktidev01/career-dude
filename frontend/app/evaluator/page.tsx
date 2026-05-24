"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function getScoreColor(score: string) {
  if (!score) return "bg-muted text-muted-foreground";
  const s = score.toUpperCase();
  if (s.startsWith("A")) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (s.startsWith("B")) return "bg-blue-500/15 text-blue-700 border-blue-500/30";
  if (s.startsWith("C")) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return "bg-red-500/15 text-red-700 border-red-500/30";
}

export default function JobEvaluator() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [jobUrl, setJobUrl] = useState(searchParams.get("url") || "");
  const [jobTitle, setJobTitle] = useState(searchParams.get("title") || "");
  const [company, setCompany] = useState(searchParams.get("company") || "");
  const [rawDescription, setRawDescription] = useState(searchParams.get("desc") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawDescription.trim() && !jobUrl.trim()) {
      toast({
        title: "Input Required",
        description: "Paste a job description or provide a job URL.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/v1/evaluations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify({
          job_url: jobUrl || undefined,
          raw_description: rawDescription,
          job_title: jobTitle || "Untitled Role",
          company: company || "Unknown Company",
        }),
      });

      const contentType = res.headers.get("content-type");
      if (contentType && !contentType.includes("application/json")) {
        const textError = await res.text();
        throw new Error(`Non-JSON response: ${textError}. Is the backend running?`);
      }

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Evaluation failed");
      }

      const data = await res.json();
      setResult(data);
      toast({
        title: "Career Ops Evaluation Complete",
        description: `Score: ${data.ai_score || "N/A"} — ${data.archetype || "Unknown archetype"}`,
      });
    } catch (err: any) {
      toast({
        title: "Evaluation Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Job Evaluator</h2>
        <p className="text-muted-foreground">
          Career Ops 7-block (A-G) evaluation: role match, CV gaps, comp, interview prep, and posting legitimacy.
        </p>
      </div>

      {!result ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Submit Job Details</CardTitle>
              <CardDescription>
                Paste a URL <span className="font-medium text-foreground">or</span> the full job description. Costs 1 AI Credit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input
                      id="jobTitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Senior Engineer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Acme Inc"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobUrl">
                    Job URL
                    <span className="ml-2 text-xs text-accent font-normal">AI fetches & extracts automatically</span>
                  </Label>
                  <Input
                    id="jobUrl"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    placeholder="https://jobs.lever.co/... or LinkedIn, Greenhouse, etc."
                  />
                </div>

                {jobUrl.trim() && !rawDescription.trim() && (
                  <div className="text-xs text-muted-foreground bg-accent/5 border border-accent/20 rounded-lg px-3 py-2">
                    ✓ URL provided — AI will fetch and extract the job description automatically.
                    Paste description below to override.
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="rawDescription">
                    Job Description
                    {!jobUrl.trim() && <span className="text-destructive ml-1">*</span>}
                    {jobUrl.trim() && <span className="ml-2 text-xs text-muted-foreground font-normal">(optional if URL given)</span>}
                  </Label>
                  <textarea
                    id="rawDescription"
                    value={rawDescription}
                    onChange={(e) => setRawDescription(e.target.value)}
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder={jobUrl.trim() ? "Leave blank to auto-fetch from URL above, or paste to override…" : "Paste the full job description here..."}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading
                    ? (rawDescription.trim() ? "Running Career Ops evaluation…" : "Fetching job from URL & evaluating…")
                    : "Evaluate Job (1 Credit)"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Evaluation Results</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {isLoading ? (
                <div className="flex flex-col h-full items-center justify-center space-y-4 text-muted-foreground min-h-[300px]">
                  <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full"></div>
                  <div className="text-center">
                    <p className="font-medium">Running Career Ops A-G evaluation...</p>
                    <p className="text-xs mt-1">This takes 15-30 seconds for a thorough analysis.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full items-center justify-center text-center space-y-3 text-muted-foreground min-h-[300px]">
                  <div className="size-16 rounded-full bg-secondary flex items-center justify-center text-2xl">
                    🎯
                  </div>
                  <div>
                    <p className="font-medium">Paste a URL or description to get:</p>
                    <ul className="text-xs mt-2 space-y-1 text-left max-w-xs mx-auto">
                      <li>A) Role Summary & Archetype</li>
                      <li>B) CV Match with gap analysis</li>
                      <li>C) Level & Strategy</li>
                      <li>D) Comp & Market data</li>
                      <li>E) CV Personalization plan</li>
                      <li>F) Interview prep (STAR+R)</li>
                      <li>G) Posting legitimacy check</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-bold px-4 py-2 rounded-lg border ${getScoreColor(result.ai_score)}`}>
                {result.ai_score || "N/A"}
              </div>
              <div>
                <h3 className="text-xl font-semibold">
                  {result.job_title || "Unknown Role"} — {result.company || "Unknown"}
                </h3>
                <div className="flex gap-2 mt-1">
                  {result.archetype && (
                    <Badge variant="secondary">{result.archetype}</Badge>
                  )}
                  {result.job_url && (
                    <a
                      href={result.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline underline-offset-4"
                    >
                      View posting
                    </a>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={() => setResult(null)}>
              New Evaluation
            </Button>
          </div>

          {result.missing_skills && result.missing_skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm font-medium text-muted-foreground mr-1">Gaps:</span>
              {result.missing_skills.map((skill: string, idx: number) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="bg-destructive/10 text-destructive border-destructive/20"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-6 md:p-8">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:border-b prose-headings:pb-2 prose-headings:mb-4 prose-h2:text-lg prose-h2:font-bold prose-h3:text-base prose-table:text-xs prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.evaluation_report || "No report generated."}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
