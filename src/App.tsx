import type { ReactElement } from "react";
import { createHashRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { canAccess, useSession } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Documents from "./pages/Documents";
import Payroll from "./pages/Payroll";
import Accounting from "./pages/Accounting";
import Declarations from "./pages/Declarations";
import Compliance from "./pages/Compliance";
import Accidents from "./pages/Accidents";
import Leaves from "./pages/Leaves";
import Security from "./pages/Security";
import Audit from "./pages/Audit";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";
import Stability from "./pages/Stability";

/**
 * Garde de route : n'affiche `element` que si le rôle du compte connecté y a droit.
 * Sinon, redirige vers /dashboard (accessible à tous). Défense contre l'accès direct par URL —
 * la navigation masquée ne suffit pas, l'utilisateur peut taper l'adresse à la main.
 * La règle d'accès vit dans auth.ts (source unique, partagée avec la navigation).
 */
function Guard({ element }: { element: ReactElement }): ReactElement {
  const user = useSession();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/" replace />;
  if (!canAccess(user.role, pathname)) return <Navigate to="/dashboard" replace />;
  return element;
}

const g = (element: ReactElement) => <Guard element={element} />;

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: g(<Dashboard />) },
      { path: "employees", element: g(<Employees />) },
      { path: "documents", element: g(<Documents />) },
      { path: "payroll", element: g(<Payroll />) },
      { path: "accounting", element: g(<Accounting />) },
      { path: "declarations", element: g(<Declarations />) },
      { path: "compliance", element: g(<Compliance />) },
      { path: "accidents", element: g(<Accidents />) },
      { path: "leaves", element: g(<Leaves />) },
      { path: "securite", element: g(<Security />) },
      { path: "audit", element: g(<Audit />) },
      { path: "assistant", element: g(<Assistant />) },
      { path: "stability", element: g(<Stability />) },
      { path: "settings", element: g(<Settings />) },
    ],
  },
]);

export default function App() {
  const user = useSession();
  if (!user) return <Login />;
  return <RouterProvider router={router} />;
}
