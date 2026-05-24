"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, Globe, MapPin, History, Bookmark, Trash2, Clock } from "lucide-react";

interface Portal {
  id: string;
  name: string;
  logo: string;
  region: string[];
  description: string;
  buildUrl: (query: string, location: string) => string;
}

const PORTALS: Portal[] = [
  { id: "linkedin", name: "LinkedIn", logo: "💼", region: ["Global", "India"], description: "Largest professional network. Best for mid-senior roles.", buildUrl: (q, l) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent(l)}&f_TPR=r86400` },
  { id: "indeed", name: "Indeed", logo: "🔍", region: ["Global", "India", "US", "UK"], description: "Aggregator with the widest job coverage across all levels.", buildUrl: (q, l) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}&l=${encodeURIComponent(l)}&fromage=7` },
  { id: "glassdoor", name: "Glassdoor", logo: "🏢", region: ["Global", "US"], description: "Jobs + company reviews + salary data. Best for research.", buildUrl: (q, l) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(q)}&locT=C&locKeyword=${encodeURIComponent(l)}` },
  { id: "wellfound", name: "Wellfound (AngelList)", logo: "🚀", region: ["Global", "US"], description: "Best for startups, seed–Series C. Equity-focused roles.", buildUrl: (q, _l) => `https://wellfound.com/jobs?q=${encodeURIComponent(q)}` },
  { id: "ycombinator", name: "Y Combinator Jobs", logo: "🟧", region: ["Global", "US"], description: "Jobs at YC-backed companies. Remote-friendly, high quality.", buildUrl: (q, _l) => `https://www.ycombinator.com/jobs?q=${encodeURIComponent(q)}` },
  { id: "greenhouse", name: "Greenhouse Board", logo: "🌱", region: ["Global"], description: "Search across companies using Greenhouse ATS.", buildUrl: (q, _l) => `https://boards.greenhouse.io/search?q=${encodeURIComponent(q)}` },
  { id: "naukri", name: "Naukri", logo: "🇮🇳", region: ["India"], description: "India's largest job portal. Essential for Indian market.", buildUrl: (q, l) => { const loc = l.toLowerCase().replace(/\s+/g, "-"); const role = q.toLowerCase().replace(/\s+/g, "-"); return `https://www.naukri.com/${role}-jobs-in-${loc}`; } },
  { id: "instahyre", name: "Instahyre", logo: "⚡", region: ["India"], description: "AI-matched hiring. Strong for product & engineering roles in India.", buildUrl: (q, _l) => `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(q)}` },
  { id: "cutshort", name: "Cutshort", logo: "✂️", region: ["India"], description: "Tech-focused jobs in India. Good for startups and product companies.", buildUrl: (q, _l) => `https://cutshort.io/jobs?q=${encodeURIComponent(q)}` },
  { id: "foundit", name: "Foundit (ex-Monster)", logo: "🔎", region: ["India"], description: "Monster India rebranded. Large database, good for experienced roles.", buildUrl: (q, l) => `https://www.foundit.in/srp/results?query=${encodeURIComponent(q)}&location=${encodeURIComponent(l)}` },
  { id: "hirist", name: "Hirist", logo: "💻", region: ["India"], description: "Tech-only job board in India. Clean listings, verified companies.", buildUrl: (q, _l) => `https://www.hirist.tech/search/?q=${encodeURIComponent(q)}` },
  { id: "totaljobs", name: "Totaljobs", logo: "🇬🇧", region: ["UK"], description: "UK's leading job board covering all sectors.", buildUrl: (q, l) => `https://www.totaljobs.com/jobs/${encodeURIComponent(q)}/in-${encodeURIComponent(l)}` },
  { id: "reed", name: "Reed", logo: "🌸", region: ["UK"], description: "Largest UK job site with salary insights.", buildUrl: (q, l) => `https://www.reed.co.uk/jobs/${encodeURIComponent(q)}-jobs-in-${encodeURIComponent(l)}` },
  { id: "stepstone", name: "StepStone", logo: "🇩🇪", region: ["EU", "Germany"], description: "Largest job portal in Germany and wider Europe.", buildUrl: (q, l) => `https://www.stepstone.de/jobs/search?q=${encodeURIComponent(q)}&location=${encodeURIComponent(l)}` },
  { id: "seek", name: "SEEK", logo: "🇦🇺", region: ["Australia", "NZ"], description: "Australia and NZ's dominant job board.", buildUrl: (q, l) => `https://www.seek.com.au/${encodeURIComponent(q)}-jobs/in-${encodeURIComponent(l)}` },
  { id: "remoteok", name: "Remote OK", logo: "🌍", region: ["Remote", "Global"], description: "Remote-only jobs worldwide. No location required.", buildUrl: (q, _l) => `https://remoteok.com/remote-${encodeURIComponent(q.toLowerCase().replace(/\s+/g, "-"))}-jobs` },
  { id: "weworkremotely", name: "We Work Remotely", logo: "🏠", region: ["Remote", "Global"], description: "Curated remote jobs. Strong in engineering and design.", buildUrl: (q, _l) => `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(q)}` },
  // Adzuna and Jooble portal links
  { id: "adzuna", name: "Adzuna", logo: "📊", region: ["Global", "US", "UK", "India", "Australia"], description: "12+ countries, official API. Great salary data and job metadata.", buildUrl: (q, l) => `https://www.adzuna.com/search?q=${encodeURIComponent(q)}&loc=${encodeURIComponent(l)}` },
  { id: "jooble", name: "Jooble", logo: "🌐", region: ["Global", "India"], description: "71 countries including India. Aggregates from hundreds of local job sites.", buildUrl: (q, l) => `https://jooble.org/jobs-${encodeURIComponent(q.toLowerCase().replace(/\s+/g, "-"))}/${encodeURIComponent(l)}` },
];

const REGIONS = ["All", "Global", "India", "US", "UK", "EU", "Australia", "Remote"];

const SAVED_SEARCHES_KEY = "job-finder-saved-searches";
const MAX_SAVED = 10;

interface SavedSearch {
  id: string;
  query: string;
  location: string;
  region: string;
  portalCount: number;
  date: string;
}

function loadSaved(): SavedSearch[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || "[]"); } catch { return []; }
}
function saveSaved(s: SavedSearch[]) {
  try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(s.slice(0, MAX_SAVED))); } catch {}
}

export default function JobFinder() {
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [userArchetypes, setUserArchetypes] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  useEffect(() => { setSavedSearches(loadSaved()); }, []);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/v1/settings/profile", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.target_roles) && data.target_roles.length > 0) setUserArchetypes(data.target_roles);
          if (data.location) setLocation(data.location);
        })
        .catch(console.error);
    }
  }, [session]);

  const filteredPortals = PORTALS.filter((p) => selectedRegion === "All" || p.region.includes(selectedRegion));

  const recordSearch = () => {
    if (!query.trim()) return;
    const entry: SavedSearch = {
      id: crypto.randomUUID(),
      query: query.trim(),
      location: location.trim(),
      region: selectedRegion,
      portalCount: filteredPortals.length,
      date: new Date().toISOString(),
    };
    const next = [entry, ...savedSearches.filter((s) => !(s.query === entry.query && s.location === entry.location && s.region === entry.region))];
    setSavedSearches(next);
    saveSaved(next);
  };

  const handleOpen = (portal: Portal) => {
    recordSearch();
    window.open(portal.buildUrl(query || "software engineer", location || ""), "_blank", "noopener,noreferrer");
  };
  const handleOpenAll = () => {
    recordSearch();
    filteredPortals.forEach((p) => window.open(p.buildUrl(query || "software engineer", location || ""), "_blank", "noopener,noreferrer"));
  };

  const restoreSearch = (s: SavedSearch) => {
    setQuery(s.query);
    setLocation(s.location);
    setSelectedRegion(s.region);
  };

  const deleteSearch = (id: string) => {
    const next = savedSearches.filter((s) => s.id !== id);
    setSavedSearches(next);
    saveSaved(next);
  };

  const clearAllSearches = () => {
    if (!confirm("Clear all saved searches?")) return;
    setSavedSearches([]);
    saveSaved([]);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Search className="text-primary" size={28} /> Job Finder — Portal Directory
        </h2>
        <p className="text-muted-foreground mt-1">
          Pre-filled search links across 19 portals including Adzuna (12+ countries) and Jooble (71 countries incl. India).
          For live real-time results, use <a href="/scanner" className="text-primary hover:underline">Live Scanner</a>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configure Your Search</CardTitle>
          <CardDescription>Set your role and location. One click opens pre-filled searches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="role-query">Role / Keywords</Label>
              <Input id="role-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Senior Backend Engineer, AI Engineer..." />
              {userArchetypes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground">From profile:</span>
                  {userArchetypes.slice(0, 4).map((a) => (
                    <button key={a} onClick={() => setQuery(a)} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 hover:bg-primary/20 transition-colors">{a}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bangalore, London, New York, Remote..." />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Filter by Region</Label>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => (
                <button key={r} onClick={() => setSelectedRegion(r)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    selectedRegion === r ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}>
                  {r === "India" && "🇮🇳"}{r === "US" && "🇺🇸"}{r === "UK" && "🇬🇧"}{r === "Remote" && "🌍"}{r === "Australia" && "🇦🇺"}{r === "EU" && "🇪🇺"}
                  {r}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{filteredPortals.length} portals for <strong>{selectedRegion}</strong></p>
        <button onClick={handleOpenAll} className="text-sm text-primary hover:underline flex items-center gap-1">
          <Globe size={14} /> Open all ({filteredPortals.length})
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPortals.map((portal) => (
          <button key={portal.id} onClick={() => handleOpen(portal)}
            className="group text-left bg-card border rounded-2xl p-5 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 hover:border-primary/20">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{portal.logo}</span>
                <div>
                  <h3 className="font-semibold text-sm">{portal.name}</h3>
                  <div className="flex gap-1 mt-0.5">
                    {portal.region.map((r) => <Badge key={r} variant="outline" className="text-xs px-1.5 py-0">{r}</Badge>)}
                  </div>
                </div>
              </div>
              <ExternalLink size={14} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{portal.description}</p>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              <MapPin size={11} />{query || "software engineer"}{location ? ` · ${location}` : ""}
            </div>
          </button>
        ))}
      </div>

      {/* Saved searches */}
      {savedSearches.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History size={16} className="text-muted-foreground" />
                Recent Searches
              </CardTitle>
              <CardDescription>Click to restore. Stored locally on this device.</CardDescription>
            </div>
            <button onClick={clearAllSearches} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
              <Trash2 size={12} /> Clear
            </button>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {savedSearches.map((s) => (
                <div key={s.id} className="group flex items-center justify-between gap-2 border rounded-lg px-3 py-2 hover:border-primary/30 hover:bg-muted/30 transition-colors">
                  <button onClick={() => restoreSearch(s)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                      <Bookmark size={11} className="text-primary shrink-0" />
                      {s.query}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      {s.location && <span className="flex items-center gap-1"><MapPin size={9} />{s.location}</span>}
                      <span className="flex items-center gap-1"><Clock size={9} />{new Date(s.date).toLocaleDateString()}</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{s.region}</Badge>
                    </div>
                  </button>
                  <button onClick={() => deleteSearch(s.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-xl bg-muted/30 border border-border p-4 text-sm text-muted-foreground">
        <p className="font-medium mb-1">💡 Pro tip: use Live Scanner for real listings</p>
        <p>
          This page opens pre-filled searches in each portal. For real-time job results with salary data directly in the app, use the{" "}
          <a href="/scanner" className="text-primary hover:underline">Live Scanner</a> (powered by Adzuna + Jooble APIs).
        </p>
      </div>
    </div>
  );
}
