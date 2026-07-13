import { useState } from "react";
import { api } from "../api";
import Button from "./ui/Button";

interface ImportReport {
  imported: number;
  errors: { line: number; message: string }[];
}

interface Props {
  employeeId: number;
  /** wenn true, wird nach erfolgreichem Upload sofort gepusht (auto-submit).
   *  Im Onboarding wird gepuffert und beim "Anlegen"-Klick mitgesendet. */
  autoUpload?: boolean;
  /** Im Onboarding: Liefert die Files an den Caller, der sie selbst hochlädt. */
  onFilesChange?: (timesFile: File | null, absencesFile: File | null) => void;
  timesReport?: ImportReport | null;
  absencesReport?: ImportReport | null;
}

export default function ImportPanel({
  employeeId, autoUpload = true, onFilesChange,
  timesReport: extTimesReport, absencesReport: extAbsencesReport,
}: Props) {
  const [timesFile, setTimesFile] = useState<File | null>(null);
  const [absencesFile, setAbsencesFile] = useState<File | null>(null);
  const [timesReport, setTimesReport] = useState<ImportReport | null>(null);
  const [absencesReport, setAbsencesReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<"times" | "absences" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (kind: "times" | "absences") => {
    setError(null);
    const file = kind === "times" ? timesFile : absencesFile;
    if (!file) return;
    setBusy(kind);
    try {
      const r = kind === "times"
        ? await api.importTimeEntriesCsv(employeeId, file)
        : await api.importAbsencesCsv(employeeId, file);
      if (kind === "times") {
        setTimesReport(r);
        setTimesFile(null);
      } else {
        setAbsencesReport(r);
        setAbsencesFile(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const renderReport = (label: string, r: ImportReport | null | undefined) => {
    if (!r) return null;
    return (
      <div className="mt-3 rounded-lg border border-ink/10 p-3 text-sm">
        <strong>{label}: {r.imported} importiert.</strong>
        {r.errors.length > 0 && (
          <div className="mt-2 text-red-700">
            <p>{r.errors.length} Zeile(n) abgewiesen:</p>
            <ul className="mt-1 list-disc pl-5">
              {r.errors.slice(0, 10).map((e, i) => (
                <li key={i}>Zeile {e.line}: {e.message}</li>
              ))}
              {r.errors.length > 10 && <li>… ({r.errors.length - 10} weitere)</li>}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const setBoth = (t: File | null, a: File | null) => {
    setTimesFile(t);
    setAbsencesFile(a);
    if (!autoUpload) onFilesChange?.(t, a);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-bold text-ink">Zeiteinträge</div>
        <p className="mt-1 text-sm text-ink/60">
          Header: <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">datum;start;ende;pause_min;projekt;notiz</code> ·{" "}
          <a href={api.importTemplateTimesUrl()} download className="font-medium text-royal hover:underline">Vorlage herunterladen</a>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" className="block text-sm"
            onChange={(e) => setBoth(e.target.files?.[0] ?? null, absencesFile)} />
          {autoUpload && timesFile && (
            <Button size="sm" onClick={() => upload("times")} disabled={busy !== null}>
              {busy === "times" ? "Lädt…" : "Hochladen"}
            </Button>
          )}
        </div>
        {renderReport("Zeiteinträge", autoUpload ? timesReport : extTimesReport)}
      </div>

      <div>
        <div className="font-bold text-ink">Abwesenheiten (Urlaub, Krankheit, unbezahlt)</div>
        <p className="mt-1 text-sm text-ink/60">
          Header: <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">art;von;bis;notiz</code> · art ∈ {"{vacation, sick, unpaid}"} ·{" "}
          <a href={api.importTemplateAbsencesUrl()} download className="font-medium text-royal hover:underline">Vorlage herunterladen</a>
        </p>
        <p className="text-sm text-ink/60">Importierte Einträge gelten direkt als <em>genehmigt</em>.</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" className="block text-sm"
            onChange={(e) => setBoth(timesFile, e.target.files?.[0] ?? null)} />
          {autoUpload && absencesFile && (
            <Button size="sm" onClick={() => upload("absences")} disabled={busy !== null}>
              {busy === "absences" ? "Lädt…" : "Hochladen"}
            </Button>
          )}
        </div>
        {renderReport("Abwesenheiten", autoUpload ? absencesReport : extAbsencesReport)}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
