export default function Billing() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Billing & Credits</h2>
        <p className="text-muted-foreground">Manage your Zoho Payments subscription and AI credits.</p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-6 shadow">
          <h3 className="font-bold text-xl mb-2">Free Tier</h3>
          <p className="text-muted-foreground mb-6">5 credits per month.</p>
          <div className="text-3xl font-bold mb-6">$0<span className="text-sm text-muted-foreground font-normal">/mo</span></div>
          <button className="w-full border px-4 py-2 rounded-md font-medium text-sm" disabled>Current Plan</button>
        </div>

        <div className="rounded-xl border-2 border-primary bg-card p-6 shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">POPULAR</div>
          <h3 className="font-bold text-xl mb-2">Pro Tier</h3>
          <p className="text-muted-foreground mb-6">150 credits + Priority generation.</p>
          <div className="text-3xl font-bold mb-6">$20<span className="text-sm text-muted-foreground font-normal">/mo</span></div>
          <button className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium text-sm">Upgrade via Zoho</button>
        </div>
      </div>
    </div>
  );
}
