import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setToken, type Role, type User } from "../api";

interface Ctx {
  user: User | null;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
}

const CurrentUserCtx = createContext<Ctx>({
  user: null,
  setUser: () => {},
  refresh: async () => {},
});

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    if (!localStorage.getItem("token")) {
      setUser(null);
      setLoaded(true);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (!loaded) return <div className="center">Lade…</div>;

  return (
    <CurrentUserCtx.Provider value={{ user, setUser, refresh }}>
      {children}
    </CurrentUserCtx.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserCtx);
}

export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { user } = useCurrentUser();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!allow.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function homeForRole(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "employer") return "/employer";
  return "/me";
}
