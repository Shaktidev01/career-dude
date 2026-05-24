import Link from "next/link";
import {
  Search, FileText, ClipboardList, BarChart, Mic, Send,
  Briefcase, Sparkles, Shield, Zap, Target, Brain
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "7-Block AI Evaluation",
    description: "Career Ops A-G methodology: role match, CV gaps, comp data, interview prep, and posting legitimacy.",
  },
  {
    icon: FileText,
    title: "ATS Resume Generator",
    description: "Keyword-optimized resumes tailored to each job. Gemini Pro rewrites your CV with the JD's vocabulary.",
  },
  {
    icon: ClipboardList,
    title: "Application Tracker",
    description: "Kanban board from Saved to Offer. Drag and drop. Never lose track of where you stand.",
  },
  {
    icon: Target,
    title: "Archetype Detection",
    description: "Auto-classifies roles into 11 archetypes and adapts your framing to match.",
  },
  {
    icon: Mic,
    title: "Interview Prep",
    description: "STAR+R stories mapped to JD requirements. Company research and red-flag questions.",
  },
  {
    icon: BarChart,
    title: "Pipeline Analytics",
    description: "Conversion rates, score distributions, and time-to-offer metrics across your search.",
  },
];

const stats = [
  { value: "7", label: "Evaluation Blocks" },
  { value: "11", label: "Role Archetypes" },
  { value: "15-20", label: "Keywords Extracted" },
  { value: "A-F", label: "Scoring System" },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-bg" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Briefcase size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Career Dude</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              className="text-sm font-medium bg-primary text-primary-foreground px-5 py-2.5 rounded-full hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </div>
        </nav>

        <div className="relative z-10 max-w-4xl mx-auto text-center px-6 pt-20 pb-28">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-6 animate-fade-in">
            <Sparkles size={14} />
            Powered by Career Ops methodology
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 animate-slide-up">
            Your AI-powered
            <br />
            <span className="gradient-text">career command center</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Evaluate jobs with 7-block analysis, generate ATS-optimized resumes,
            prep for interviews, and track your pipeline — all in one place.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Link
              href="/onboarding"
              className="bg-primary text-primary-foreground px-8 py-3.5 rounded-full text-base font-semibold hover:bg-primary/90 transition-all shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-0.5"
            >
              Start Free
            </Link>
            <Link
              href="#features"
              className="text-muted-foreground hover:text-foreground px-8 py-3.5 rounded-full text-base font-medium border border-border hover:border-foreground/20 transition-all"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y bg-card/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold gradient-text">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Everything you need to land the right job
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Built on the Career Ops open-source methodology. AI evaluates and recommends — you decide and act.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="group relative bg-card rounded-2xl border p-6 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="size-11 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-4 group-hover:from-primary/20 group-hover:to-accent/20 transition-colors">
                <feature.icon size={20} className="text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-accent p-12 text-center text-white">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/3" />
          <div className="relative z-10">
            <Shield size={40} className="mx-auto mb-4 opacity-80" />
            <h2 className="text-3xl font-bold mb-3">Ready to take control of your job search?</h2>
            <p className="text-white/80 mb-8 max-w-lg mx-auto">
              Your data stays on your machine. AI evaluates — you decide. No auto-applications, ever.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 bg-white text-primary px-8 py-3.5 rounded-full font-semibold hover:bg-white/90 transition-all shadow-xl hover:-translate-y-0.5"
            >
              <Zap size={16} />
              Get Started Free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>Built on <a href="https://github.com/santifer/career-ops" target="_blank" rel="noopener" className="text-primary hover:underline">Career Ops</a> open-source methodology</p>
      </footer>
    </main>
  );
}
