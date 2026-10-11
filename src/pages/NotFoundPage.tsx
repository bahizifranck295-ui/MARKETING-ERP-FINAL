import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
        <Landmark className="h-8 w-8" />
      </div>
      <h1 className="text-3xl font-black text-slate-900">404 - Page non trouvée</h1>
      <p className="text-sm text-slate-500 max-w-sm">
        La page ou ressource demandée n'existe pas ou a été déplacée.
      </p>
      <Link to="/dashboard">
        <Button className="rounded-xl bg-brand text-white">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour au Tableau de bord
        </Button>
      </Link>
    </div>
  );
}
