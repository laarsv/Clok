import { useEffect, useMemo, useState } from "react";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import { api, ABSENCE_TYPE_LABELS, type Absence, type User } from "../../api";

function StatusPill({ status }: { status: Absence["status"] }) {
  const map: Record<Absence["status"], { cls: string; label: string }> = {
    pending: { cls: "bg-amber-100 text-amber-800", label: "offen" },
    approved: { cls: "bg-royal/10 text-royal", label: "genehmigt" },
    rejected: { cls: "bg-red-50 text-red-700", label: "abgelehnt" },
  };
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}

export default function AbsenceInbox() {
  const [list, setList] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    const emps = await api.listEmployees(true);
    setEmployees(emps);
    const all: Absence[] = [];
    for (const e of emps) {
      const abs = await api.listAbsences(e.id);
      all.push(...abs);
    }
    all.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
    setList(all);
  };

  useEffect(() => { load(); }, []);

  const empById = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );

  const decide = async (id: number, approve: boolean) => {
    if (approve) await api.approveAbsence(id, reason || undefined);
    else await api.rejectAbsence(id, reason || undefined);
    setDecidingId(null);
    setReason("");
    load();
  };

  const pending = list.filter((a) => a.status === "pending");
  const decided = list.filter((a) => a.status !== "pending");

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <div className="eyebrow">Abwesenheiten</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Anträge</h1>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-black sm:text-lg">Offen ({pending.length})</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                <tr>
                  <th className="px-4 py-3">Mitarbeiter</th>
                  <th className="px-4 py-3">Art</th>
                  <th className="px-4 py-3">Von</th>
                  <th className="px-4 py-3">Bis</th>
                  <th className="px-4 py-3">Notiz</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-4 py-3">{empById[a.user_id]?.full_name ?? `User #${a.user_id}`}</td>
                    <td className="px-4 py-3">{ABSENCE_TYPE_LABELS[a.type]}</td>
                    <td className="px-4 py-3 tabular-nums">{a.start_date}</td>
                    <td className="px-4 py-3 tabular-nums">{a.end_date}</td>
                    <td className="px-4 py-3 text-ink/60">{a.note ?? ""}</td>
                    <td className="px-4 py-3">
                      {decidingId === a.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="input w-48"
                            placeholder="Grund (optional)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                          <Button size="sm" onClick={() => decide(a.id, true)}>Genehmigen</Button>
                          <Button size="sm" variant="danger" onClick={() => decide(a.id, false)}>Ablehnen</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setDecidingId(null); setReason(""); }}>Abbrechen</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setDecidingId(a.id)}>Entscheiden</Button>
                      )}
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-ink/50">Keine offenen Anträge.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-black sm:text-lg">Entschieden</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                <tr>
                  <th className="px-4 py-3">Mitarbeiter</th>
                  <th className="px-4 py-3">Art</th>
                  <th className="px-4 py-3">Von</th>
                  <th className="px-4 py-3">Bis</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notiz</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((a) => (
                  <tr key={a.id} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-4 py-3">{empById[a.user_id]?.full_name ?? `User #${a.user_id}`}</td>
                    <td className="px-4 py-3">{ABSENCE_TYPE_LABELS[a.type]}</td>
                    <td className="px-4 py-3 tabular-nums">{a.start_date}</td>
                    <td className="px-4 py-3 tabular-nums">{a.end_date}</td>
                    <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                    <td className="px-4 py-3 text-ink/60">{a.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
