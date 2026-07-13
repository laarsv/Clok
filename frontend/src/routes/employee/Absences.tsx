import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import Select from "../../components/ui/Select";
import { api, ABSENCE_TYPE_LABELS, type Absence, type AbsenceType } from "../../api";

export default function Absences() {
  const [list, setList] = useState<Absence[]>([]);
  const [type, setType] = useState<AbsenceType>("vacation");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listAbsences().then(setList);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError(null);
    if (!start || !end) { setError("Datum fehlt."); return; }
    try {
      await api.createAbsence({
        type, start_date: start, end_date: end,
        note: note || undefined,
      });
      setStart(""); setEnd(""); setNote("");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const typeOptions = (Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[])
    .map((k) => ({ value: k, label: ABSENCE_TYPE_LABELS[k] }));

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <div className="eyebrow">Übersicht</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Abwesenheiten</h1>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-base font-black sm:text-lg">Neuer Antrag</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="field-label">Art</span>
              <Select
                value={type}
                onChange={(v) => setType(v as AbsenceType)}
                options={typeOptions}
                aria-label="Art"
                className="sm:w-64"
              />
            </label>
            <label className="block">
              <span className="field-label">Von</span>
              <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Bis</span>
              <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">Notiz</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <Button className="mt-4" onClick={submit}>
            {type === "sick" ? "Krankmeldung eintragen" : "Antrag stellen"}
          </Button>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          <p className="mt-3 text-xs text-ink/60">
            {type === "sick"
              ? "Krankmeldungen werden sofort verbucht. Dein Arbeitgeber wird informiert."
              : "Dein Antrag geht zur Genehmigung an deinen Arbeitgeber."}
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-black sm:text-lg">Deine Anträge</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wider text-ink/50">
                  <th className="px-4 py-3">Art</th>
                  <th className="px-4 py-3">Von</th>
                  <th className="px-4 py-3">Bis</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notiz</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} id={String(a.id)} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-4 py-3">{ABSENCE_TYPE_LABELS[a.type]}</td>
                    <td className="px-4 py-3 tabular-nums">{a.start_date}</td>
                    <td className="px-4 py-3 tabular-nums">{a.end_date}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3 text-ink/60">{a.note ?? ""}</td>
                    <td className="px-4 py-3 text-right">
                      {a.status === "pending" && (
                        <button className="btn-ghost btn-sm" aria-label="Antrag zurückziehen" onClick={async () => {
                          if (confirm("Antrag zurückziehen?")) {
                            await api.deleteAbsence(a.id);
                            load();
                          }
                        }}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-ink/50">Noch keine Abwesenheiten erfasst.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export function StatusBadge({ status }: { status: Absence["status"] }) {
  const label = status === "pending" ? "offen" : status === "approved" ? "genehmigt" : "abgelehnt";
  const cls = status === "approved" ? "bg-royal/10 text-royal"
    : status === "rejected" ? "bg-red-50 text-red-700"
    : "bg-amber-100 text-amber-800";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>;
}
