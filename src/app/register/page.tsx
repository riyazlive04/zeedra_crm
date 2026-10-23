import { AuthLayout } from "@/components/auth-layout";
import { RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Create your workspace" };

export default function RegisterPage() {
  return (
    <AuthLayout title="Start your free workspace" subtitle="Set up in 2 minutes. No credit card required.">
      <RegisterForm />
    </AuthLayout>
  );
}
