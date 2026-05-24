"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Sparkles, Building2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Evaluation {
  id: string;
  job_title: string | null;
  company: string | null;
  ai_score: string | null;
}

export default function Research() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState("_manual");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [result, setResult] = useState<{ company: string; role: string; content: string } | null>(null);

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

  const handleEvalSelect = (evalId: string) => {
    setSelectedEvalId(evalId);
    if (evalId === "_manual") {
      setCompany("");
      setRole("");
      setJobDescription("");
      return;
    }
    const ev = evals.find((e) => e.id === evalId);
    if (ev) {
      setCompany(ev.company || "");
      setRole(ev.job_title || "");
    }
  };

  const handleResearch = async () => {
    if (!company.trim()) {
      toast({ title: "Company name required", variant: "destructive" });
      return;
    }
    setIsResearching(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        company: company.trim(),
        role: role.trim(),
      };
      if (selectedEvalId && selectedEvalId !== "_manual") {
        body.job_evaluation_id = selectedEvalId;
      }
      if (jobDescription.trim()) {
        body.job_description = jobDescription.trim();
      }

      const res = await fetch("/api/v1/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Research failed");
      }

      const data = await res.json();
      setResult(data);
      toast({ title: "Research complete!" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsResearching(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="text-primary" size={28} />
          Company Research
        </h2>
        <p className="text-muted-foreground mt-1">
          Deep intelligence report: business model, tech stack, culture signals, green/red flags, and interview talking points.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Research a Company</CardTitle>
          <CardDescription>
            Link to an existing evaluation to auto-fill, or enter manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Link to Evaluation (optional)</Label>
            <Select onValueChange={handleEvalSelect} value={selectedEvalId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an evaluation..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_manual">Enter manually</SelectItem>
                {evals.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.job_title || "Untitled"}
                    {e.company ? ` @ ${e.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="company">Company Name *</Label>
              <Input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Stripe, Notion, Vercel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Target Role</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="jd">Job Description (optional — improves research)</Label>
            <Textarea
              id="jd"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here for more targeted research..."
              className="min-h-[100px] font-mono text-sm"
            />
          </div>

          <Button
            onClick={handleResearch}
            disabled={isResearching || !company.trim()}
            className="gap-2 rounded-full shadow-lg shadow-primary/20"
          >
            <Sparkles size={16} />
            {isResearching ? "Researching..." : "Generate Research Report"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search size={18} className="text-primary" />
              Intelligence Report — {result.company}
              {result.role && <span className="text-muted-foreground font-normal text-sm">({result.role})</span>}
            </CardTitle>
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
          <Building2 size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No research yet</p>
          <p className="text-sm mt-1">
            Enter a company name above to generate a pre-interview intelligence report.
          </p>
        </div>
      )}
    </div>
  );
}
