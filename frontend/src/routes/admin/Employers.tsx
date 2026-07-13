import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { api, type EmployeeCreatePayload, type User } from "../../api";

export default function Employers() {
  const navigate = useNavigate();
  const [list, setList] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showOff, setShowOff] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EmployeeCreatePayload>({
    username: "", email: "", role: "employer",
  });
  const [error, setError] = useState<string | null>(null);
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  const load = async () => {
    const all = await api.listEmployees(true);
    setAllUsers(all);
    setList(all.filter((u) => u.role === "employer"));
  };
  useEffect(() => { load(); }, []);

  const employeeCounts = useMemo(() => {
    const counts: Record<number, { active: number; offboarded: number }> = {};
    for (const u of allUsers) {
      if (u.role !== "employee" || u.supervisor_id == null) continue;
      const slot = counts[u.supervisor_id] ?? { active: 0, offboarded: 0 };
      if (u.offboarded_at) slot.offboarded += 1;
      else slot.active += 1;
      counts[u.supervisor_id] = slot;
    }
    return counts;
  }, [allUsers]);

  const submit = async () => {
    setError(null);
    try {
      const created = await api.createEmployee({ ...form, role: "employer" });
      setCreating(false);
      setForm({ username: "", email: "", role: "employer" });
      setCreatedNote(`Einladung an ${created.email} gesendet.`);
      setTimeout(() => setCreatedNote(null), 4000);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const filtered = showOff ? list : list.filter((e) => !e.offboarded_at);

  return (
    <Shell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Verwaltung</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Arbeitgeber</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                className="h-4 w-4 accent-royal"
                checked={showOff}
                onChange={(e) => setShowOff(e.target.checked)}
              />
              Offboarded anzeigen
            </label>
            <Button onClick={() => setCreating(true)}>+ Arbeitgeber</Button>
          </div>
        </div>

        {createdNote && (
          <div className="rounded-lg border-l-4 border-royal bg-royal/10 p-3 text-sm text-ink">{createdNote}</div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Firma</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Mitarbeiter</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const c = employeeCounts[u.id] ?? { active: 0, offboarded: 0 };
                return (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/admin/employers/${u.id}`)}
                    className="cursor-pointer border-b border-ink/5 last:border-b-0 hover:bg-ink/5"
                  >
                    <td className="px-4 py-3"><strong>{u.full_name ?? "–"}</strong></td>
                    <td className="px-4 py-3">{u.company_name ?? "–"}</td>
                    <td className="px-4 py-3 text-ink/60">@{u.username}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.active}{c.offboarded > 0 && <span className="text-ink/60"> (+ {c.offboarded} off.)</span>}
                    </td>
                    <td className="px-4 py-3">
                      {u.offboarded_at
                        ? <span className="inline-flex items-center rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-bold text-ink/60">offboarded</span>
                        : <span className="inline-flex items-center rounded-full bg-royal/10 px-2.5 py-0.5 text-xs font-bold text-royal">aktiv</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/employers/${u.id}`); }}
                      >
                        Öffnen
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-3 text-ink/60">Keine Arbeitgeber.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Modal open={creating} onClose={() => setCreating(false)}>
          <h2 className="text-base font-black sm:text-lg">Neuer Arbeitgeber</h2>
          <p className="mt-1 text-sm text-ink/60">
            Der neue Arbeitgeber bekommt eine Einladungsmail und setzt
            Passwort und Stammdaten selbst.
          </p>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="field-label">Username</span>
              <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">E-Mail</span>
              <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Voller Name</span>
              <input className="input" value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </label>
            {error && (
              <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreating(false)}>Abbrechen</Button>
              <Button onClick={submit}>Anlegen &amp; einladen</Button>
            </div>
          </div>
        </Modal>
      </div>
    </Shell>
  );
}
