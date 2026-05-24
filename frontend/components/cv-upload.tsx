"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Upload, Loader2, Check, AlertCircle } from "lucide-react";

interface CvUploadProps {
  onMarkdownReady: (markdown: string) => void;
  currentCv?: string;
}

export function CvUpload({ onMarkdownReady, currentCv }: CvUploadProps) {
  const { data: session, status } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [fileName, setFileName] = useState("");

  const isAuthenticated = status !== "loading" && !!session;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes("pdf")) {
      setUploadStatus("error");
      setStatusMessage("Only PDF files are supported");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadStatus("error");
      setStatusMessage("File too large. Maximum 10MB.");
      return;
    }

    setFileName(file.name);
    setIsUploading(true);
    setUploadStatus("idle");
    setStatusMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use public endpoint when not signed in (onboarding), authed endpoint otherwise
      const endpoint = isAuthenticated
        ? "/api/v1/settings/upload-cv"
        : "/api/v1/convert-pdf";

      const headers: Record<string, string> = {};
      if (isAuthenticated) {
        headers["Authorization"] = `Bearer ${(session as any)?.accessToken}`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      setUploadStatus("success");
      setStatusMessage(`Converted ${data.chars.toLocaleString()} characters to Markdown`);
      onMarkdownReady(data.markdown);
    } catch (err: any) {
      setUploadStatus("error");
      setStatusMessage(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isUploading
            ? "border-primary/30 bg-primary/5"
            : uploadStatus === "success"
              ? "border-accent/30 bg-accent/5"
              : uploadStatus === "error"
                ? "border-destructive/30 bg-destructive/5"
                : "border-border hover:border-primary/40 hover:bg-primary/5"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="text-primary animate-spin" />
            <div>
              <p className="text-sm font-medium">Converting {fileName}...</p>
              <p className="text-xs text-muted-foreground">
                Extracting text and formatting as Markdown
              </p>
            </div>
          </div>
        ) : uploadStatus === "success" ? (
          <div className="flex flex-col items-center gap-2">
            <div className="size-10 rounded-full bg-accent/10 flex items-center justify-center">
              <Check size={20} className="text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-accent">{fileName} converted!</p>
              <p className="text-xs text-muted-foreground">{statusMessage}</p>
            </div>
          </div>
        ) : uploadStatus === "error" ? (
          <div className="flex flex-col items-center gap-2">
            <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle size={20} className="text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-destructive">{statusMessage}</p>
              <p className="text-xs text-muted-foreground">Click to try again</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Upload your resume PDF</p>
              <p className="text-xs text-muted-foreground">
                PDF up to 10MB — auto-converted to Markdown via AI
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">OR</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </div>
  );
}
