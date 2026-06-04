/** Rola até o formulário de nova solicitação no portal cliente. */
export function scrollToSolicitar() {
  const el = document.getElementById("solicitar");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  window.location.hash = "solicitar";
}
