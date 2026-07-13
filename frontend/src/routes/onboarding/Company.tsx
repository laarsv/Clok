import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api, COMPANY_SIZE_BUCKET_LABELS,
  type CompanySizeBucket, type FederalState,
} from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import OnboardingStepper from "../../components/OnboardingStepper";
import Select from "../../components/ui/Select";

const STATES: FederalState[] = [
  "BW","BY","BE","BB","HB","HH","HE","MV",
  "NI","NW","RP","SL","SN","ST","SH","TH",
];

export default function OnboardingCompany() {
  const navigate = useNavigate();
  const { user, refresh } = useCurrentUser();

  const [name, setName] = useState(user?.company_name ?? "");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [country] = useState("DE");
  const [vat, setVat] = useState("");
  const [bundesland, setBundesland] = useState<FederalState | "">("");
  const [industry, setIndustry] = useState("");
  const [bucket, setBucket] = useState<CompanySizeBucket | "">("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (name.trim().length === 0) { setError("Firmenname ist Pflicht."); return; }
    if (!bundesland) { setError("Bitte ein Bundesland wählen."); return; }
    if (!bucket) { setError("Bitte die geplante Firmengröße auswählen."); return; }
    setBusy(true);
    try {
      await api.onboardingPostCompany({
        name: name.trim(),
        address_street: street.trim() || undefined,
        address_zip: zip.trim() || undefined,
        address_city: city.trim() || undefined,
        address_country: country,
        vat_id: vat.trim() || undefined,
        bundesland,
        industry: industry.trim() || undefined,
        employee_count_bucket: bucket,
      });
      await refresh();
      navigate("/onboarding/defaults", { replace: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <OnboardingStepper active={2} />
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight">Firmendaten</h1>
        <p className="mt-2 text-sm text-ink/60">
          Stammdaten deiner Firma. Sie tauchen später in PDF-Stundenzetteln
          und in Mitarbeiter-Anlegen-Formularen auf.
        </p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="field-label">Firmenname *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Muster GmbH" />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="field-label">Straße</span>
              <input className="input" value={street} onChange={(e) => setStreet(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">PLZ</span>
              <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Ort</span>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">USt-ID (optional)</span>
              <input className="input" value={vat} onChange={(e) => setVat(e.target.value)} />
            </label>
            <div>
              <span className="field-label">Bundesland *</span>
              <Select
                value={bundesland}
                onChange={(v) => setBundesland(v as FederalState)}
                options={STATES.map((s) => ({ value: s, label: s }))}
                placeholder="– bitte wählen –"
                aria-label="Bundesland"
              />
            </div>
            <label className="block sm:col-span-2">
              <span className="field-label">Branche (optional)</span>
              <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)}
                placeholder="z. B. IT-Dienstleistungen, Handwerk, …" />
            </label>
            <div className="sm:col-span-2">
              <span className="field-label">Geplante Mitarbeiter *</span>
              <Select
                value={bucket}
                onChange={(v) => setBucket(v as CompanySizeBucket)}
                options={(Object.keys(COMPANY_SIZE_BUCKET_LABELS) as CompanySizeBucket[]).map((b) => ({
                  value: b,
                  label: COMPANY_SIZE_BUCKET_LABELS[b],
                }))}
                placeholder="– bitte wählen –"
                aria-label="Geplante Mitarbeiter"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}
        <button onClick={submit} disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "Speichere…" : "Weiter"}
        </button>
      </div>
    </div>
  );
}
