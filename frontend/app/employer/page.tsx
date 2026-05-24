"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, FileText, Users, HelpCircle, Sparkles, Copy, Check, Plus, Trash2, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Tab = "screen" | "jd-gen" | "questions" | "batch";

export default function EmployerMode() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("screen");

  // ── CV Screener ─────────────────────────────────────────────────────────
  const [screenJd, setScreenJd] = useState("");
  const [candidateCv, setCandidateCv] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [screenResult, setScreenResult] = useState("");
  const [isScreening, setIsScreening] = useState(false);

  // ── JD Generator ────────────────────────────────────────────────────────
  const [jdRole, setJdRole] = useState("");
  const [jdCompany, setJdCompany] = useState("");
  const [jdSeniority, setJdSeniority] = useState("Mid-level");
  const [jdWorkMode, setJdWorkMode] = useState("");
  const [jdSalary, setJdSalary] = useState("");
  const [jdRequirements, setJdRequirements] = useState("");
  const [jdResult, setJdResult] = useState("");
  const [isGeneratingJd, setIsGeneratingJd] = useState(false);
  const [copiedJd, setCopiedJd] = useState(false);

  // ── Interview Questions ──────────────────────────────────────────────────
  const [iqJd, setIqJd] = useState("");
  const [iqSeniority, setIqSeniority] = useState("Mid-level");
  const [iqFocus, setIqFocus] = useState<string[]>([]);
  const [iqResult, setIqResult] = useState("");
  const [isGeneratingIq, setIsGeneratingIq] = useState(false);

  // ── Batch Candidate Scoring ──────────────────────────────────────────────
  const [batchJd, setBatchJd] = useState("");
  interface Candidate { id: number; name: string; cv: string; }
  const [candidates, setCandidates] = useState<Candidate[]>([
    { id: 1, name: "", cv: "" },
    { id: 2, name: "", cv: "" },
  ]);
  const [batchResults, setBatchResults] = useState<any[]>([]);
  const [isBatching, setIsBatching] = useState(false);

  const authHeader = { Authorization: `Bearer ${(session as any)?.accessToken}` };

  const FOCUS_OPTIONS = ["Technical Skills", "Leadership", "Communication", "Problem Solving", "Culture Fit", "System Design", "Data Structures", "Product Thinking"];
  const SENIORITY_OPTIONS = ["Junior", "Mid-level", "Senior", "Staff / Principal", "Director / VP"];

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleScreenCv = async () => {
    if (!screenJd.trim() || !candidateCv.trim()) {
      toast({ title: "Provide both JD and candidate CV", variant: "destructive" }); return;
    }
    setIsScreening(true); setScreenResult("");
    try {
      const res = await fetch("/api/v1/employer/screen-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ job_description: screenJd, candidate_cv: candidateCv, candidate_name: candidateName || "Candidate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScreenResult(data.report);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setIsScreening(false); }
  };

  const handleGenerateJd = async () => {
    if (!jdRole.trim()) { toast({ title: "Enter a role title", variant: "destructive" }); return; }
    setIsGeneratingJd(true); setJdResult("");
    try {
      const res = await fetch("/api/v1/employer/generate-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ role_title: jdRole, company: jdCompany, seniority: jdSeniority, work_mode: jdWorkMode, salary_range: jdSalary, requirements: jdRequirements }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJdResult(data.job_description);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setIsGeneratingJd(false); }
  };

  const handleGenerateQuestions = async () => {
    if (!iqJd.trim()) { toast({ title: "Paste the job description", variant: "destructive" }); return; }
    setIsGeneratingIq(true); setIqResult("");
    try {
      const res = await fetch("/api/v1/employer/interview-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ job_description: iqJd, seniority: iqSeniority, focus_areas: iqFocus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIqResult(data.questions);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setIsGeneratingIq(false); }
  };

  const handleBatchScore = async () => {
    const valid = candidates.filter((c) => c.name.trim() && c.cv.trim());
    if (!batchJd.trim() || valid.length < 1) {
      toast({ title: "Provide JD and at least 1 candidate", variant: "destructive" }); return;
    }
    setIsBatching(true); setBatchResults([]);
    try {
      const res = await fetch("/api/v1/employer/score-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ job_description: batchJd, candidates: valid.map((c) => ({ name: c.name, cv: c.cv })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBatchResults(data.candidates || []);
      toast({ title: `Scored ${data.count} candidates`, description: `${data.credits_used} credits used` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setIsBatching(false); }
  };

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const TABS: { id: Tab; label: string; icon: any; desc: string }[] = [
    { id: "screen", label: "CV Screener", icon: FileText, desc: "Screen a candidate CV against a JD" },
    { id: "jd-gen", label: "JD Generator", icon: Sparkles, desc: "AI-write a compelling job description" },
    { id: "questions", label: "Interview Questions", icon: HelpCircle, desc: "Generate question bank for any role" },
    { id: "batch", label: "Batch Scoring", icon: Users, desc: "Score multiple candidates in parallel" },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="text-primary" size={28} />
            Employer Mode
          </h2>
          <p className="text-muted-foreground mt-1">
            AI-powered hiring tools: screen candidates, generate JDs, create interview question banks.
          </p>
        </div>
        <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30 text-sm px-3 py-1">
          Employer
        </Badge>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              tab === t.id
                ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CV Screener ── */}
      {tab === "screen" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Job Description</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={screenJd}
                  onChange={(e) => setScreenJd(e.target.value)}
                  className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                  placeholder="Paste the full job description here…"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Candidate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="e.g. John Smith" className="mt-1" />
                </div>
                <div>
                  <Label>CV / Resume (paste as text)</Label>
                  <textarea
                    value={candidateCv}
                    onChange={(e) => setCandidateCv(e.target.value)}
                    className="w-full min-h-[200px] mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                    placeholder="Paste candidate CV here…"
                  />
                </div>
                <Button onClick={handleScreenCv} disabled={isScreening} className="w-full gap-2 rounded-full">
                  <FileText size={14} />
                  {isScreening ? "Screening…" : "Screen Candidate (1 Credit)"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div>
            {screenResult ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    Screening Report — {candidateName || "Candidate"}
                    <button onClick={() => copyToClipboard(screenResult, () => {})} className="text-muted-foreground hover:text-foreground p-1">
                      <Copy size={14} />
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{screenResult}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ) : isScreening ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-64">
                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full" />
                <p className="text-sm font-medium">AI is screening the candidate…</p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border h-64 flex flex-col items-center justify-center text-center text-muted-foreground">
                <FileText size={32} className="mb-3 opacity-30" />
                <p className="font-medium">Screening report appears here</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── JD Generator ── */}
      {tab === "jd-gen" && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Role Details</CardTitle>
              <CardDescription>Fill in what you can — AI fills the gaps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Role Title *</Label>
                <Input value={jdRole} onChange={(e) => setJdRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input value={jdCompany} onChange={(e) => setJdCompany(e.target.value)} placeholder="Acme Corp" />
                </div>
                <div className="space-y-2">
                  <Label>Seniority</Label>
                  <select value={jdSeniority} onChange={(e) => setJdSeniority(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    {SENIORITY_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Work Mode</Label>
                  <Input value={jdWorkMode} onChange={(e) => setJdWorkMode(e.target.value)} placeholder="Remote / Hybrid / On-site" />
                </div>
                <div className="space-y-2">
                  <Label>Salary Range</Label>
                  <Input value={jdSalary} onChange={(e) => setJdSalary(e.target.value)} placeholder="$120k–$160k" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Key Requirements / Notes</Label>
                <textarea
                  value={jdRequirements}
                  onChange={(e) => setJdRequirements(e.target.value)}
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="5+ years Go, Postgres, Kubernetes, fintech experience preferred…"
                />
              </div>
              <Button onClick={handleGenerateJd} disabled={isGeneratingJd} className="w-full gap-2 rounded-full">
                <Sparkles size={14} />
                {isGeneratingJd ? "Generating…" : "Generate JD (1 Credit)"}
              </Button>
            </CardContent>
          </Card>

          <div>
            {jdResult ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    Generated Job Description
                    <button onClick={() => copyToClipboard(jdResult, setCopiedJd)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-secondary transition-colors">
                      {copiedJd ? <><Check size={12} className="text-emerald-500" /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{jdResult}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ) : isGeneratingJd ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-64">
                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full" />
                <p className="text-sm font-medium">Generating job description…</p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border h-64 flex flex-col items-center justify-center text-center text-muted-foreground">
                <Sparkles size={32} className="mb-3 opacity-30" />
                <p className="font-medium">JD appears here</p>
                <p className="text-sm mt-1">Fill the form and generate</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Interview Questions ── */}
      {tab === "questions" && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Role & Focus</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Job Description *</Label>
                <textarea
                  value={iqJd}
                  onChange={(e) => setIqJd(e.target.value)}
                  className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Paste the job description…"
                />
              </div>
              <div className="space-y-2">
                <Label>Seniority Level</Label>
                <select value={iqSeniority} onChange={(e) => setIqSeniority(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {SENIORITY_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Focus Areas (optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {FOCUS_OPTIONS.map((f) => (
                    <button key={f}
                      onClick={() => setIqFocus((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        iqFocus.includes(f) ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-transparent hover:border-border"
                      }`}
                    >{f}</button>
                  ))}
                </div>
              </div>
              <Button onClick={handleGenerateQuestions} disabled={isGeneratingIq} className="w-full gap-2 rounded-full">
                <HelpCircle size={14} />
                {isGeneratingIq ? "Generating…" : "Generate Questions (1 Credit)"}
              </Button>
            </CardContent>
          </Card>

          <div>
            {iqResult ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    Interview Question Bank
                    <button onClick={() => copyToClipboard(iqResult, () => {})}
                      className="text-muted-foreground hover:text-foreground p-1"><Copy size={14} /></button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none max-h-[70vh] overflow-y-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{iqResult}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ) : isGeneratingIq ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-64">
                <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full" />
                <p className="text-sm font-medium">Generating 25 questions…</p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border h-64 flex flex-col items-center justify-center text-center text-muted-foreground">
                <HelpCircle size={32} className="mb-3 opacity-30" />
                <p className="font-medium">25 structured questions appear here</p>
                <p className="text-sm mt-1">Technical, behavioral, design, and culture fit</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Batch Scoring ── */}
      {tab === "batch" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Description</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={batchJd}
                onChange={(e) => setBatchJd(e.target.value)}
                className="w-full min-h-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Paste the job description to screen candidates against…"
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Candidates ({candidates.length}/10)</h3>
              <Button variant="outline" size="sm" onClick={() => {
                if (candidates.length < 10) setCandidates((p) => [...p, { id: Date.now(), name: "", cv: "" }]);
              }} className="gap-1">
                <Plus size={13} /> Add Candidate
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {candidates.map((c, i) => (
                <Card key={c.id}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">Candidate {i + 1}</CardTitle>
                    <button onClick={() => {
                      if (candidates.length > 1) setCandidates((p) => p.filter((x) => x.id !== c.id));
                    }} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 size={13} />
                    </button>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Input
                      value={c.name}
                      onChange={(e) => setCandidates((p) => p.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))}
                      placeholder="Candidate name"
                      className="h-8 text-sm"
                    />
                    <textarea
                      value={c.cv}
                      onChange={(e) => setCandidates((p) => p.map((x) => x.id === c.id ? { ...x, cv: e.target.value } : x))}
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Paste CV here…"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button onClick={handleBatchScore} disabled={isBatching}
              className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20">
              <Users size={16} />
              {isBatching
                ? `Scoring ${candidates.filter((c) => c.name && c.cv).length} candidates…`
                : `Score All Candidates (${candidates.filter((c) => c.name && c.cv).length} credits)`}
            </Button>
          </div>

          {batchResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Candidate Reports</h3>
              {batchResults.map((r, i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{r.candidate}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.report}</ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
