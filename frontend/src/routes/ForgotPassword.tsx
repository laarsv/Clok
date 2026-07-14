import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Wordmark from "../components/Wordmark";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.forgotPassword(email);
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="card w-full max-w-sm p-6 sm:p-8">
          <div className="mb-6 text-center">
            <Wordmark className="text-4xl" />
            <p className="mt-2 text-sm text-ink/60">Arbeitszeiterfassung</p>
          </div>
          <p className="text-sm text-ink/70">
            Falls die Adresse bei uns bekannt ist, haben wir dir eine
            Mail mit einem Link zum Zurücksetzen geschickt. Schau in
            dein Postfach – der Link gilt 60 Minuten.
          </p>
          <p className="mt-6 text-center text-sm">
            <Link to="/login" className="font-bold text-royal hover:underline">← zurück zum Login</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 text-center">
          <Wordmark className="text-4xl" />
          <p className="mt-2 text-sm text-ink/60">Arbeitszeiterfassung</p>
        </div>
        <h2 className="text-base font-black sm:text-lg">Passwort vergessen?</h2>
        <p className="mt-1 text-sm text-ink/60">
          Trag deine E-Mail-Adresse ein, dann schicken wir dir einen
          Link zum Zurücksetzen.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="field-label">E-Mail</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
          </label>
          {error && (
            <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}
          <button onClick={submit} disabled={busy || !email} className="btn-primary w-full">
            {busy ? "Schicke…" : "Reset-Link anfordern"}
          </button>
        </div>
        <p className="mt-6 text-center text-sm">
          <Link to="/login" className="font-bold text-royal hover:underline">← zurück zum Login</Link>
        </p>
      </div>
    </div>
  );
}
