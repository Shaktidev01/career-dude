"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CvUpload } from "@/components/cv-upload";

const ARCHETYPES = [
  "AI Platform / LLMOps", "Agentic / Automation", "Technical AI PM",
  "AI Solutions Architect", "AI Forward Deployed", "AI Transformation",
  "Frontend Engineer", "Backend Engineer", "Full Stack Engineer",
  "Data / ML Engineer", "DevOps / SRE",
];
const WORK_TYPES = ["Full-time", "Part-time", "Internship", "Contract"];
const WORK_MODES = ["Remote", "Hybrid", "On-Site"];
const COUNTRIES = [
  { code: "US", name: "United States", currency: "USD", symbol: "$", flag: "🇺🇸" },
  { code: "IN", name: "India", currency: "INR", symbol: "₹", flag: "🇮🇳" },
  { code: "GB", name: "United Kingdom", currency: "GBP", symbol: "£", flag: "🇬🇧" },
  { code: "DE", name: "Germany", currency: "EUR", symbol: "€", flag: "🇩🇪" },
  { code: "FR", name: "France", currency: "EUR", symbol: "€", flag: "🇫🇷" },
  { code: "NL", name: "Netherlands", currency: "EUR", symbol: "€", flag: "🇳🇱" },
  { code: "AU", name: "Australia", currency: "AUD", symbol: "A$", flag: "🇦🇺" },
  { code: "CA", name: "Canada", currency: "CAD", symbol: "C$", flag: "🇨🇦" },
  { code: "SG", name: "Singapore", currency: "SGD", symbol: "S$", flag: "🇸🇬" },
  { code: "AE", name: "UAE", currency: "AED", symbol: "AED", flag: "🇦🇪" },
  { code: "JP", name: "Japan", currency: "JPY", symbol: "¥", flag: "🇯🇵" },
  { code: "CH", name: "Switzerland", currency: "CHF", symbol: "Fr", flag: "🇨🇭" },
  { code: "SE", name: "Sweden", currency: "SEK", symbol: "kr", flag: "🇸🇪" },
  { code: "BR", name: "Brazil", currency: "BRL", symbol: "R$", flag: "🇧🇷" },
  { code: "OTHER", name: "Other", currency: "USD", symbol: "$", flag: "🌍" },
];

export default function Settings() {
  const { data: session } = useSession();
  const { toast } = useToast();

  // Account
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("");
  const [credits, setCredits] = useState(0);
  // CV
  const [cv, setCv] = useState("");
  // Targets
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  const [selectedWorkModes, setSelectedWorkModes] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [dealbreakers, setDealbreakers] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCountry = COUNTRIES.find((c) => c.code === country);
  const currencySymbol = selectedCountry?.symbol ?? "$";
  const currencyCode = selectedCountry?.currency ?? "USD";

  const toggle = (val: string, list: string[], setter: (v: string[]) => void) =>
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  useEffect(() => {
    if (session?.user) fetchProfile();
  }, [session]);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/v1/settings/profile", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setName(data.name || "");
        setEmail(data.email || "");
        setCv(data.master_profile_cv || "");
        setTier(data.subscription_tier || "free");
        setCredits(data.ai_credits_balance || 0);
        setCountry(data.country || "");
        setLocation(data.location || "");
        setMinSalary(data.min_salary?.toString() || "");
        setMaxSalary(data.max_salary?.toString() || "");
        if (Array.isArray(data.target_roles)) setSelectedArchetypes(data.target_roles);
        if (Array.isArray(data.work_types)) setSelectedWorkTypes(data.work_types);
        if (Array.isArray(data.work_modes)) setSelectedWorkModes(data.work_modes);
        if (Array.isArray(data.dealbreakers)) setDealbreakers(data.dealbreakers.join(", "));
      }
    } catch (e) {
      console.error("Failed to fetch profile", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (cv) body.master_profile_cv = cv;
      if (country) { body.country = country; body.salary_currency = currencyCode; }
      if (location) body.location = location;
      if (selectedArchetypes.length) body.target_roles = selectedArchetypes;
      if (selectedWorkTypes.length) body.work_types = selectedWorkTypes;
      if (selectedWorkModes.length) body.work_modes = selectedWorkModes;
      if (minSalary) body.min_salary = parseInt(minSalary, 10);
      if (maxSalary) body.max_salary = parseInt(maxSalary, 10);
      if (dealbreakers.trim()) {
        body.dealbreakers = dealbreakers.split(",").map((d) => d.trim()).filter(Boolean);
      }

      const res = await fetch("/api/v1/settings/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      toast({ title: "Settings Saved", description: "Your profile and preferences have been updated." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-[400px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings & Profile</h2>
        <p className="text-muted-foreground">Manage your CV, preferences, and job filters — used by every AI evaluation.</p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Account
            <div className="flex gap-2">
              <Badge variant="outline">{tier}</Badge>
              <Badge variant="secondary">{credits} credits</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input value={email} disabled />
          </div>
        </CardContent>
      </Card>

      {/* Master CV */}
      <Card>
        <CardHeader>
          <CardTitle>Master CV (Markdown)</CardTitle>
          <CardDescription>Source of truth for all AI evaluations, resume generation, and career matching.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CvUpload onMarkdownReady={(md) => setCv(md)} currentCv={cv} />
          <textarea
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            className="w-full min-h-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="# John Doe&#10;&#10;## Experience&#10;&#10;### Senior Engineer @ Acme Corp&#10;- Built scalable systems..."
          />
        </CardContent>
      </Card>

      {/* Target Roles */}
      <Card>
        <CardHeader>
          <CardTitle>Target Role Archetypes</CardTitle>
          <CardDescription>AI uses these to score North Star fit and career match analysis.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ARCHETYPES.map((a) => (
              <button
                key={a}
                onClick={() => toggle(a, selectedArchetypes, setSelectedArchetypes)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selectedArchetypes.includes(a)
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Location & Work Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Location & Work Preferences</CardTitle>
          <CardDescription>Injected into every job evaluation — flags mismatches automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Country + City */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select country…</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">City / Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco, Bangalore"
              />
            </div>
          </div>

          {/* Employment Type */}
          <div>
            <Label className="mb-3 block">Employment Type</Label>
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => toggle(t, selectedWorkTypes, setSelectedWorkTypes)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    selectedWorkTypes.includes(t)
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Work Mode */}
          <div>
            <Label className="mb-3 block">Work Mode</Label>
            <div className="flex flex-wrap gap-2">
              {WORK_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => toggle(m, selectedWorkModes, setSelectedWorkModes)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    selectedWorkModes.includes(m)
                      ? "bg-accent/10 text-accent border-accent/30"
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Salary Range */}
          <div>
            <Label className="mb-3 block">
              Salary Range
              {selectedCountry && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  ({currencyCode} — {selectedCountry.flag} {selectedCountry.name})
                </span>
              )}
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">{currencySymbol}</span>
                <Input type="number" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} placeholder="Min" className="pl-8" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">min</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">{currencySymbol}</span>
                <Input type="number" value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} placeholder="Max" className="pl-8" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">max</span>
              </div>
            </div>
          </div>

          {/* Dealbreakers */}
          <div className="space-y-2">
            <Label htmlFor="dealbreakers">Dealbreakers <span className="text-muted-foreground font-normal text-xs">(comma-separated — AI flags if present)</span></Label>
            <Input
              id="dealbreakers"
              value={dealbreakers}
              onChange={(e) => setDealbreakers(e.target.value)}
              placeholder="e.g. On-site 5 days, No 401k, Requires relocation"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="rounded-full px-6">
          {isSaving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
