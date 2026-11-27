-- Arquivos dos apps (APK de teste do motorista). Privado: só sai por link assinado.
insert into storage.buckets (id, name, public, file_size_limit)
values ('app-builds', 'app-builds', false, 200000000)
on conflict (id) do nothing;
