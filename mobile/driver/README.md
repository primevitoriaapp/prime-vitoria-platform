# App do motorista (Android / iPhone)

Casca nativa (Capacitor) que abre `https://motorista.primevitoria.com/driver`.
O que ganha em relação ao site: GPS continua com a tela apagada durante a corrida
(plugin `@capacitor-community/background-geolocation`, notificação fixa "corrida em andamento").

- Dono da conta nas lojas: **Prime Locadora & Serviços LTDA** (nada em nome de pessoa física).
- ID do app: `com.primevitoria.motorista` (não muda nunca depois de publicado).
- Build: GitHub Actions → workflow "App motorista (Android)". Gera o APK de teste como artefato.
- O site detecta o app pela ponte `window.Capacitor` (`src/lib/native/native-geo.ts`).
