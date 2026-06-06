import { DriverPinLoginForm } from "./driver-pin-login-form";

export default async function DriverLoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="min-h-screen bg-prime-bg px-5 py-10 text-slate-100">
      <main className="mx-auto flex min-h-[80vh] max-w-lg flex-col items-center justify-center">
        <DriverPinLoginForm defaultNext={next} />
      </main>
    </div>
  );
}
