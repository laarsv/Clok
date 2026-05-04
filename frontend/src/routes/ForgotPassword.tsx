import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

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
      <div className="center">
        <div className="card">
          <h1>Clok</h1>
          <p>
            Falls die Adresse bei uns bekannt ist, haben wir dir eine
            Mail mit einem Link zum Zurücksetzen geschickt. Schau in
            dein Postfach – der Link gilt 60 Minuten.
          </p>
          <Link to="/login">← zurück zum Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <div className="card">
        <h1>Passwort vergessen?</h1>
        <p className="muted small">
          Trag deine E-Mail-Adresse ein, dann schicken wir dir einen
          Link zum Zurücksetzen.
        </p>
        <label>E-Mail
          <input type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus />
        </label>
        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={busy || !email}>
          {busy ? "Schicke…" : "Reset-Link anfordern"}
        </button>
        <p className="muted small" style={{ marginTop: "1rem" }}>
          <Link to="/login">← zurück zum Login</Link>
        </p>
      </div>
    </div>
  );
}
