export type SiteLang = "pt" | "en" | "es";

export const SITE_LANGS: { id: SiteLang; label: string; path: string }[] = [
  { id: "pt", label: "PT", path: "/site" },
  { id: "en", label: "EN", path: "/site/en" },
  { id: "es", label: "ES", path: "/site/es" }
];

type Item = { t: string; d: string };

export type SiteText = {
  meta: { title: string; description: string };
  nav: { servicos: string; empresas: string; frota: string; contato: string; area: string; agendar: string; entrar: string; cliente: string; motorista: string };
  hero: { kicker: string; title: string; sub: string; whatsapp: string; badges: [string, string, string]; alt: string };
  mapa: { kicker: string; title: string; sub: string; sede: string };
  servicos: { kicker: string; title: string; items: Item[] };
  passos: { kicker: string; title: string; items: Item[] };
  empresas: { kicker: string; title: string; sub: string; bullets: string[]; entrar: string; cadastrar: string; waMsg: string; mock: { ola: string; sub: string; agendar: string; proximas: string; hoje: string; amanha: string } };
  frota: { kicker: string; title: string; items: Item[]; extra: string };
  operacao: { kicker: string; title: string; legendas: string[] };
  equipe: { kicker: string; title: string; sub: string };
  casamento: { kicker: string; title: string; sub: string; cta: string; waMsg: string };
  google: { kicker: string; title: string; sub: string; ver: string; avaliar: string };
  clientes: string;
  parceiro: { kicker: string; title: string; sub: string; cta: string; waMsg: string };
  reviewsWord: string;
  close: string;
  diferenciais: { kicker: string; title: string; items: string[] };
  cidades: { kicker: string; title: string };
  cta: { title: string; sub: string };
  footer: { fale: string; acesso: string; privacidade: string; ligar: string; fixo: string; celular: string };
  whatsappMsg: string;
};

export const SITE_TEXT: Record<SiteLang, SiteText> = {
  pt: {
    meta: {
      title: "Prime Vitória · Transporte Executivo no Espírito Santo",
      description: "Transfer para aeroporto, motorista executivo à disposição, eventos, casamentos e viagens. Agende online e acompanhe o motorista ao vivo."
    },
    nav: { servicos: "Serviços", empresas: "Empresas", frota: "Frota", contato: "Contato", area: "Área do cliente", agendar: "Agendar viagem", entrar: "Entrar", cliente: "Área do cliente", motorista: "Área do motorista" },
    hero: {
      kicker: "Prime Vitória · há 10 anos",
      title: "Transporte executivo no Espírito Santo",
      sub: "Carros executivos, vans, ônibus e blindados para empresas, eventos e viagens — com acompanhamento ao vivo de cada corrida.",
      whatsapp: "Falar no WhatsApp",
      badges: ["10 anos de estrada", "Monitoramento de voo", "Motorista ao vivo no seu celular"],
      alt: "Terceira Ponte, Vitória/ES"
    },
    mapa: { kicker: "Onde atendemos", title: "De Vitória para todo o Brasil.", sub: "Nossa sede é em Vitória, no Espírito Santo, e levamos o padrão Prime para todas as capitais do Brasil.", sede: "Sede" },
    servicos: {
      kicker: "Serviços",
      title: "Para cada compromisso, o carro certo.",
      items: [
        { t: "Transfer aeroporto", d: "Monitoramos o seu voo e o motorista te espera no desembarque, mesmo com atraso." },
        { t: "Executivo à disposição", d: "Carro e motorista por 5, 10 ou 15 horas para reuniões e agendas cheias." },
        { t: "Viagens intermunicipais", d: "Guarapari, Linhares, Domingos Martins e todo o estado com conforto." },
        { t: "Eventos corporativos", d: "Logística de embarque para grupos, palestrantes e convidados, do aeroporto ao hotel." },
        { t: "Casamentos", d: "Carro dos noivos e transporte de convidados, com pontualidade no dia mais importante." },
        { t: "Blindados", d: "Segurança com discrição para executivos, artistas e autoridades." },
        { t: "Vans de 15 e 20 lugares", d: "Grupos, equipes e famílias viajando juntos com conforto." },
        { t: "Ônibus e micro-ônibus", d: "Excursões, eventos e transporte de grandes grupos." }
      ]
    },
    passos: {
      kicker: "Como funciona",
      title: "Simples do pedido ao desembarque.",
      items: [
        { t: "Peça seu orçamento", d: "Pelo site, pelo portal da empresa ou pelo WhatsApp. A central responde rapidinho." },
        { t: "Acompanhe ao vivo", d: "Antes de sair, chega um link com o motorista, o carro e a localização em tempo real." },
        { t: "Viaje tranquilo", d: "Ao final, avalie o atendimento. Empresas parceiras podem ter faturamento mensal (consulte)." }
      ]
    },
    empresas: {
      kicker: "Para empresas",
      title: "Sua empresa com um portal próprio de mobilidade.",
      sub: "Sua equipe agenda as viagens, você acompanha tudo em tempo real com centro de custo, relatórios e comprovação de cada corrida. Faturamento mensal sob consulta.",
      bullets: ["Cada colaborador com seu acesso", "Corridas separadas por centro de custo", "Faturamento mensal (consulte)", "Assinatura do passageiro ao final"],
      entrar: "Entrar na área da empresa",
      cadastrar: "Cadastre sua empresa e tenha acesso ao portal",
      waMsg: "Olá, quero cadastrar minha empresa na Prime Vitória.",
      mock: { ola: "Olá, Ana", sub: "Para onde sua empresa vai hoje?", agendar: "Agendar viagem", proximas: "Próximas viagens", hoje: "Hoje · 14h30", amanha: "Amanhã · 08h00" }
    },
    frota: {
      kicker: "Frota",
      title: "Carros executivos, sempre impecáveis.",
      items: [
        { t: "Prime Essencial", d: "Conforto e economia para o dia a dia" },
        { t: "Sedan executivo", d: "Até 3 passageiros, discrição e pontualidade" },
        { t: "Executivo Premium SUV", d: "Mais espaço, porta-malas amplo e alto padrão" },
        { t: "Blindado executivo", d: "Segurança com discrição para executivos e autoridades" },
        { t: "Van executiva luxo", d: "Bancos de couro, iluminação e conforto para grupos" },
        { t: "Van 20 lugares", d: "Equipes, famílias e eventos" },
        { t: "Ônibus", d: "Excursões, eventos e grandes grupos" }
      ],
      extra: "Micro-ônibus e outras configurações sob consulta."
    },
    operacao: { kicker: "Em operação", title: "Nossa frota no dia a dia.", legendas: ["Nossa frota em evento corporativo", "Atendimento no porto de Vitória", "Comboio na serra capixaba", "Fim de tarde no interior do ES", "Orla de Vitória"] },
    casamento: { kicker: "Casamentos", title: "O carro da noiva, no horário certo.", sub: "Carro impecável, motorista de terno e toda a atenção para a chegada mais esperada do dia. Também levamos padrinhos e convidados.", cta: "Pedir orçamento para casamento", waMsg: "Olá, quero um orçamento para o carro da noiva." },
    equipe: { kicker: "Nossa equipe", title: "Motoristas treinados e uniformizados.", sub: "Equipe de terno, pontual e preparada para atender executivos, artistas e grandes eventos." },
    google: {
      kicker: "Avaliações",
      title: "Quem viaja com a gente recomenda.",
      sub: "Veja o que os nossos passageiros dizem no Google — e, se já viajou com a Prime, conte como foi.",
      ver: "Ver avaliações no Google",
      avaliar: "Deixar minha avaliação"
    },
    clientes: "Empresas que confiam na Prime",
    parceiro: {
      kicker: "Trabalhe com a gente",
      title: "Seja um motorista parceiro Prime.",
      sub: "Motorista profissional, carro executivo e atendimento de alto padrão? Cadastre-se e receba corridas pelo nosso aplicativo.",
      cta: "Quero ser parceiro",
      waMsg: "Olá, quero ser motorista parceiro da Prime Vitória."
    },
    reviewsWord: "avaliações",
    close: "Fechar",
    diferenciais: {
      kicker: "Diferenciais",
      title: "O cuidado está nos detalhes.",
      items: ["Monitoramento de voo", "Central acompanhando o motorista ao vivo, 24 horas", "Veículos higienizados todos os dias", "Wi-fi, carregador e serviço de bordo", "Motoristas bilíngues"]
    },
    cidades: { kicker: "Onde atendemos", title: "Base no Espírito Santo. Parceiros nas capitais." },
    cta: { title: "Pronto para a próxima viagem?", sub: "Peça agora e receba o orçamento em minutos." },
    footer: { fale: "Fale com a gente", acesso: "Acesso rápido", privacidade: "Privacidade e termos", ligar: "Ligar", fixo: "Central", celular: "Celular" },
    whatsappMsg: "Olá, vim pelo site da Prime Vitória."
  },
  en: {
    meta: {
      title: "Prime Vitória · Executive Chauffeur Service in Espírito Santo, Brazil",
      description: "Airport transfers, chauffeur at your disposal, events, weddings and intercity trips in Vitória, Brazil. Track your driver live."
    },
    nav: { servicos: "Services", empresas: "Companies", frota: "Fleet", contato: "Contact", area: "Client area", agendar: "Book a ride", entrar: "Log in", cliente: "Client area", motorista: "Driver area" },
    hero: {
      kicker: "Prime Vitória · 10 years",
      title: "Executive transportation in Espírito Santo, Brazil",
      sub: "Executive cars, vans, coaches and armored vehicles for companies, events and travel — with live tracking of every ride.",
      whatsapp: "Chat on WhatsApp",
      badges: ["10 years on the road", "Flight monitoring", "Track your driver live"],
      alt: "Terceira Ponte bridge, Vitória, Brazil"
    },
    mapa: { kicker: "Where we operate", title: "From Vitória to all of Brazil.", sub: "Our headquarters are in Vitória, Espírito Santo, and we bring the Prime standard to every state capital in Brazil.", sede: "Headquarters" },
    servicos: {
      kicker: "Services",
      title: "The right car for every occasion.",
      items: [
        { t: "Airport transfer", d: "We track your flight and your driver waits at arrivals, even if you are delayed." },
        { t: "Chauffeur at your disposal", d: "Car and driver for 5, 10 or 15 hours for meetings and busy schedules." },
        { t: "Intercity trips", d: "Guarapari, Linhares, Domingos Martins and the whole state in comfort." },
        { t: "Corporate events", d: "Ground logistics for groups, speakers and guests, from the airport to the hotel." },
        { t: "Weddings", d: "Bridal car and guest transportation, right on time on the big day." },
        { t: "Armored vehicles", d: "Discreet security for executives, artists and officials." },
        { t: "15 and 20-seat vans", d: "Groups, teams and families traveling together in comfort." },
        { t: "Coaches and minibuses", d: "Tours, events and large group transportation." }
      ]
    },
    passos: {
      kicker: "How it works",
      title: "Simple from request to arrival.",
      items: [
        { t: "Request a quote", d: "On this website, through your company portal or on WhatsApp. We reply quickly." },
        { t: "Track it live", d: "Before pickup you get a link with your driver, the car and the real-time location." },
        { t: "Ride relaxed", d: "Rate the service at the end. Monthly invoicing available for partner companies (on request)." }
      ]
    },
    empresas: {
      kicker: "For companies",
      title: "A dedicated mobility portal for your company.",
      sub: "Your team books the rides, you follow everything in real time with cost centers, reports and proof of every ride. Monthly invoicing on request.",
      bullets: ["Individual access for each employee", "Rides split by cost center", "Monthly invoicing (on request)", "Passenger signature at drop-off"],
      entrar: "Company login",
      cadastrar: "Register your company and get portal access",
      waMsg: "Hello, I would like to register my company with Prime Vitória.",
      mock: { ola: "Hi, Anna", sub: "Where is your company going today?", agendar: "Book a ride", proximas: "Upcoming rides", hoje: "Today · 2:30 pm", amanha: "Tomorrow · 8:00 am" }
    },
    frota: {
      kicker: "Fleet",
      title: "Executive cars, always spotless.",
      items: [
        { t: "Prime Essential", d: "Comfort and value for everyday trips" },
        { t: "Executive sedan", d: "Up to 3 passengers, discreet and on time" },
        { t: "Premium executive SUV", d: "More room, large trunk and top comfort" },
        { t: "Armored executive car", d: "Discreet security for executives and officials" },
        { t: "Luxury executive van", d: "Leather seats, ambient lighting, comfort for groups" },
        { t: "20-seat van", d: "Teams, families and events" },
        { t: "Coach", d: "Tours, events and large groups" }
      ],
      extra: "Minibuses and other configurations on request."
    },
    operacao: { kicker: "On the road", title: "Our fleet at work.", legendas: ["Our fleet at a corporate event", "Service at the Port of Vitória", "Convoy in the Espírito Santo mountains", "Sunset in the countryside", "Vitória waterfront"] },
    casamento: { kicker: "Weddings", title: "The bridal car, right on time.", sub: "A spotless car, a suited driver and full attention for the most awaited arrival of the day. We also drive the wedding party and guests.", cta: "Request a wedding quote", waMsg: "Hello, I would like a quote for a bridal car." },
    equipe: { kicker: "Our team", title: "Trained, uniformed drivers.", sub: "A suited, punctual team ready to serve executives, artists and large events." },
    google: {
      kicker: "Reviews",
      title: "Our passengers recommend us.",
      sub: "See what our passengers say on Google — and if you have ridden with Prime, tell us how it went.",
      ver: "See our Google reviews",
      avaliar: "Write a review"
    },
    clientes: "Companies that trust Prime",
    parceiro: {
      kicker: "Work with us",
      title: "Become a Prime partner driver.",
      sub: "Professional driver with an executive car? Sign up and receive rides through our app.",
      cta: "Become a partner",
      waMsg: "Hello, I would like to become a Prime Vitória partner driver."
    },
    reviewsWord: "reviews",
    close: "Close",
    diferenciais: {
      kicker: "Why Prime",
      title: "Care in every detail.",
      items: ["Flight monitoring", "24/7 control center tracking every driver live", "Vehicles sanitized every day", "Wi-fi, chargers and onboard amenities", "Bilingual drivers"]
    },
    cidades: { kicker: "Where we operate", title: "Based in Espírito Santo. Partners in major Brazilian cities." },
    cta: { title: "Ready for your next ride?", sub: "Request now and get your quote in minutes." },
    footer: { fale: "Contact us", acesso: "Quick links", privacidade: "Privacy and terms", ligar: "Call", fixo: "Office", celular: "Mobile" },
    whatsappMsg: "Hello, I found Prime Vitória on your website."
  },
  es: {
    meta: {
      title: "Prime Vitória · Transporte Ejecutivo en Espírito Santo, Brasil",
      description: "Traslados al aeropuerto, chofer a disposición, eventos, bodas y viajes en Vitória, Brasil. Sigue a tu conductor en vivo."
    },
    nav: { servicos: "Servicios", empresas: "Empresas", frota: "Flota", contato: "Contacto", area: "Área del cliente", agendar: "Reservar viaje", entrar: "Entrar", cliente: "Área del cliente", motorista: "Área del conductor" },
    hero: {
      kicker: "Prime Vitória · 10 años",
      title: "Transporte ejecutivo en Espírito Santo, Brasil",
      sub: "Autos ejecutivos, vans, autobuses y blindados para empresas, eventos y viajes — con seguimiento en vivo de cada viaje.",
      whatsapp: "Hablar por WhatsApp",
      badges: ["10 años en el camino", "Monitoreo de vuelos", "Tu conductor en vivo"],
      alt: "Tercer Puente, Vitória, Brasil"
    },
    mapa: { kicker: "Dónde atendemos", title: "De Vitória a todo Brasil.", sub: "Nuestra sede está en Vitória, Espírito Santo, y llevamos el estándar Prime a todas las capitales de Brasil.", sede: "Sede" },
    servicos: {
      kicker: "Servicios",
      title: "El auto ideal para cada ocasión.",
      items: [
        { t: "Traslado al aeropuerto", d: "Monitoreamos tu vuelo y el conductor te espera en llegadas, incluso con retraso." },
        { t: "Chofer a disposición", d: "Auto y conductor por 5, 10 o 15 horas para reuniones y agendas llenas." },
        { t: "Viajes interurbanos", d: "Guarapari, Linhares, Domingos Martins y todo el estado con comodidad." },
        { t: "Eventos corporativos", d: "Logística para grupos, ponentes e invitados, del aeropuerto al hotel." },
        { t: "Bodas", d: "Auto de los novios y traslado de invitados, puntual en el gran día." },
        { t: "Blindados", d: "Seguridad discreta para ejecutivos, artistas y autoridades." },
        { t: "Vans de 15 y 20 plazas", d: "Grupos, equipos y familias viajando juntos con comodidad." },
        { t: "Autobuses y minibuses", d: "Excursiones, eventos y traslado de grandes grupos." }
      ]
    },
    passos: {
      kicker: "Cómo funciona",
      title: "Simple de la solicitud a la llegada.",
      items: [
        { t: "Pide tu cotización", d: "En el sitio, en el portal de tu empresa o por WhatsApp. Respondemos rápido." },
        { t: "Síguelo en vivo", d: "Antes de salir recibes un enlace con el conductor, el auto y la ubicación en tiempo real." },
        { t: "Viaja tranquilo", d: "Al final, califica el servicio. Facturación mensual para empresas asociadas (consultar)." }
      ]
    },
    empresas: {
      kicker: "Para empresas",
      title: "Un portal de movilidad propio para tu empresa.",
      sub: "Tu equipo reserva los viajes, tú sigues todo en tiempo real con centros de costo, informes y comprobante de cada viaje. Facturación mensual a consultar.",
      bullets: ["Acceso individual para cada colaborador", "Viajes por centro de costo", "Facturación mensual (consultar)", "Firma del pasajero al final"],
      entrar: "Acceso de empresas",
      cadastrar: "Registra tu empresa y accede al portal",
      waMsg: "Hola, quiero registrar mi empresa en Prime Vitória.",
      mock: { ola: "Hola, Ana", sub: "¿A dónde va tu empresa hoy?", agendar: "Reservar viaje", proximas: "Próximos viajes", hoje: "Hoy · 14:30", amanha: "Mañana · 08:00" }
    },
    frota: {
      kicker: "Flota",
      title: "Autos ejecutivos, siempre impecables.",
      items: [
        { t: "Prime Esencial", d: "Comodidad y economía para el día a día" },
        { t: "Sedán ejecutivo", d: "Hasta 3 pasajeros, discreción y puntualidad" },
        { t: "SUV ejecutiva premium", d: "Más espacio, maletero amplio y alto nivel" },
        { t: "Blindado ejecutivo", d: "Seguridad discreta para ejecutivos y autoridades" },
        { t: "Van ejecutiva de lujo", d: "Asientos de cuero, iluminación y confort para grupos" },
        { t: "Van de 20 plazas", d: "Equipos, familias y eventos" },
        { t: "Autobús", d: "Excursiones, eventos y grandes grupos" }
      ],
      extra: "Minibuses y otras configuraciones a consultar."
    },
    operacao: { kicker: "En operación", title: "Nuestra flota en el día a día.", legendas: ["Nuestra flota en un evento corporativo", "Servicio en el puerto de Vitória", "Convoy en la sierra capixaba", "Atardecer en el interior", "Costanera de Vitória"] },
    casamento: { kicker: "Bodas", title: "El auto de la novia, a la hora exacta.", sub: "Auto impecable, conductor de traje y toda la atención para la llegada más esperada del día. También llevamos padrinos e invitados.", cta: "Pedir cotización para boda", waMsg: "Hola, quiero una cotización para el auto de la novia." },
    equipe: { kicker: "Nuestro equipo", title: "Conductores capacitados y uniformados.", sub: "Equipo de traje, puntual y preparado para ejecutivos, artistas y grandes eventos." },
    google: {
      kicker: "Opiniones",
      title: "Nuestros pasajeros nos recomiendan.",
      sub: "Mira lo que dicen nuestros pasajeros en Google — y si ya viajaste con Prime, cuéntanos cómo fue.",
      ver: "Ver opiniones en Google",
      avaliar: "Dejar mi opinión"
    },
    clientes: "Empresas que confían en Prime",
    parceiro: {
      kicker: "Trabaja con nosotros",
      title: "Sé un conductor asociado de Prime.",
      sub: "¿Conductor profesional con auto ejecutivo? Regístrate y recibe viajes por nuestra aplicación.",
      cta: "Quiero ser asociado",
      waMsg: "Hola, quiero ser conductor asociado de Prime Vitória."
    },
    reviewsWord: "opiniones",
    close: "Cerrar",
    diferenciais: {
      kicker: "Diferenciales",
      title: "El cuidado está en los detalles.",
      items: ["Monitoreo de vuelos", "Central que sigue al conductor en vivo, 24 horas", "Vehículos higienizados todos los días", "Wi-fi, cargador y servicio a bordo", "Conductores bilingües"]
    },
    cidades: { kicker: "Dónde atendemos", title: "Base en Espírito Santo. Socios en las principales ciudades de Brasil." },
    cta: { title: "¿Listo para tu próximo viaje?", sub: "Solicítalo ahora y recibe tu cotización en minutos." },
    footer: { fale: "Contáctanos", acesso: "Accesos", privacidade: "Privacidad y términos", ligar: "Llamar", fixo: "Central", celular: "Móvil" },
    whatsappMsg: "Hola, encontré Prime Vitória en su sitio web."
  }
};
