-- Regra operacional: oferta automática e despacho direto automático são mutuamente exclusivos.

update dispatch_automation_settings
set auto_offer_on_approve = false
where coalesce(auto_direct_assign_on_approve, false) = true
  and coalesce(auto_offer_on_approve, false) = true;

do $$
begin
  alter table dispatch_automation_settings
    add constraint dispatch_automation_offer_vs_direct_exclusive
    check (
      not (
        coalesce(auto_offer_on_approve, false)
        and coalesce(auto_direct_assign_on_approve, false)
      )
    );
exception
  when duplicate_object then null;
end $$;
