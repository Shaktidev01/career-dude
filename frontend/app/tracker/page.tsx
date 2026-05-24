"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, pointerWithin } from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";

// Basic Types
type AppStatus = "saved" | "applied" | "interview" | "offer" | "rejected";

interface Application {
  id: string;
  status: AppStatus;
  notes: string | null;
  job_evaluation?: {
    job_title: string;
    company: string;
    ai_score: string;
    archetype: string;
  };
}

const statuses: AppStatus[] = ["saved", "applied", "interview", "offer", "rejected"];

const getStatusDisplay = (status: AppStatus) => {
  const map = {
    saved: "Saved",
    applied: "Applied",
    interview: "Interviewing",
    offer: "Offer",
    rejected: "Rejected"
  };
  return map[status];
};

function DraggableApplicationCard({ app }: { app: Application }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: app.id,
    data: app,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.4 : 1,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card className="cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors shadow-sm">
        <CardContent className="p-3">
          <div className="font-medium text-sm leading-tight mb-1">
            {app.job_evaluation?.job_title || "Unknown Role"}
          </div>
          <div className="text-muted-foreground text-xs flex justify-between items-center">
            <span>{app.job_evaluation?.company || "Unknown Company"}</span>
            {app.job_evaluation?.ai_score && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {app.job_evaluation.ai_score}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableColumn({ status, apps, children }: { status: AppStatus, apps: Application[], children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`flex flex-col rounded-xl border p-3 min-w-[250px] transition-colors ${isOver ? 'bg-secondary border-primary' : 'bg-secondary/50'}`}
    >
      <h3 className="font-semibold text-sm mb-3 px-1 flex justify-between items-center">
        {getStatusDisplay(status)} 
        <span className="bg-background rounded-full px-2 py-0.5 text-xs text-muted-foreground border">
          {apps.length}
        </span>
      </h3>
      
      <div className="space-y-3 min-h-[100px]">
        {children}
        
        {apps.length === 0 && (
          <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg h-24 flex items-center justify-center text-muted-foreground text-xs bg-background/50">
            Drag here
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppTracker() {
  const { data: session } = useSession();
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user) {
      fetchApplications();
    }
  }, [session]);

  const fetchApplications = async () => {
    try {
      const res = await fetch("/api/v1/applications", {
        headers: {
          "Authorization": `Bearer ${(session as any)?.accessToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data);
      }
    } catch (e) {
      console.error("Failed to fetch applications", e);
    } finally {
      setIsLoading(false);
    }
  };

  const updateApplicationStatus = async (id: string, newStatus: AppStatus) => {
    try {
      await fetch(`/api/v1/applications/${id}`, {
        method: 'PATCH',
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${(session as any)?.accessToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (over && active.id !== over.id) {
      const newStatus = over.id as AppStatus;
      const appId = active.id as string;
      
      const app = applications.find(a => a.id === appId);
      if (app && app.status !== newStatus) {
        // Optimistic update
        setApplications(apps => 
          apps.map(a => a.id === appId ? { ...a, status: newStatus } : a)
        );
        // Persist
        updateApplicationStatus(appId, newStatus);
      }
    }
  };

  const activeApp = applications.find(a => a.id === activeId);

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Application Tracker</h2>
        <p className="text-muted-foreground">Visual Kanban board for your active pipeline.</p>
      </div>
      
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex flex-col rounded-xl bg-secondary/50 border p-3 min-w-[250px] space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext 
          onDragStart={handleDragStart} 
          onDragEnd={handleDragEnd}
          collisionDetection={pointerWithin}
        >
          <div className="flex-1 grid gap-4 grid-cols-1 md:grid-cols-5 overflow-x-auto pb-4">
            {statuses.map(status => {
              const columnApps = applications.filter(app => app.status === status);
              return (
                <DroppableColumn key={status} status={status} apps={columnApps}>
                  {columnApps.map(app => (
                    <DraggableApplicationCard key={app.id} app={app} />
                  ))}
                </DroppableColumn>
              );
            })}
          </div>

          <DragOverlay>
            {activeApp ? (
              <Card className="cursor-grabbing shadow-lg scale-105 border-primary">
                <CardContent className="p-3">
                  <div className="font-medium text-sm leading-tight mb-1">
                    {activeApp.job_evaluation?.job_title || "Unknown Role"}
                  </div>
                  <div className="text-muted-foreground text-xs flex justify-between items-center">
                    <span>{activeApp.job_evaluation?.company || "Unknown Company"}</span>
                    {activeApp.job_evaluation?.ai_score && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {activeApp.job_evaluation.ai_score}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
