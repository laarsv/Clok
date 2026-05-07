import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api, COMPANY_SIZE_BUCKET_LABELS,
  type CompanySizeBucket, type FederalState,
} from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import OnboardingStepper from "../../components/OnboardingStepper";

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
    <div className="onboarding-shell">
      <OnboardingStepper active={2} />
      <div className="card onboarding-card">
        <h2>Firmendaten</h2>
        <p className="muted">
          Stammdaten deiner Firma. Sie tauchen später in PDF-Stundenzetteln
          und in Mitarbeiter-Anlegen-Formularen auf.
        </p>

        <label>Firmenname *
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Muster GmbH" />
        </label>
        <div className="manual-grid">
          <label className="full">Straße
            <input value={street} onChange={(e) => setStreet(e.target.value)} />
          </label>
          <label>PLZ
            <input value={zip} onChange={(e) => setZip(e.target.value)} />
          </label>
          <label>Ort
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label>USt-ID (optional)
            <input value={vat} onChange={(e) => setVat(e.target.value)} />
          </label>
          <label>Bundesland *
            <select value={bundesland} onChange={(e) => setBundesland(e.target.value as FederalState)}>
              <option value="">– bitte wählen –</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="full">Branche (optional)
            <input value={industry} onChange={(e) => setIndustry(e.target.value)}
              placeholder="z. B. IT-Dienstleistungen, Handwerk, …" />
          </label>
          <label className="full">Geplante Mitarbeiter *
            <select value={bucket} onChange={(e) => setBucket(e.target.value as CompanySizeBucket)}>
              <option value="">– bitte wählen –</option>
              {(Object.keys(COMPANY_SIZE_BUCKET_LABELS) as CompanySizeBucket[]).map((b) => (
                <option key={b} value={b}>{COMPANY_SIZE_BUCKET_LABELS[b]}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={busy} style={{ marginTop: "0.8rem" }}>
          {busy ? "Speichere…" : "Weiter"}
        </button>
      </div>
    </div>
  );
}
