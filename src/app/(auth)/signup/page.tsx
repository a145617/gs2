import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-forms";

export const metadata = { title: "新規登録" };

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
