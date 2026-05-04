import { useState } from "react";
import { api } from "../api";

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
      <div className={r.errors.length ? "issue warning" : "issue"} style={{ marginTop: "0.75rem" }}>
        <strong>{label}: {r.imported} importiert.</strong>
        {r.errors.length > 0 && (
          <>
            <p>{r.errors.length} Zeile(n) abgewiesen:</p>
            <ul>
              {r.errors.slice(0, 10).map((e, i) => (
                <li key={i}>Zeile {e.line}: {e.message}</li>
              ))}
              {r.errors.length > 10 && <li>… ({r.errors.length - 10} weitere)</li>}
            </ul>
          </>
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
    <div className="import-panel">
      <div style={{ marginBottom: "1rem" }}>
        <strong>Zeiteinträge</strong>
        <p className="muted small">
          Header: <code>datum;start;ende;pause_min;projekt;notiz</code> ·{" "}
          <a href={api.importTemplateTimesUrl()} download>Vorlage herunterladen</a>
        </p>
        <input type="file" accept=".csv,text/csv"
          onChange={(e) => setBoth(e.target.files?.[0] ?? null, absencesFile)} />
        {autoUpload && timesFile && (
          <button onClick={() => upload("times")} disabled={busy !== null} style={{ marginLeft: "0.5rem" }}>
            {busy === "times" ? "Lädt…" : "Hochladen"}
          </button>
        )}
        {renderReport("Zeiteinträge", autoUpload ? timesReport : extTimesReport)}
      </div>

      <div>
        <strong>Abwesenheiten (Urlaub, Krankheit, unbezahlt)</strong>
        <p className="muted small">
          Header: <code>art;von;bis;notiz</code> · art ∈ {"{vacation, sick, unpaid}"} ·{" "}
          <a href={api.importTemplateAbsencesUrl()} download>Vorlage herunterladen</a>
        </p>
        <p className="muted small">Importierte Einträge gelten direkt als <em>genehmigt</em>.</p>
        <input type="file" accept=".csv,text/csv"
          onChange={(e) => setBoth(timesFile, e.target.files?.[0] ?? null)} />
        {autoUpload && absencesFile && (
          <button onClick={() => upload("absences")} disabled={busy !== null} style={{ marginLeft: "0.5rem" }}>
            {busy === "absences" ? "Lädt…" : "Hochladen"}
          </button>
        )}
        {renderReport("Abwesenheiten", autoUpload ? absencesReport : extAbsencesReport)}
      </div>

      {error && <div className="error" style={{ marginTop: "0.75rem" }}>{error}</div>}
    </div>
  );
}
