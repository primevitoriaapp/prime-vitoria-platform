export type SiteLang = "pt" | "en" | "es";

export const SITE_LANGS: { id: SiteLang; label: string; path: string }[] = [
  { id: "pt", label: "PT", path: "/site" },
  { id: "en", label: "EN", path: "/site/en" },
  { id: "es", label: "ES", path: "/site/es" }
];

type Item = { t: string; d: string };

export type SiteText = {
  meta: { title: string; description: string };
  nav: { servicos: string; empresas: string; frota: string; contato: string; area: string; agendar: string };
  hero: { kicker: string; title: string; sub: string; whatsapp: string; badges: [string, string, string]; alt: string };
  servicos: { kicker: string; title: string; items: Item[] };
  passos: { kicker: string; title: string; items: Item[] };
  empresas: { kicker: string; title: string; sub: string; bullets: string[]; entrar: string; cadastrar: string; mock: { ola: string; sub: string; agendar: string; proximas: string; hoje: string; amanha: string } };
  frota: { kicker: string; title: string; items: Item[]; extra: string };
  operacao: { kicker: string; title: string };
  google: { kicker: string; title: string; sub: string; ver: string; avaliar: string };
  clientes: string;
  diferenciais: { kicker: string; title: string; items: string[] };
  cidades: { kicker: string; title: string };
  cta: { title: string; sub: string };
  footer: { fale: string; acesso: string; privacidade: string };
  whatsappMsg: string;
};

export const SITE_TEXT: Record<SiteLang, SiteText> = {
  pt: {
    meta: {
      title: "Prime Vitória · Transporte Executivo no Espírito Santo",
      description: "Transfer para aeroporto, motorista executivo à disposição, eventos, casamentos e viagens. Agende online e acompanhe o motorista ao vivo."
    },
    nav: { servicos: "Serviços", empresas: "Empresas", frota: "Frota", contato: "Contato", area: "Área da empresa", agendar: "Agendar viagem" },
    hero: {
      kicker: "Transporte executivo · Espírito Santo",
      title: "Sua agenda no horário. Seu conforto em primeiro lugar.",
      sub: "Motoristas profissionais, carros executivos e acompanhamento ao vivo de cada viagem — do aeroporto à reunião, do evento ao hotel.",
      whatsapp: "Falar no WhatsApp",
      badges: ["10 anos de estrada", "Monitoramento de voo", "Motorista ao vivo no seu celular"],
      alt: "Terceira Ponte, Vitória/ES"
    },
    servicos: {
      kicker: "Serviços",
      title: "Para cada compromisso, o carro certo.",
      items: [
        { t: "Transfer aeroporto", d: "Monitoramos o seu voo e o motorista te espera no desembarque, mesmo com atraso." },
        { t: "Executivo à disposição", d: "Carro e motorista por 5, 10 ou 15 horas para reuniões e agendas cheias." },
        { t: "Viagens intermunicipais", d: "Guarapari, Linhares, Domingos Martins e todo o estado com conforto." },
        { t: "Eventos e convenções", d: "Logística de embarque para grupos, palestrantes e convidados, do aeroporto ao hotel." },
        { t: "Casamentos", d: "Carro dos noivos e transporte de convidados, com pontualidade no dia mais importante." },
        { t: "Blindados", d: "Segurança com discrição para executivos, artistas e autoridades." }
      ]
    },
    passos: {
      kicker: "Como funciona",
      title: "Simples do pedido ao desembarque.",
      items: [
        { t: "Peça seu orçamento", d: "Pelo site, pelo portal da empresa ou pelo WhatsApp. A central responde rapidinho." },
        { t: "Acompanhe ao vivo", d: "Antes de sair, chega um link com o motorista, o carro e a localização em tempo real." },
        { t: "Viaje tranquilo", d: "Ao final, avalie o atendimento. Empresas recebem tudo numa fatura mensal." }
      ]
    },
    empresas: {
      kicker: "Para empresas",
      title: "Sua empresa com um portal próprio de mobilidade.",
      sub: "Sua equipe agenda as viagens, você acompanha tudo em tempo real e recebe uma fatura única no fim do mês — com centro de custo, relatórios e comprovação de cada corrida.",
      bullets: ["Cada colaborador com seu acesso", "Corridas separadas por centro de custo", "Fatura mensal com comprovantes", "Assinatura do passageiro ao final"],
      entrar: "Entrar na área da empresa",
      cadastrar: "Cadastrar minha empresa",
      mock: { ola: "Olá, Ana", sub: "Para onde sua empresa vai hoje?", agendar: "Agendar viagem", proximas: "Próximas viagens", hoje: "Hoje · 14h30", amanha: "Amanhã · 08h00" }
    },
    frota: {
      kicker: "Frota",
      title: "Carros executivos, sempre impecáveis.",
      items: [
        { t: "Sedan executivo", d: "Conforto e discrição para o dia a dia" },
        { t: "SUV executivo", d: "Mais espaço e porta-malas amplo" },
        { t: "Van executiva", d: "Grupos, famílias e eventos" }
      ],
      extra: "Também temos blindados, micro-ônibus e ônibus — consulte."
    },
    operacao: { kicker: "Em operação", title: "Nossa frota no dia a dia." },
    google: {
      kicker: "Avaliações",
      title: "Quem viaja com a gente recomenda.",
      sub: "Veja o que os nossos passageiros dizem no Google — e, se já viajou com a Prime, conte como foi.",
      ver: "Ver avaliações no Google",
      avaliar: "Deixar minha avaliação"
    },
    clientes: "Empresas que confiam na Prime",
    diferenciais: {
      kicker: "Diferenciais",
      title: "O cuidado está nos detalhes.",
      items: ["Monitoramento de voo", "Motorista acompanhado ao vivo", "Veículos higienizados diariamente", "Wi-fi, carregador e serviço de bordo", "Fatura mensal para empresas", "Atendimento a turistas e estrangeiros"]
    },
    cidades: { kicker: "Onde atendemos", title: "Base no Espírito Santo. Parceiros nas capitais." },
    cta: { title: "Pronto para a próxima viagem?", sub: "Peça agora e receba o orçamento em minutos." },
    footer: { fale: "Fale com a gente", acesso: "Acesso rápido", privacidade: "Privacidade e termos" },
    whatsappMsg: "Olá, vim pelo site da Prime Vitória."
  },
  en: {
    meta: {
      title: "Prime Vitória · Executive Chauffeur Service in Espírito Santo, Brazil",
      description: "Airport transfers, chauffeur at your disposal, events, weddings and intercity trips in Vitória, Brazil. Track your driver live."
    },
    nav: { servicos: "Services", empresas: "Companies", frota: "Fleet", contato: "Contact", area: "Company login", agendar: "Book a ride" },
    hero: {
      kicker: "Executive chauffeur · Vitória, Brazil",
      title: "On time for every meeting. Comfort comes first.",
      sub: "Professional drivers, executive cars and live tracking of every ride — from the airport to your meeting, from the event to your hotel.",
      whatsapp: "Chat on WhatsApp",
      badges: ["10 years on the road", "Flight monitoring", "Track your driver live"],
      alt: "Terceira Ponte bridge, Vitória, Brazil"
    },
    servicos: {
      kicker: "Services",
      title: "The right car for every occasion.",
      items: [
        { t: "Airport transfer", d: "We track your flight and your driver waits at arrivals, even if you are delayed." },
        { t: "Chauffeur at your disposal", d: "Car and driver for 5, 10 or 15 hours for meetings and busy schedules." },
        { t: "Intercity trips", d: "Guarapari, Linhares, Domingos Martins and the whole state in comfort." },
        { t: "Events and conventions", d: "Ground logistics for groups, speakers and guests, from the airport to the hotel." },
        { t: "Weddings", d: "Bridal car and guest transportation, right on time on the big day." },
        { t: "Armored vehicles", d: "Discreet security for executives, artists and officials." }
      ]
    },
    passos: {
      kicker: "How it works",
      title: "Simple from request to arrival.",
      items: [
        { t: "Request a quote", d: "On this website, through your company portal or on WhatsApp. We reply quickly." },
        { t: "Track it live", d: "Before pickup you get a link with your driver, the car and the real-time location." },
        { t: "Ride relaxed", d: "Rate the service at the end. Companies receive one monthly invoice." }
      ]
    },
    empresas: {
      kicker: "For companies",
      title: "A dedicated mobility portal for your company.",
      sub: "Your team books the rides, you follow everything in real time and receive a single monthly invoice — with cost centers, reports and proof of every ride.",
      bullets: ["Individual access for each employee", "Rides split by cost center", "Monthly invoice with receipts", "Passenger signature at drop-off"],
      entrar: "Company login",
      cadastrar: "Register my company",
      mock: { ola: "Hi, Anna", sub: "Where is your company going today?", agendar: "Book a ride", proximas: "Upcoming rides", hoje: "Today · 2:30 pm", amanha: "Tomorrow · 8:00 am" }
    },
    frota: {
      kicker: "Fleet",
      title: "Executive cars, always spotless.",
      items: [
        { t: "Executive sedan", d: "Comfort and discretion for everyday trips" },
        { t: "Executive SUV", d: "More room and a large trunk" },
        { t: "Executive van", d: "Groups, families and events" }
      ],
      extra: "Armored cars, minibuses and coaches also available on request."
    },
    operacao: { kicker: "On the road", title: "Our fleet at work." },
    google: {
      kicker: "Reviews",
      title: "Our passengers recommend us.",
      sub: "See what our passengers say on Google — and if you have ridden with Prime, tell us how it went.",
      ver: "See our Google reviews",
      avaliar: "Write a review"
    },
    clientes: "Companies that trust Prime",
    diferenciais: {
      kicker: "Why Prime",
      title: "Care in every detail.",
      items: ["Flight monitoring", "Live driver tracking", "Vehicles sanitized daily", "Wi-fi, chargers and onboard amenities", "Monthly invoicing for companies", "Experienced with international travelers"]
    },
    cidades: { kicker: "Where we operate", title: "Based in Espírito Santo. Partners in major Brazilian cities." },
    cta: { title: "Ready for your next ride?", sub: "Request now and get your quote in minutes." },
    footer: { fale: "Contact us", acesso: "Quick links", privacidade: "Privacy and terms" },
    whatsappMsg: "Hello, I found Prime Vitória on your website."
  },
  es: {
    meta: {
      title: "Prime Vitória · Transporte Ejecutivo en Espírito Santo, Brasil",
      description: "Traslados al aeropuerto, chofer a disposición, eventos, bodas y viajes en Vitória, Brasil. Sigue a tu conductor en vivo."
    },
    nav: { servicos: "Servicios", empresas: "Empresas", frota: "Flota", contato: "Contacto", area: "Área de empresas", agendar: "Reservar viaje" },
    hero: {
      kicker: "Transporte ejecutivo · Vitória, Brasil",
      title: "Puntual en cada compromiso. Tu comodidad primero.",
      sub: "Conductores profesionales, autos ejecutivos y seguimiento en vivo de cada viaje — del aeropuerto a la reunión, del evento al hotel.",
      whatsapp: "Hablar por WhatsApp",
      badges: ["10 años en el camino", "Monitoreo de vuelos", "Tu conductor en vivo"],
      alt: "Tercer Puente, Vitória, Brasil"
    },
    servicos: {
      kicker: "Servicios",
      title: "El auto ideal para cada ocasión.",
      items: [
        { t: "Traslado al aeropuerto", d: "Monitoreamos tu vuelo y el conductor te espera en llegadas, incluso con retraso." },
        { t: "Chofer a disposición", d: "Auto y conductor por 5, 10 o 15 horas para reuniones y agendas llenas." },
        { t: "Viajes interurbanos", d: "Guarapari, Linhares, Domingos Martins y todo el estado con comodidad." },
        { t: "Eventos y convenciones", d: "Logística para grupos, ponentes e invitados, del aeropuerto al hotel." },
        { t: "Bodas", d: "Auto de los novios y traslado de invitados, puntual en el gran día." },
        { t: "Blindados", d: "Seguridad discreta para ejecutivos, artistas y autoridades." }
      ]
    },
    passos: {
      kicker: "Cómo funciona",
      title: "Simple de la solicitud a la llegada.",
      items: [
        { t: "Pide tu cotización", d: "En el sitio, en el portal de tu empresa o por WhatsApp. Respondemos rápido." },
        { t: "Síguelo en vivo", d: "Antes de salir recibes un enlace con el conductor, el auto y la ubicación en tiempo real." },
        { t: "Viaja tranquilo", d: "Al final, califica el servicio. Las empresas reciben una factura mensual." }
      ]
    },
    empresas: {
      kicker: "Para empresas",
      title: "Un portal de movilidad propio para tu empresa.",
      sub: "Tu equipo reserva los viajes, tú sigues todo en tiempo real y recibes una sola factura mensual — con centros de costo, informes y comprobante de cada viaje.",
      bullets: ["Acceso individual para cada colaborador", "Viajes por centro de costo", "Factura mensual con comprobantes", "Firma del pasajero al final"],
      entrar: "Acceso de empresas",
      cadastrar: "Registrar mi empresa",
      mock: { ola: "Hola, Ana", sub: "¿A dónde va tu empresa hoy?", agendar: "Reservar viaje", proximas: "Próximos viajes", hoje: "Hoy · 14:30", amanha: "Mañana · 08:00" }
    },
    frota: {
      kicker: "Flota",
      title: "Autos ejecutivos, siempre impecables.",
      items: [
        { t: "Sedán ejecutivo", d: "Comodidad y discreción para el día a día" },
        { t: "SUV ejecutiva", d: "Más espacio y maletero amplio" },
        { t: "Van ejecutiva", d: "Grupos, familias y eventos" }
      ],
      extra: "También ofrecemos blindados, minibuses y autobuses — consulta."
    },
    operacao: { kicker: "En operación", title: "Nuestra flota en el día a día." },
    google: {
      kicker: "Opiniones",
      title: "Nuestros pasajeros nos recomiendan.",
      sub: "Mira lo que dicen nuestros pasajeros en Google — y si ya viajaste con Prime, cuéntanos cómo fue.",
      ver: "Ver opiniones en Google",
      avaliar: "Dejar mi opinión"
    },
    clientes: "Empresas que confían en Prime",
    diferenciais: {
      kicker: "Diferenciales",
      title: "El cuidado está en los detalles.",
      items: ["Monitoreo de vuelos", "Conductor en vivo", "Vehículos higienizados a diario", "Wi-fi, cargador y servicio a bordo", "Factura mensual para empresas", "Experiencia con viajeros internacionales"]
    },
    cidades: { kicker: "Dónde atendemos", title: "Base en Espírito Santo. Socios en las principales ciudades de Brasil." },
    cta: { title: "¿Listo para tu próximo viaje?", sub: "Solicítalo ahora y recibe tu cotización en minutos." },
    footer: { fale: "Contáctanos", acesso: "Accesos", privacidade: "Privacidad y términos" },
    whatsappMsg: "Hola, encontré Prime Vitória en su sitio web."
  }
};
