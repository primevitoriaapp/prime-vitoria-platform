import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; troca?: string }> }) {
  const params = await searchParams;
  return <LoginForm defaultNext={params.next} switchAccount={params.troca === "1"} />;
}
