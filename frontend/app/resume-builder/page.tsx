"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface JobEvaluation {
  id: string;
  job_title: string;
  company: string;
  ai_score: string;
}

export default function ResumeBuilder() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [evaluations, setEvaluations] = useState<JobEvaluation[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAsset, setGeneratedAsset] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user) {
      fetchEvaluations();
    }
  }, [session]);

  const fetchEvaluations = async () => {
    try {
      const res = await fetch("/api/v1/evaluations", {
        headers: {
          "Authorization": `Bearer ${(session as any)?.accessToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setEvaluations(data);
      }
    } catch (e) {
      console.error("Failed to fetch evaluations", e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const handleGenerate = async (type: "resume" | "cover_letter") => {
    if (!selectedJobId) {
      toast({
        title: "No Job Selected",
        description: "Please select a job evaluation first.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedAsset(null);

    try {
      const res = await fetch("/api/v1/assets/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${(session as any)?.accessToken}`
        },
        body: JSON.stringify({
          linked_job_id: selectedJobId,
          asset_type: type
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate asset");
      }

      const data = await res.json();
      setGeneratedAsset(data.content);
      
      toast({
        title: "Generation Complete!",
        description: `Your tailored ${type === "resume" ? "ATS Resume" : "Cover Letter"} is ready.`,
      });
    } catch (e: any) {
      toast({
        title: "Generation Failed",
        description: e.message,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Resume & Cover Letter Generator</h2>
        <p className="text-muted-foreground">1-click ATS PDF & Cover letter generation based on an evaluated job.</p>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6 border-b">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {isLoadingJobs ? (
              <Skeleton className="h-10 w-full md:max-w-md" />
            ) : (
              <select 
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="flex h-10 w-full md:max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a previously evaluated job...</option>
                {evaluations.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.job_title || "Unknown Role"} @ {job.company || "Unknown"} ({job.ai_score || "N/A"})
                  </option>
                ))}
              </select>
            )}
            
            <Button 
              onClick={() => handleGenerate("resume")}
              disabled={!selectedJobId || isGenerating}
              className="whitespace-nowrap"
            >
              {isGenerating ? "Generating..." : "Generate ATS Resume (1 Credit)"}
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => handleGenerate("cover_letter")}
              disabled={!selectedJobId || isGenerating}
              className="whitespace-nowrap"
            >
              Generate Cover Letter
            </Button>
          </div>
        </div>
        
        <div className="p-6 bg-secondary/20 min-h-[400px]">
          {!generatedAsset && !isGenerating && (
            <div className="flex h-full items-center justify-center flex-col text-center space-y-2 text-muted-foreground max-w-sm mx-auto mt-24">
              <FileTextIcon className="size-12 opacity-20" />
              <p>Select a job evaluation above to generate a perfectly tailored, ATS-friendly resume and cover letter.</p>
            </div>
          )}

          {isGenerating && (
            <div className="flex h-full items-center justify-center flex-col mt-24 space-y-4 text-muted-foreground">
              <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full"></div>
              <p>AI is writing your customized document...</p>
            </div>
          )}

          {generatedAsset && (
            <Card className="bg-background shadow-none border-dashed border-2">
              <CardContent className="p-8">
                <div className="flex justify-end mb-4">
                  <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(generatedAsset)}>
                    Copy Markdown
                  </Button>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-xs">
                  {generatedAsset}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FileTextIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}
