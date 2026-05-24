"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, ExternalLink, Building2, MapPin, DollarSign, Calendar, Zap, AlertCircle, Globe, Radio } from "lucide-react";

// ─── Existing interfaces ───────────────────────────────────────────────────────

interface Job {
  source: string;
  id: string;
  title: string;
  company: string;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_display?: string;
  description: string;
  url: string;
  created: string;
  contract_type: string;
}

// ─── Smart Discovery interfaces ───────────────────────────────────────────────

interface DiscoveredJob {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  source: string | null;
  url: string | null;
  keyword_score: number;
  gemini_score: number | null;
  discovered_at: string;
  seen: boolean;
}

interface DiscoveryData {
  jobs: DiscoveredJob[];
  total: number;
  unseen: number;
  last_scanned_at: string | null;
}

interface ScanResult {
  new_count: number;
  total_count: number;
  unseen_count: number;
  last_scanned_at: string;
  cooldown_until: string;
  has_api_keys: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COUNTRY_OPTIONS = [
  { code: "gb", label: "🇬🇧 UK" },
  { code: "us", label: "🇺🇸 US" },
  { code: "in", label: "🇮🇳 India" },
  { code: "au", label: "🇦🇺 Australia" },
  { code: "ca", label: "🇨🇦 Canada" },
  { code: "de", label: "🇩🇪 Germany" },
  { code: "fr", label: "🇫🇷 France" },
  { code: "nl", label: "🇳🇱 Netherlands" },
  { code: "sg", label: "🇸🇬 Singapore" },
];

// ─── Existing helpers ─────────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null, display?: string): string {
  if (display && display.trim()) return display;
  if (min && max) return `$${Math.round(min / 1000)}k – $${Math.round(max / 1000)}k`;
  if (min) return `From $${Math.round(min / 1000)}k`;
  return "";
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000 / 60 / 60 / 24);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff}d ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return `${Math.floor(diff / 30)}mo ago`;
  } catch { return ""; }
}

// ─── Discovery helpers ────────────────────────────────────────────────────────

function getAvatarStyle(company: string): { bg: string; text: string } {
  const colors = [
    { bg: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-green-100", text: "text-green-700" },
    { bg: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-pink-100", text: "text-pink-700" },
    { bg: "bg-cyan-100", text: "text-cyan-700" },
    { bg: "bg-orange-100", text: "text-orange-700" },
    { bg: "bg-indigo-100", text: "text-indigo-700" },
  ];
  const idx = (company.charCodeAt(0) + (company.charCodeAt(1) || 0)) % colors.length;
  return colors[idx];
}

function getScoreTier(score: number): { badge: string; bar: string; label: string } {
  if (score >= 80) return { badge: "bg-green-100 text-green-700", bar: "bg-green-500", label: "Strong Match" };
  if (score >= 60) return { badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500", label: "Good Match" };
  return { badge: "bg-red-100 text-red-700", bar: "bg-red-500", label: "Weak Match" };
}

function getSourceBadgeStyle(source: string): string {
  if (source === "Greenhouse") return "bg-green-100 text-green-700";
  if (source === "Lever") return "bg-blue-100 text-blue-700";
  if (source === "Ashby") return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-600";
}

function isNewJob(discoveredAt: string): boolean {
  return Date.now() - new Date(discoveredAt).getTime() < 24 * 60 * 60 * 1000;
}

function cooldownMinutes(until: Date | null): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until.getTime() - Date.now()) / 60000));
}

// ─── Existing sub-components ──────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    Greenhouse: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    Lever:      "bg-blue-500/10 text-blue-700 border-blue-500/20",
    Ashby:      "bg-violet-500/10 text-violet-700 border-violet-500/20",
    Adzuna:     "bg-orange-500/10 text-orange-700 border-orange-500/20",
    Jooble:     "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
  };
  return (
    <Badge variant="outline" className={`text-xs shrink-0 ${colors[source] || ""}`}>
      {source}
    </Badge>
  );
}

function JobList({ jobs, selectedJob, onSelect }: {
  jobs: Job[];
  selectedJob: Job | null;
  onSelect: (j: Job) => void;
}) {
  return (
    <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
      {jobs.map((job, i) => (
        <button
          key={`${job.source}-${job.id}-${i}`}
          onClick={() => onSelect(job)}
          className={`w-full text-left bg-card border rounded-2xl p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ${
            selectedJob?.id === job.id && selectedJob?.source === job.source
              ? "border-primary/40 ring-1 ring-primary/20 shadow-md"
              : "hover:border-primary/20"
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm line-clamp-1">{job.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Building2 size={10} />{job.company || "Unknown"}
              </p>
            </div>
            <SourceBadge source={job.source} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {job.location && <span className="flex items-center gap-1"><MapPin size={10} />{job.location}</span>}
            {formatSalary(job.salary_min, job.salary_max, job.salary_display) && (
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <DollarSign size={10} />{formatSalary(job.salary_min, job.salary_max, job.salary_display)}
              </span>
            )}
            {job.contract_type && <span className="bg-muted rounded-full px-2 py-0.5">{job.contract_type}</span>}
            {job.created && <span className="flex items-center gap-1"><Calendar size={10} />{timeAgo(job.created)}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function DetailPanel({ job }: { job: Job | null }) {
  if (!job) return (
    <div className="rounded-2xl border-2 border-dashed border-border h-64 flex flex-col items-center justify-center text-center text-muted-foreground">
      <Zap size={32} className="mb-3 opacity-30" />
      <p className="font-medium">Select a job to see details</p>
      <p className="text-sm mt-1">Click any listing on the left</p>
    </div>
  );

  return (
    <Card className="sticky top-6">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg">{job.title}</CardTitle>
            <CardDescription className="mt-1">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1"><Building2 size={12} />{job.company}</span>
                {job.location && <span className="flex items-center gap-1"><MapPin size={12} />{job.location}</span>}
                <SourceBadge source={job.source} />
              </span>
            </CardDescription>
          </div>
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1.5 text-xs text-primary hover:underline shrink-0">
              <ExternalLink size={12} /> View posting
            </a>
          )}
        </div>
        {formatSalary(job.salary_min, job.salary_max, job.salary_display) && (
          <p className="text-sm font-semibold text-emerald-600 mt-2">
            💰 {formatSalary(job.salary_min, job.salary_max, job.salary_display)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground leading-relaxed max-h-48 overflow-y-auto">
          {job.description || "No description available. Click 'View posting' to read on site."}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            className="gap-2 rounded-full"
            onClick={() => {
              const url = `/evaluator?url=${encodeURIComponent(job.url)}&title=${encodeURIComponent(job.title)}&company=${encodeURIComponent(job.company)}&desc=${encodeURIComponent(job.description || "")}`;
              window.location.href = url;
            }}
          >
            <Zap size={14} /> Evaluate with AI
          </Button>
          {job.url && (
            <Button variant="outline" asChild>
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="gap-2">
                <ExternalLink size={14} /> Apply
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Scanner() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"live" | "portals" | "discovery">("live");

  // Live search (Adzuna + Jooble)
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("gb");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [hasApiKeys, setHasApiKeys] = useState<boolean | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Portal search (Greenhouse / Lever / Ashby)
  const [portalQuery, setPortalQuery] = useState("");
  const [portalCompany, setPortalCompany] = useState("");
  const [portalJobs, setPortalJobs] = useState<Job[]>([]);
  const [isPortalSearching, setIsPortalSearching] = useState(false);
  const [hasPortalSearched, setHasPortalSearched] = useState(false);
  const [selectedPortalJob, setSelectedPortalJob] = useState<Job | null>(null);

  // Smart Discovery
  const [discoveryData, setDiscoveryData] = useState<DiscoveryData | null>(null);
  const [discoveryFilter, setDiscoveryFilter] = useState<"all" | "new" | "high" | "dismissed">("new");
  const [isScanning, setIsScanning] = useState(false);
  const [scanCooldownUntil, setScanCooldownUntil] = useState<Date | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  const [userArchetypes, setUserArchetypes] = useState<string[]>([]);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/v1/settings/profile", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.target_roles)) setUserArchetypes(data.target_roles);
          if (data.country) setCountry(data.country.toLowerCase());
          if (data.location) setLocation(data.location);
        })
        .catch(console.error);
    }
  }, [session]);

  useEffect(() => {
    if (activeTab === "discovery") fetchDiscoveredJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Existing async handlers ──

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) { toast({ title: "Enter keywords", variant: "destructive" }); return; }
    setIsSearching(true); setJobs([]); setHasSearched(false);
    try {
      const params = new URLSearchParams({ q: query, location, country });
      const res = await fetch(`/api/v1/jobs/search?${params}`, {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      const data = await res.json();
      setJobs(data.jobs || []);
      setSources(data.sources || []);
      setHasApiKeys(data.has_api_keys);
      setHasSearched(true);
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally { setIsSearching(false); }
  };

  const handlePortalSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!portalQuery.trim() && !portalCompany.trim()) {
      toast({ title: "Enter keywords or company name", variant: "destructive" });
      return;
    }
    setIsPortalSearching(true); setPortalJobs([]); setHasPortalSearched(false);
    try {
      const params = new URLSearchParams();
      if (portalQuery.trim()) params.set("q", portalQuery);
      if (portalCompany.trim()) params.set("company", portalCompany);
      const res = await fetch(`/api/v1/jobs/portals?${params}`, {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      const data = await res.json();
      setPortalJobs(data.jobs || []);
      setHasPortalSearched(true);
    } catch (e: any) {
      toast({ title: "Portal search failed", description: e.message, variant: "destructive" });
    } finally { setIsPortalSearching(false); }
  };

  // ── Discovery async handlers ──

  const fetchDiscoveredJobs = async () => {
    if (!session?.user) return;
    setDiscoveryLoading(true);
    try {
      const res = await fetch("/api/v1/jobs/discovered", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      if (res.ok) setDiscoveryData(await res.json());
    } catch (e) {
      toast({ title: "Failed to load discovered jobs", variant: "destructive" });
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const triggerDiscoveryScan = async () => {
    if (!session?.user || isScanning) return;
    setIsScanning(true);
    try {
      const res = await fetch("/api/v1/jobs/discover", {
        method: "POST",
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: (data as any)?.error || "Scan failed", variant: "destructive" });
        return;
      }
      const scanResult = data as ScanResult;
      setScanCooldownUntil(new Date(scanResult.cooldown_until));
      if (!scanResult.has_api_keys) {
        toast({ title: "No API keys configured. Add ADZUNA or JOOBLE keys to find jobs.", variant: "destructive" });
      } else {
        toast({ title: scanResult.new_count > 0 ? `Found ${scanResult.new_count} new jobs!` : "No new jobs found — check back later." });
      }
      await fetchDiscoveredJobs();
    } catch (e) {
      toast({ title: "Scan failed", variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  const dismissJob = async (id: string) => {
    if (!session?.user) return;
    await fetch(`/api/v1/jobs/discovered/${id}/dismiss`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
    });
    setDiscoveryData(prev => prev ? { ...prev, jobs: prev.jobs.filter(j => j.id !== id) } : prev);
  };

  const markSeen = async (ids: string[]) => {
    if (!session?.user || ids.length === 0) return;
    await fetch("/api/v1/jobs/discovered/seen", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${(session as any)?.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_ids: ids }),
    });
  };

  // ── Render ──

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Zap className="text-primary" size={28} />
          Live Job Scanner
        </h2>
        <p className="text-muted-foreground mt-1">
          Real listings from Adzuna + Jooble (90+ countries) and direct company portals (Greenhouse / Lever / Ashby).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b flex-wrap">
        <button
          onClick={() => setActiveTab("live")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "live" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          🌐 Live Search (Adzuna + Jooble)
        </button>
        <button
          onClick={() => setActiveTab("portals")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "portals" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          🏢 Company Portals (Greenhouse / Lever / Ashby)
        </button>
        <button
          onClick={() => setActiveTab("discovery")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
            activeTab === "discovery" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Radio size={14} />
          Smart Discovery
          {discoveryData?.unseen ? (
            <span className="ml-1 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{discoveryData.unseen}</span>
          ) : null}
        </button>
      </div>

      {/* ── Live Search Tab ── */}
      {activeTab === "live" && (
        <>
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-1 space-y-2">
                    <Label>Role / Keywords</Label>
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
                    {userArchetypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {userArchetypes.slice(0, 4).map((a) => (
                          <button key={a} type="button" onClick={() => setQuery(a)}
                            className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20">{a}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. London, Bangalore, Remote" />
                  </div>
                  <div className="space-y-2">
                    <Label>Country (Adzuna)</Label>
                    <select value={country} onChange={(e) => setCountry(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      {COUNTRY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <Button type="submit" disabled={isSearching} className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20">
                  <Search size={16} />{isSearching ? "Scanning…" : "Scan Jobs"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {hasApiKeys === false && hasSearched && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">No API keys configured</p>
                <p className="text-xs mt-1">
                  Add <code className="bg-amber-500/10 px-1 rounded">ADZUNA_APP_ID</code> + <code className="bg-amber-500/10 px-1 rounded">ADZUNA_APP_KEY</code> (free: adzuna.com/developer)
                  and/or <code className="bg-amber-500/10 px-1 rounded">JOOBLE_API_KEY</code> (free: jooble.org/api/about) to backend <code className="bg-amber-500/10 px-1 rounded">.env</code>.
                </p>
              </div>
            </div>
          )}

          {sources.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Sources:</span>
              {sources.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
              <span>· {jobs.length} listings</span>
            </div>
          )}

          {isSearching && (
            <div className="grid md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
            </div>
          )}

          {!isSearching && jobs.length > 0 && (
            <div className="grid lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2"><JobList jobs={jobs} selectedJob={selectedJob} onSelect={setSelectedJob} /></div>
              <div className="lg:col-span-3"><DetailPanel job={selectedJob} /></div>
            </div>
          )}

          {!isSearching && hasSearched && jobs.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
              <Search size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No results found</p>
              <p className="text-sm mt-1">Try different keywords, location, or country</p>
            </div>
          )}

          {!hasSearched && !isSearching && (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
              <Zap size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Enter keywords and search</p>
              <p className="text-sm mt-1">Searches across Adzuna (12+ countries) and Jooble (71 countries)</p>
            </div>
          )}
        </>
      )}

      {/* ── Company Portals Tab ── */}
      {activeTab === "portals" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe size={18} className="text-primary" /> Direct Company Portals</CardTitle>
              <CardDescription>
                Searches Greenhouse, Lever, and Ashby job boards directly via their public APIs.
                50+ top tech companies including Stripe, Anthropic, OpenAI, Vercel, Replit, and more.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePortalSearch} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role / Keywords</Label>
                    <Input value={portalQuery} onChange={(e) => setPortalQuery(e.target.value)}
                      placeholder="e.g. Backend Engineer, Product Manager" />
                    {userArchetypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {userArchetypes.slice(0, 4).map((a) => (
                          <button key={a} type="button" onClick={() => setPortalQuery(a)}
                            className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20">{a}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Company Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input value={portalCompany} onChange={(e) => setPortalCompany(e.target.value)}
                      placeholder="e.g. Stripe, Vercel, Anthropic" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={isPortalSearching} className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20">
                    <Globe size={16} />{isPortalSearching ? "Searching portals…" : "Search Company Portals"}
                  </Button>
                  <p className="text-xs text-muted-foreground">Checks up to 15 companies per search · no API keys needed</p>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ATS provider info chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { label: "Greenhouse", cls: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20" },
              { label: "Lever",      cls: "bg-blue-500/10 text-blue-700 border border-blue-500/20" },
              { label: "Ashby",      cls: "bg-violet-500/10 text-violet-700 border border-violet-500/20" },
            ].map((p) => (
              <span key={p.label} className={`px-2.5 py-1 rounded-full font-medium ${p.cls}`}>{p.label}</span>
            ))}
            <span className="text-muted-foreground self-center">— public APIs, zero credentials required</span>
          </div>

          {isPortalSearching && (
            <div className="grid md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
            </div>
          )}

          {!isPortalSearching && portalJobs.length > 0 && (
            <div className="grid lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                  <Globe size={13} />
                  {portalJobs.length} matching roles across company portals
                </div>
                <JobList jobs={portalJobs} selectedJob={selectedPortalJob} onSelect={setSelectedPortalJob} />
              </div>
              <div className="lg:col-span-3"><DetailPanel job={selectedPortalJob} /></div>
            </div>
          )}

          {!isPortalSearching && hasPortalSearched && portalJobs.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
              <Globe size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No matching roles found</p>
              <p className="text-sm mt-1">Try broader keywords or a specific company name</p>
            </div>
          )}

          {!hasPortalSearched && !isPortalSearching && (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
              <Building2 size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Search directly in company ATS systems</p>
              <p className="text-sm mt-1 max-w-md mx-auto">
                Stripe, Anthropic, OpenAI, Vercel, Replit, Brex, Rippling, Airtable, Cloudflare and 40+ more. No API keys needed.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Smart Discovery Tab ── */}
      {activeTab === "discovery" && (
        <div className="flex gap-0 min-h-[600px]">
          {/* Sidebar — hidden on mobile */}
          <aside className="hidden lg:flex flex-col w-56 border-r border-border bg-card rounded-l-xl p-4 gap-4 flex-shrink-0">
            {/* Stats */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Discovery Stats</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total found</span>
                  <span className="font-medium">{discoveryData?.total ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">New jobs</span>
                  <span className="font-semibold text-blue-600">{discoveryData?.unseen ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">High match</span>
                  <span className="font-medium">{discoveryData?.jobs.filter(j => j.keyword_score >= 80).length ?? 0}</span>
                </div>
              </div>
            </div>
            <hr className="border-border" />
            {/* Filters */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Filter</p>
              <div className="space-y-1">
                {(([["all", "All Jobs"], ["new", "New Only"], ["high", "High Match"]] as const)).map(([f, label]) => (
                  <button key={f} onClick={() => setDiscoveryFilter(f)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      discoveryFilter === f ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-muted text-muted-foreground"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-auto space-y-2">
              <Button
                onClick={triggerDiscoveryScan}
                disabled={isScanning || cooldownMinutes(scanCooldownUntil) > 0}
                className="w-full"
                size="sm"
              >
                {isScanning
                  ? "Scanning..."
                  : cooldownMinutes(scanCooldownUntil) > 0
                    ? `Next scan in ${cooldownMinutes(scanCooldownUntil)}m`
                    : "▶ Scan Now"}
              </Button>
              {discoveryData?.last_scanned_at && (
                <p className="text-xs text-center text-muted-foreground">
                  Last scan {timeAgo(discoveryData.last_scanned_at)}
                </p>
              )}
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 p-4">
            {/* Mobile scan button */}
            <div className="lg:hidden flex gap-2 mb-4">
              <Button onClick={triggerDiscoveryScan} disabled={isScanning || cooldownMinutes(scanCooldownUntil) > 0} size="sm">
                {isScanning ? "Scanning..." : "▶ Scan Now"}
              </Button>
              {discoveryData?.last_scanned_at && (
                <span className="text-xs text-muted-foreground self-center">Last: {timeAgo(discoveryData.last_scanned_at)}</span>
              )}
            </div>

            {/* Mobile filter chips */}
            <div className="lg:hidden flex gap-2 mb-4 flex-wrap">
              {(["all", "new", "high"] as const).map(f => (
                <button key={f} onClick={() => setDiscoveryFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    discoveryFilter === f ? "bg-blue-600 text-white border-blue-600" : "border-border text-muted-foreground hover:border-blue-400"
                  }`}>
                  {f === "all" ? "All" : f === "new" ? "New" : "High Match"}
                </button>
              ))}
            </div>

            {discoveryLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
              </div>
            ) : !discoveryData || discoveryData.jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="size-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                  <Search size={24} className="text-blue-600" />
                </div>
                <h4 className="font-semibold mb-1">No discovered jobs yet</h4>
                <p className="text-sm text-muted-foreground mb-4">Click "Scan Now" to find jobs matching your profile.</p>
                <Button onClick={triggerDiscoveryScan} disabled={isScanning}>
                  {isScanning ? "Scanning..." : "▶ Scan Now"}
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {discoveryData.jobs
                  .filter(j => {
                    if (discoveryFilter === "new") return !j.seen;
                    if (discoveryFilter === "high") return j.keyword_score >= 80;
                    return true;
                  })
                  .map(job => {
                    const avatar = getAvatarStyle(job.company || "?");
                    const initials = (job.company || "?").slice(0, 2).toUpperCase();
                    const tier = getScoreTier(job.keyword_score);
                    const isNew = isNewJob(job.discovered_at);
                    return (
                      <div key={job.id}
                        className={`relative bg-card border rounded-xl p-4 hover:-translate-y-0.5 hover:shadow-md transition-all ${
                          isNew ? "border-l-[3px] border-l-blue-500" : "border-border"
                        }`}>
                        {/* Top row */}
                        <div className="flex items-start gap-3 mb-3">
                          <div
                            className={`size-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${avatar.bg} ${avatar.text}`}
                            aria-hidden="true">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm leading-tight truncate">{job.title || "Unknown Role"}</p>
                            <p className="text-xs text-muted-foreground">{job.company || "Unknown"}</p>
                          </div>
                          {isNew && (
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" aria-label="New job">
                              NEW<span className="sr-only"> job discovered today</span>
                            </span>
                          )}
                        </div>
                        {/* Pills */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {job.location && (
                            <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                              <MapPin size={10} />{job.location}
                            </span>
                          )}
                          {job.source && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getSourceBadgeStyle(job.source)}`}>
                              {job.source}
                            </span>
                          )}
                        </div>
                        {/* Score */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">Match Score</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tier.badge}`}>
                              {job.keyword_score}% · {tier.label}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${tier.bar}`}
                              style={{ width: `${job.keyword_score}%` }}
                              role="progressbar"
                              aria-valuenow={job.keyword_score}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            />
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                            {job.url ? (
                              <a href={`/evaluator?url=${encodeURIComponent(job.url)}`}
                                className="text-xs font-medium text-blue-600 hover:underline"
                                aria-label={`Evaluate ${job.title} at ${job.company}`}
                                onClick={() => markSeen([job.id])}>
                                Evaluate →
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">No URL</span>
                            )}
                            <button onClick={() => dismissJob(job.id)}
                              className="min-h-[44px] text-xs text-muted-foreground hover:text-red-500 transition-colors px-2"
                              aria-label={`Dismiss ${job.title} at ${job.company}`}>
                              Dismiss
                            </button>
                          </div>
                          <span className="text-xs text-muted-foreground">{timeAgo(job.discovered_at)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
