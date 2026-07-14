import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, googleLoginUrl, setToken } from "../api";
import { homeForRole, useCurrentUser } from "../auth/CurrentUser";
import Wordmark from "../components/Wordmark";

export default function Login() {
  const { setUser } = useCurrentUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { access_token } = await api.login(username, password);
      setToken(access_token);
      const me = await api.me();
      setUser(me);
      navigate(homeForRole(me.role), { replace: true });
    } catch (e: any) {
      setError(e.message ?? "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    // Enter loggt ein, sobald beide Felder gefüllt sind – kein versehentlicher
    // Submit mit leerem Passwort.
    if (e.key === "Enter" && username && password) submit();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 text-center">
          <Wordmark className="text-4xl" />
          <p className="mt-2 text-sm text-ink/60">Arbeitszeiterfassung</p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="field-label">Benutzername</span>
            <input
              className="input"
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onEnter}
            />
          </label>
          <label className="block">
            <span className="field-label">Passwort</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onEnter}
            />
          </label>

          {error && (
            <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          <button onClick={submit} disabled={busy} className="btn-primary w-full">
            {busy ? "Anmelden…" : "Anmelden"}
          </button>

          <div className="flex items-center gap-3 py-1 text-xs text-ink/40">
            <span className="h-px flex-1 bg-ink/10" /> oder <span className="h-px flex-1 bg-ink/10" />
          </div>

          <a href={googleLoginUrl} className="btn-outline flex w-full items-center justify-center gap-2">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg>
            Mit Google anmelden
          </a>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link to="/forgot-password" className="font-bold text-royal hover:underline">
            Passwort vergessen?
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-ink/50">
        ein Werkzeug von{" "}
        <a
          href="https://vrwb.de"
          target="_blank"
          rel="noreferrer"
          className="font-black tracking-wordmark text-ink/70 hover:text-ink"
        >
          vrwb<span className="text-royal wordmark-cursor-blink">_</span>
        </a>
      </p>
    </div>
  );
}
