import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  children,
  permission = null,
}: {
  children: React.ReactNode;
  permission?: string | null;
}) {
  const { user, loading, has } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F3D68]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !has(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
