import { DriverPinLoginForm } from "./driver-pin-login-form";

export default async function DriverLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <DriverPinLoginForm defaultNext={next} />;
}
