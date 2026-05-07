import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CurrentUserProvider, RoleGuard, homeForRole, useCurrentUser } from "./auth/CurrentUser";
import OnboardingGuard from "./auth/OnboardingGuard";
import Login from "./routes/Login";
import ForgotPassword from "./routes/ForgotPassword";
import ResetPassword from "./routes/ResetPassword";
import Onboarding from "./routes/Onboarding";
import OnboardingInviteAccept from "./routes/onboarding/InviteAccept";
import OnboardingCompany from "./routes/onboarding/Company";
import OnboardingDefaults from "./routes/onboarding/Defaults";
import OnboardingFirstEmployee from "./routes/onboarding/FirstEmployee";
import OnboardingDone from "./routes/onboarding/Done";
import EmployeeWeek from "./routes/employee/Week";
import EmployeeMonth from "./routes/employee/Month";
import EmployeeAbsences from "./routes/employee/Absences";
import EmployeeLog from "./routes/employee/Log";
import EmployeeYear from "./routes/employee/Year";
import EmployeeProfile from "./routes/employee/Profile";
import EmployerDashboard from "./routes/employer/Dashboard";
import EmployerEmployeeNew from "./routes/employer/EmployeeNew";
import EmployerEmployeeDetail from "./routes/employer/EmployeeDetail";
import EmployerAbsenceInbox from "./routes/employer/AbsenceInbox";
import AdminEmployers from "./routes/admin/Employers";
import AdminEmployerDetail from "./routes/admin/EmployerDetail";
import AdminFeedbackInbox from "./routes/admin/FeedbackInbox";
import AdminInvites from "./routes/admin/Invites";
import Feedback from "./routes/Feedback";

function HomeRedirect() {
  const { user } = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(user.role)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <CurrentUserProvider>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />

          {/* Arbeitgeber-Onboarding-Wizard. Spezifische Pfade VOR dem
              generischen /onboarding/:token, damit react-router korrekt
              priorisiert. */}
          <Route path="/onboarding/invite/:token" element={<OnboardingInviteAccept />} />
          <Route path="/onboarding/company" element={
            <OnboardingGuard expects="onboarding_step_2"><OnboardingCompany /></OnboardingGuard>
          } />
          <Route path="/onboarding/defaults" element={
            <OnboardingGuard expects="onboarding_step_3"><OnboardingDefaults /></OnboardingGuard>
          } />
          <Route path="/onboarding/first-employee" element={
            <OnboardingGuard expects="onboarding_step_4"><OnboardingFirstEmployee /></OnboardingGuard>
          } />
          <Route path="/onboarding/done" element={
            <OnboardingGuard expects={["onboarding_step_4", "onboarding_step_5"]}>
              <OnboardingDone />
            </OnboardingGuard>
          } />

          {/* Mitarbeiter-Onboarding (Bestand). */}
          <Route path="/onboarding/:token" element={<Onboarding />} />

          <Route path="/me" element={
            <RoleGuard allow={["employee", "employer", "admin"]}><EmployeeWeek /></RoleGuard>
          } />
          <Route path="/me/month" element={
            <RoleGuard allow={["employee", "employer", "admin"]}><EmployeeMonth /></RoleGuard>
          } />
          <Route path="/me/absences" element={
            <RoleGuard allow={["employee", "employer", "admin"]}><EmployeeAbsences /></RoleGuard>
          } />
          <Route path="/me/log" element={
            <RoleGuard allow={["employee", "employer", "admin"]}><EmployeeLog /></RoleGuard>
          } />
          <Route path="/me/year" element={
            <RoleGuard allow={["employee", "employer", "admin"]}><EmployeeYear /></RoleGuard>
          } />
          <Route path="/me/profile" element={
            <RoleGuard allow={["employee", "employer", "admin"]}><EmployeeProfile /></RoleGuard>
          } />

          <Route path="/employer" element={
            <RoleGuard allow={["employer", "admin"]}><EmployerDashboard /></RoleGuard>
          } />
          <Route path="/employer/employees/new" element={
            <RoleGuard allow={["employer", "admin"]}><EmployerEmployeeNew /></RoleGuard>
          } />
          <Route path="/employer/employees/:id" element={
            <RoleGuard allow={["employer", "admin"]}><EmployerEmployeeDetail /></RoleGuard>
          } />
          <Route path="/employer/absences" element={
            <RoleGuard allow={["employer", "admin"]}><EmployerAbsenceInbox /></RoleGuard>
          } />

          <Route path="/admin" element={
            <RoleGuard allow={["admin"]}><AdminEmployers /></RoleGuard>
          } />
          <Route path="/admin/employers" element={
            <RoleGuard allow={["admin"]}><AdminEmployers /></RoleGuard>
          } />
          <Route path="/admin/employers/:id" element={
            <RoleGuard allow={["admin"]}><AdminEmployerDetail /></RoleGuard>
          } />
          <Route path="/admin/feedback" element={
            <RoleGuard allow={["admin"]}><AdminFeedbackInbox /></RoleGuard>
          } />
          <Route path="/admin/invites" element={
            <RoleGuard allow={["admin"]}><AdminInvites /></RoleGuard>
          } />

          <Route path="/feedback" element={
            <RoleGuard allow={["employee", "employer"]}><Feedback /></RoleGuard>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CurrentUserProvider>
    </BrowserRouter>
  );
}
