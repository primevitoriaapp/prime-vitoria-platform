import { DriverConsole } from "@/components/driver-console";
import { DriverPushRegister } from "@/components/driver-push-register";

export default function DriverPage() {
  return (
    <main>
      <h1>Painel do Motorista (PWA)</h1>
      <div className="card">
        <p>Fluxo operacional: aceitar corrida, a caminho, chegou, em andamento e finalizada.</p>
        <p>Navegação externa:</p>
        <ul>
          <li>Waze: waze://?ll=LAT,LNG&navigate=yes</li>
          <li>Google Maps: https://www.google.com/maps/dir/?api=1&destination=LAT,LNG</li>
        </ul>
      </div>
      <DriverPushRegister />
      <DriverConsole />
    </main>
  );
}
