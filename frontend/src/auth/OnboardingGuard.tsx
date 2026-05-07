import { Navigate, useLocation } from "react-router-dom";
import { useCurrentUser } from "./CurrentUser";
import { homeForRole } from "./CurrentUser";
import type { OnboardingStatus } from "../api";

const STATUS_TO_PATH: Record<OnboardingStatus, string | null> = {
  onboarding_step_1: "/onboarding/company",  // theoretisch nie erreicht
  onboarding_step_2: "/onboarding/company",
  onboarding_step_3: "/onboarding/defaults",
  onboarding_step_4: "/onboarding/first-employee",
  onboarding_step_5: "/onboarding/done",
  active: null,
};

interface Props {
  /** Status-Werte, in denen die Route besucht werden darf. */
  expects: OnboardingStatus | OnboardingStatus[];
  children: React.ReactNode;
}

export default function OnboardingGuard({ expects, children }: Props) {
  const { user } = useCurrentUser();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (user.onboarding_status === "active") {
    // Wizard-Routen sind für aktive User nicht zugänglich.
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  const allowed = Array.isArray(expects) ? expects : [expects];
  if (!allowed.includes(user.onboarding_status)) {
    const next = STATUS_TO_PATH[user.onboarding_status];
    return <Navigate to={next ?? "/login"} replace />;
  }

  return <>{children}</>;
}
