export const dynamic = "force-dynamic";

export default async function Gate({ searchParams }: { searchParams: Promise<{ next?: string; bad?: string }> }) {
  const { next = "/", bad } = await searchParams;
  return (
    <div className="max-w-md mx-auto mt-10">
      <form method="POST" action="/api/gate" className="card p-8 space-y-5">
        <div>
          <p className="text-blue text-xs font-semibold uppercase tracking-widest mb-2">Private demo</p>
          <h1 className="text-2xl font-extrabold text-navy">Enter the access code</h1>
          <p className="text-sm text-muted mt-2">
            This instance runs real AI agents on the PayPal sandbox. The code keeps strangers from spending the demo&apos;s credits.
          </p>
        </div>
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="code">Access code</label>
          <input id="code" name="code" className="input" autoFocus autoComplete="off" required />
          {bad && <p className="text-red text-xs mt-2">That code didn&apos;t match. Try again.</p>}
        </div>
        <button className="btn-blue w-full">Enter</button>
      </form>
    </div>
  );
}
