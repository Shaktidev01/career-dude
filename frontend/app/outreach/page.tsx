"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, Sparkles, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Evaluation {
  id: string;
  job_title: string | null;
  company: string | null;
  ai_score: string | null;
}

export default function Outreach() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState("");
  const [recruiterName, setRecruiterName] = useState("");
  const [recruiterRole, setRecruiterRole] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{ company: string; role: string; content: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/v1/evaluations", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      })
        .then((r) => r.json())
        .then(setEvals)
        .catch(console.error);
    }
  }, [session]);

  const handleGenerate = async () => {
    if (!selectedEvalId) {
      toast({ title: "Select a job evaluation first", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = { job_evaluation_id: selectedEvalId };
      if (recruiterName.trim()) body.recruiter_name = recruiterName.trim();
      if (recruiterRole.trim()) body.recruiter_role = recruiterRole.trim();

      const res = await fetch("/api/v1/outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }

      const data = await res.json();
      setResult(data);
      toast({ title: "Outreach messages generated!" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (result?.content) {
      navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard!" });
    }
  };

  const selectedEval = evals.find((e) => e.id === selectedEvalId);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Send className="text-primary" size={28} />
          LinkedIn Outreach
        </h2>
        <p className="text-muted-foreground mt-1">
          Personalized connection requests and message variants — no templates, no clichés.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate Outreach Messages</CardTitle>
          <CardDescription>
            Select an evaluated job. Optionally add the recruiter's name for personalization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Job Evaluation *</Label>
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
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedEval && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <Send size={14} className="text-primary" />
              Generating outreach for{" "}
              <strong className="text-foreground">
                {selectedEval.job_title || "this role"}
              </strong>{" "}
              at{" "}
              <strong className="text-foreground">
                {selectedEval.company || "this company"}
              </strong>
              {selectedEval.ai_score && (
                <Badge variant="outline" className="text-xs ml-auto">
                  {selectedEval.ai_score}
                </Badge>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="recruiter-name">Recruiter Name (optional)</Label>
              <Input
                id="recruiter-name"
                value={recruiterName}
                onChange={(e) => setRecruiterName(e.target.value)}
                placeholder="e.g. Sarah Chen"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recruiter-role">Their Role (optional)</Label>
              <Input
                id="recruiter-role"
                value={recruiterRole}
                onChange={(e) => setRecruiterRole(e.target.value)}
                placeholder="e.g. Engineering Recruiter"
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedEvalId}
            className="gap-2 rounded-full shadow-lg shadow-primary/20"
          >
            <Sparkles size={16} />
            {isGenerating ? "Generating messages..." : "Generate Outreach"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send size={18} className="text-primary" />
                Outreach Messages — {result.company}
              </CardTitle>
              <CardDescription className="mt-1">{result.role}</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCopy}>
              {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy All"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result.content}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {!result && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <Send size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No outreach generated yet</p>
          <p className="text-sm mt-1">
            Select a job evaluation to generate personalized LinkedIn outreach messages.
          </p>
        </div>
      )}
    </div>
  );
}
