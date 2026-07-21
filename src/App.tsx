import { createHashRouter, Navigate, RouterProvider } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { useSession } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Documents from "./pages/Documents";
import Payroll from "./pages/Payroll";
import Accounting from "./pages/Accounting";
import Declarations from "./pages/Declarations";
import Compliance from "./pages/Compliance";
import Leaves from "./pages/Leaves";
import Security from "./pages/Security";
import Audit from "./pages/Audit";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "employees", element: <Employees /> },
      { path: "documents", element: <Documents /> },
      { path: "payroll", element: <Payroll /> },
      { path: "accounting", element: <Accounting /> },
      { path: "declarations", element: <Declarations /> },
      { path: "compliance", element: <Compliance /> },
      { path: "leaves", element: <Leaves /> },
      { path: "securite", element: <Security /> },
      { path: "audit", element: <Audit /> },
      { path: "assistant", element: <Assistant /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

export default function App() {
  const user = useSession();
  if (!user) return <Login />;
  return <RouterProvider router={router} />;
}
