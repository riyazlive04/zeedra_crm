import { Suspense } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your solar sales workspace.">
      <Suspense>
        <LoginForm showDemo={process.env.DEMO_MODE === "true"} />
      </Suspense>
    </AuthLayout>
  );
}
