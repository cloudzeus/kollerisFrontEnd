import { auth } from "@/auth";
import { capabilitiesOf } from "@/lib/rbac";
import { upGreek } from "@/lib/greek";

export default async function AdminDashboard() {
  const session = await auth();
  const capabilities = capabilitiesOf(session?.user.role);

  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold tracking-tight text-k-ink">
        {upGreek("Διαχείριση")}
      </h1>
      <p className="mt-2 text-k-text-2">
        Συνδεδεμένος ως {session?.user.email}
      </p>

      <section className="mt-10">
        <h2 className="text-xs tracking-widest text-k-text-4">
          {upGreek("Δικαιώματα")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {capabilities.map((capability) => (
            <span
              key={capability}
              className="numeral border border-k-line-2 bg-white px-3 py-1.5 text-xs text-k-text-2"
            >
              {capability}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
