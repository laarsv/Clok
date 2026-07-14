import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Wordmark from "../components/Wordmark";

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<{ username: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.resetPasswordPreview(token)
      .then(setPreview)
      .catch((e) => setError(e.message));
  }, [token]);

  const submit = async () => {
    setError(null);
    if (pw.length < 8) { setError("Passwort muss mindestens 8 Zeichen haben."); return; }
    if (pw !== pw2) { setError("Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    try {
      await api.resetPasswordComplete(token!, pw);
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !preview) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="card w-full max-w-sm p-6 sm:p-8">
          <div className="mb-6 text-center">
            <Wordmark className="text-4xl" />
            <p className="mt-2 text-sm text-ink/60">Arbeitszeiterfassung</p>
          </div>
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
          <p className="mt-6 text-center text-sm">
            <Link to="/forgot-password" className="font-bold text-royal hover:underline">Neuen Reset-Link anfordern</Link>
          </p>
        </div>
      </div>
    );
  }
  if (!preview) return <div className="flex min-h-screen items-center justify-center px-4 py-10 text-ink/50">Lade…</div>;
  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="card w-full max-w-sm p-6 sm:p-8">
          <div className="mb-6 text-center">
            <Wordmark className="text-4xl" />
            <p className="mt-2 text-sm text-ink/60">Arbeitszeiterfassung</p>
          </div>
          <p className="text-sm text-ink/70">Passwort gesetzt. Du wirst gleich zum Login weitergeleitet.</p>
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
        <h2 className="text-base font-black sm:text-lg">Neues Passwort setzen</h2>
        <p className="mt-1 text-sm text-ink/60">
          Login-Username: <code className="rounded bg-ink/5 px-1 py-0.5">{preview.username}</code> · E-Mail: {preview.email}
        </p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="field-label">Neues Passwort</span>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          </label>
          <label className="block">
            <span className="field-label">Wiederholen</span>
            <input
              className="input"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>
          {error && (
            <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>
          )}
          <button onClick={submit} disabled={busy} className="btn-primary w-full">
            {busy ? "Speichere…" : "Passwort setzen"}
          </button>
        </div>
      </div>
    </div>
  );
}
