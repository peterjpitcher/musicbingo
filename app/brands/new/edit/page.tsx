"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { BrandForm } from "@/components/brand/BrandForm";

export default function NewBrandPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title="New Brand"
        subtitle="Create a new venue brand"
        variant="light"
      />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <BrandForm />
      </main>
    </div>
  );
}
