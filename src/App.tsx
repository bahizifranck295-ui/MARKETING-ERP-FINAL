import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";

// Pages
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import BoutiquePage from "@/pages/BoutiquePage";
import OrdersPage from "@/pages/OrdersPage";
import StockPage from "@/pages/StockPage";
import CashPage from "@/pages/CashPage";
import CreditsPage from "@/pages/CreditsPage";
import ClientsPage from "@/pages/ClientsPage";
import DeliveryPage from "@/pages/DeliveryPage";
import AccountingPage from "@/pages/AccountingPage";
import ReportsPage from "@/pages/ReportsPage";
import ObjectivesPage from "@/pages/ObjectivesPage";
import UsersPage from "@/pages/UsersPage";
import RolesPage from "@/pages/RolesPage";
import AuditPage from "@/pages/AuditPage";
import NotificationsPage from "@/pages/NotificationsPage";
import ProfilePage from "@/pages/ProfilePage";
import MorePage from "@/pages/MorePage";
import NotFoundPage from "@/pages/NotFoundPage";
import LogisticsDashboardPage from "@/pages/logistics/LogisticsDashboardPage";
import LogisticsReportsPage from "@/pages/logistics/LogisticsReportsPage";
import { IS_LOGISTICS, inThisApp } from "@/app/edition";

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes inside Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={IS_LOGISTICS ? <LogisticsDashboardPage /> : <DashboardPage />} />
            {inThisApp("/boutique") && (
            <Route
              path="/boutique"
              element={
                <ProtectedRoute permission="boutique.read">
                  <BoutiquePage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/orders") && (
            <Route
              path="/orders"
              element={
                <ProtectedRoute permission="orders.read">
                  <OrdersPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/stock") && (
            <Route
              path="/stock"
              element={
                <ProtectedRoute permission="stock.read">
                  <StockPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/cash") && (
            <Route
              path="/cash"
              element={
                <ProtectedRoute permission="cash.read">
                  <CashPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/credits") && (
            <Route
              path="/credits"
              element={
                <ProtectedRoute permission="credits.read">
                  <CreditsPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/clients") && (
            <Route
              path="/clients"
              element={
                <ProtectedRoute permission="crm.read">
                  <ClientsPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/delivery") && (
            <Route
              path="/delivery"
              element={
                <ProtectedRoute permission="delivery.read">
                  <DeliveryPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/accounting") && (
            <Route
              path="/accounting"
              element={
                <ProtectedRoute permission="accounting.read">
                  <AccountingPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/reports") && (
            <Route
              path="/reports"
              element={
                <ProtectedRoute permission="reports.read">
                  {IS_LOGISTICS ? <LogisticsReportsPage /> : <ReportsPage />}
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/objectives") && (
            <Route
              path="/objectives"
              element={
                <ProtectedRoute permission="objectives.read">
                  <ObjectivesPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/admin/users") && (
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute permission="users.read">
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/admin/roles") && (
            <Route
              path="/admin/roles"
              element={
                <ProtectedRoute anyOf={["roles.read", "users.permissions"]}>
                  <RolesPage />
                </ProtectedRoute>
              }
            />
            )}
            {inThisApp("/admin/audit") && (
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute permission="audit.read">
                  <AuditPage />
                </ProtectedRoute>
              }
            />
            )}
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/more" element={<MorePage />} />
          </Route>

          {/* Catch-all 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
