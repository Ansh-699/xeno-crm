import type { Metadata } from "next";
import { DocsPage } from "@/components/docs/docs-page";

export const metadata: Metadata = {
  title: "Docs — Xeno CRM",
  description: "Architecture, data model, API reference, and design decisions for Xeno CRM.",
};

export default function Docs() {
  return <DocsPage />;
}
