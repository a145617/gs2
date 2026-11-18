import { Suspense } from "react";
import { AccessForm } from "@/components/auth/access-form";

export const metadata = { title: "合言葉" };

export default function AccessPage() {
  return (
    <Suspense>
      <AccessForm />
    </Suspense>
  );
}
