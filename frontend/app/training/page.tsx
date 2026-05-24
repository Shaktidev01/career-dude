export default function Training() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Training Eval</h2>
        <p className="text-muted-foreground">Course suggestions based on missing skills.</p>
      </div>
      
      <div className="rounded-xl border bg-card p-6 shadow">
        <p className="text-sm text-muted-foreground mb-4">We noticed you frequently miss these skills in highly rated jobs: <strong>GraphQL, Kubernetes</strong></p>
        <button className="bg-secondary text-secondary-foreground border px-4 py-2 rounded-md font-medium text-sm">Generate Curriculum Path</button>
      </div>
    </div>
  );
}
