import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

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
      <div className="center">
        <div className="card">
          <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
          <div className="error">{error}</div>
          <Link to="/forgot-password">Neuen Reset-Link anfordern</Link>
        </div>
      </div>
    );
  }
  if (!preview) return <div className="center">Lade…</div>;
  if (done) {
    return (
      <div className="center">
        <div className="card">
          <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
          <p>Passwort gesetzt. Du wirst gleich zum Login weitergeleitet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <div className="card">
        <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
        <h2 style={{ marginTop: 0 }}>Neues Passwort setzen</h2>
        <p className="muted small">
          Login-Username: <code>{preview.username}</code> · E-Mail: {preview.email}
        </p>
        <label>Neues Passwort<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        <label>Wiederholen
          <input type="password" value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={busy}>
          {busy ? "Speichere…" : "Passwort setzen"}
        </button>
      </div>
    </div>
  );
}
