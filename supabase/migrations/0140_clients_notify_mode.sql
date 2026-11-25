-- Rota fixa diária (ex.: TRT): passageiros recebem só o aviso "a caminho".
alter table public.clients add column if not exists notify_mode text not null default 'completo' check (notify_mode in ('completo','so_a_caminho'));
