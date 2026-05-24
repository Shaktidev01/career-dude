"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  User, FileText, Target, ChevronRight, ChevronLeft, Check, Briefcase, Sparkles,
} from "lucide-react";
import { CvUpload } from "@/components/cv-upload";

const ARCHETYPES = [
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

const steps = [
  { icon: User, label: "Profile", description: "Name and basic info" },
  { icon: FileText, label: "Your CV", description: "Paste your master CV" },
  { icon: Target, label: "Targets", description: "Roles, salary, dealbreakers" },
];

export default function Onboarding() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(0);

  // Step 1
  const [name, setName] = useState("");
  // Step 2
  const [cv, setCv] = useState("");
  // Step 3
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  const [selectedWorkModes, setSelectedWorkModes] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [dealbreakers, setDealbreakers] = useState("");

  const selectedCountry = COUNTRIES.find((c) => c.code === country);
  const currencySymbol = selectedCountry?.symbol ?? "$";
  const currencyCode = selectedCountry?.currency ?? "USD";

  const toggle = (val: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const handleFinish = () => {
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (cv) data.master_profile_cv = cv;
    if (selectedArchetypes.length) data.target_roles = selectedArchetypes;
    if (country) data.country = country;
    if (location) data.location = location;
    if (selectedWorkTypes.length) data.work_types = selectedWorkTypes;
    if (selectedWorkModes.length) data.work_modes = selectedWorkModes;
    if (minSalary) data.min_salary = parseInt(minSalary, 10);
    if (maxSalary) data.max_salary = parseInt(maxSalary, 10);
    if (country) data.salary_currency = currencyCode;
    if (dealbreakers.trim()) {
      data.dealbreakers = dealbreakers.split(",").map((d) => d.trim()).filter(Boolean);
    }
    sessionStorage.setItem("onboarding_data", JSON.stringify(data));
    toast({ title: "Almost there!", description: "Sign in or create an account to save your profile." });
    router.push("/login?onboarded=1");
  };

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20 mb-4">
            <Briefcase size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold">Welcome to Career Dude</h1>
          <p className="text-muted-foreground mt-1">
            Let's set up your profile so the AI can work for you.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  i === step
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : i < step
                      ? "bg-accent/15 text-accent"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? (
                  <Check size={14} />
                ) : (
                  <s.icon size={14} />
                )}
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <ChevronRight size={16} className="text-muted-foreground/40" />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-card border rounded-2xl shadow-xl shadow-black/5 p-8 animate-slide-up">
          {/* Step 1: Profile */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <User size={20} className="text-primary" />
                  Create Your Profile
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This helps the AI personalize evaluations.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="h-12"
                />
              </div>
            </div>
          )}

          {/* Step 2: CV */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileText size={20} className="text-primary" />
                  Your CV
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload a PDF or paste as Markdown. This is the source of truth for all evaluations.
                </p>
              </div>
              <CvUpload onMarkdownReady={(md) => setCv(md)} currentCv={cv} />
              <textarea
                value={cv}
                onChange={(e) => setCv(e.target.value)}
                className="flex min-h-[300px] w-full rounded-xl border border-input bg-transparent px-4 py-3 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={"# Jane Doe\n\n## Experience\n\n### Senior Engineer @ Acme Corp (2022-Present)\n- Built scalable distributed systems serving 10M+ users\n- Led migration from monolith to microservices\n\n## Skills\n- Rust, Go, TypeScript\n- PostgreSQL, Redis, Kafka"}
              />
            </div>
          )}

          {/* Step 3: Targets */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Target size={20} className="text-primary" />
                  Set Your Targets
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Help the AI filter and prioritize the right opportunities.
                </p>
              </div>

              {/* Role Archetypes */}
              <div>
                <Label className="mb-3 block">Target Role Archetypes</Label>
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
              </div>

              {/* Country + Location */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="flex h-12 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="h-12"
                  />
                </div>
              </div>

              {/* Work Type */}
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
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">
                      {currencySymbol}
                    </span>
                    <Input
                      type="number"
                      value={minSalary}
                      onChange={(e) => setMinSalary(e.target.value)}
                      placeholder="Min"
                      className="h-12 pl-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">min</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">
                      {currencySymbol}
                    </span>
                    <Input
                      type="number"
                      value={maxSalary}
                      onChange={(e) => setMaxSalary(e.target.value)}
                      placeholder="Max"
                      className="h-12 pl-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">max</span>
                  </div>
                </div>
              </div>

              {/* Dealbreakers */}
              <div className="space-y-2">
                <Label htmlFor="dealbreakers">Dealbreakers <span className="text-muted-foreground font-normal text-xs">(comma-separated)</span></Label>
                <Input
                  id="dealbreakers"
                  value={dealbreakers}
                  onChange={(e) => setDealbreakers(e.target.value)}
                  placeholder="On-site 5 days, No 401k, Requires relocation"
                  className="h-12"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            <Button
              variant="ghost"
              onClick={() => setStep(step - 1)}
              disabled={step === 0}
              className="gap-1"
            >
              <ChevronLeft size={16} /> Back
            </Button>

            {step < 2 ? (
              <Button
                onClick={() => setStep(step + 1)}
                className="gap-1 rounded-full px-6 shadow-lg shadow-primary/20"
              >
                Continue <ChevronRight size={16} />
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                className="gap-2 rounded-full px-6 bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/20 hover:shadow-xl"
              >
                <Sparkles size={16} />
                Continue to Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Skip */}
        <div className="text-center mt-4">
          <button
            onClick={() => router.push("/login")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now — sign in
          </button>
        </div>
      </div>
    </div>
  );
}
