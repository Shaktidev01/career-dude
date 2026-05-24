"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle, Clock } from "lucide-react";

interface Followup {
  id: string;
  action_type: string;
  due_date: string | null;
  completed: boolean;
  app_status: string | null;
  job_title: string | null;
  company: string | null;
}

function isOverdue(due_date: string | null) {
  if (!due_date) return false;
  return new Date(due_date) < new Date();
}

export default function Followups() {
  const { data: session } = useSession();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/v1/followups", {
        headers: { Authorization: `Bearer ${(session as any)?.accessToken}` },
      })
        .then((r) => r.json())
        .then((d) => setFollowups(d.followups || []))
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [session]);

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const pending = followups.filter((f) => !f.completed);
  const done = followups.filter((f) => f.completed);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="text-primary" size={28} />
          Follow-up Cadence
        </h2>
        <p className="text-muted-foreground mt-1">
          Action items and follow-up tasks linked to your applications.
        </p>
      </div>

      {followups.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <Bell size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No follow-ups yet</p>
          <p className="text-sm mt-1">
            Follow-up tasks will appear here as your applications progress through stages.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Pending ({pending.length})
              </h3>
              {pending.map((f) => {
                const overdue = isOverdue(f.due_date);
                return (
                  <div
                    key={f.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border ${overdue ? "border-destructive/30 bg-destructive/5" : "bg-card"}`}
                  >
                    <Clock size={16} className={`shrink-0 mt-0.5 ${overdue ? "text-destructive" : "text-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{f.action_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.job_title || "Unknown role"}{f.company ? ` @ ${f.company}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {f.due_date && (
                        <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {overdue ? "Overdue — " : "Due "}{new Date(f.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {f.app_status && (
                        <Badge variant="outline" className="text-xs capitalize">{f.app_status}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {done.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Completed ({done.length})
              </h3>
              {done.map((f) => (
                <div key={f.id} className="flex items-start gap-3 p-4 rounded-xl border bg-muted/30 opacity-60">
                  <CheckCircle size={16} className="shrink-0 mt-0.5 text-accent" />
                  <div className="flex-1">
                    <p className="text-sm font-medium line-through">{f.action_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.job_title || "Unknown role"}{f.company ? ` @ ${f.company}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
