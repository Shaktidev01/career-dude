export default function Portfolio() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Project Eval</h2>
        <p className="text-muted-foreground">AI critique of user projects.</p>
      </div>
      
      <div className="rounded-xl border bg-card p-6 shadow flex gap-4">
        <input className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" placeholder="GitHub Repo URL or Project Link" />
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm">Critique</button>
      </div>
    </div>
  );
}
