-- Hotel Jardim — equipe (convites/papéis) + chat. Rodar DEPOIS do 001, no projeto Supabase PRÓPRIO do Hotel Jardim.
create table if not exists public.hj_perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '', email text,
  papel text not null default 'dono' check (papel in ('dono','equipe','camareira','cliente')),
  dono_id uuid references auth.users(id) on delete cascade, -- a qual dono pertence (dono: ele mesmo)
  created_at timestamptz not null default now());

create table if not exists public.hj_convites (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text not null, nome text, papel text not null check (papel in ('equipe','camareira','cliente')),
  aceito_em timestamptz, created_at timestamptz not null default now(), unique(owner, email));

create table if not exists public.hj_conversas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text, grupo boolean not null default false, created_at timestamptz not null default now());

create table if not exists public.hj_participantes (
  conversa_id uuid not null references public.hj_conversas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lido_em timestamptz not null default now(), primary key (conversa_id, user_id));

create table if not exists public.hj_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.hj_conversas(id) on delete cascade,
  autor uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text check (char_length(texto) <= 4000), foto text, -- foto = data URL jpeg comprimida (<= ~300 KB)
  created_at timestamptz not null default now(),
  check (texto is not null or foto is not null), check (foto is null or char_length(foto) < 450000));

create index if not exists hj_msg_conv_idx on public.hj_mensagens(conversa_id, created_at);
create index if not exists hj_part_user_idx on public.hj_participantes(user_id);
create index if not exists hj_perfis_dono_idx on public.hj_perfis(dono_id);
create index if not exists hj_conv_owner_idx on public.hj_convites(owner);

-- helpers (security definer evita recursão de RLS)
create or replace function public.hj_participa(c uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from hj_participantes where conversa_id=c and user_id=auth.uid()) $$;
create or replace function public.hj_meu_dono() returns uuid language sql stable security definer set search_path=public as
$$ select coalesce((select dono_id from hj_perfis where id=auth.uid()), auth.uid()) $$;

-- Ao entrar: cria perfil; se houver convite para o e-mail, vira membro daquele dono com o papel do convite.
create or replace function public.hj_entrar(p_nome text default null) returns public.hj_perfis
language plpgsql security definer set search_path=public as $$
declare v_email text; c hj_convites; p hj_perfis;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select email into v_email from auth.users where id=auth.uid();
  select * into p from hj_perfis where id=auth.uid();
  if found then return p; end if;
  select * into c from hj_convites where lower(email)=lower(v_email) and aceito_em is null order by created_at limit 1;
  if found then
    insert into hj_perfis(id,nome,email,papel,dono_id) values (auth.uid(), coalesce(p_nome,c.nome,split_part(v_email,'@',1)), v_email, c.papel, c.owner) returning * into p;
    update hj_convites set aceito_em=now() where id=c.id;
  else
    insert into hj_perfis(id,nome,email,papel,dono_id) values (auth.uid(), coalesce(p_nome,split_part(v_email,'@',1)), v_email, 'dono', auth.uid()) returning * into p;
  end if;
  return p;
end $$;
revoke all on function public.hj_entrar(text) from public, anon; grant execute on function public.hj_entrar(text) to authenticated;

-- Cria conversa (1:1 ou grupo) com membros do MESMO time
create or replace function public.hj_nova_conversa(p_membros uuid[], p_titulo text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; d uuid := hj_meu_dono(); m uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  foreach m in array p_membros loop
    if not exists(select 1 from hj_perfis where id=m and dono_id=d) then raise exception 'membro fora do time'; end if;
  end loop;
  insert into hj_conversas(owner,titulo,grupo) values (d, p_titulo, coalesce(array_length(p_membros,1),0) > 1) returning id into v_id;
  insert into hj_participantes(conversa_id,user_id) select v_id, u from (select auth.uid() u union select unnest(p_membros)) x;
  return v_id;
end $$;
revoke all on function public.hj_nova_conversa(uuid[],text) from public, anon; grant execute on function public.hj_nova_conversa(uuid[],text) to authenticated;

alter table public.hj_perfis enable row level security; alter table public.hj_convites enable row level security;
alter table public.hj_conversas enable row level security; alter table public.hj_participantes enable row level security;
alter table public.hj_mensagens enable row level security;
revoke all on public.hj_perfis, public.hj_convites, public.hj_conversas, public.hj_participantes, public.hj_mensagens from anon;
grant select, update on public.hj_perfis to authenticated;
grant select, insert, update, delete on public.hj_convites to authenticated;
grant select, update, delete on public.hj_conversas to authenticated;
grant select, update on public.hj_participantes to authenticated;
grant select, insert, delete on public.hj_mensagens to authenticated;

drop policy if exists hj_perfis_sel on public.hj_perfis;
create policy hj_perfis_sel on public.hj_perfis for select to authenticated using (dono_id = public.hj_meu_dono() or id = auth.uid());
drop policy if exists hj_perfis_upd on public.hj_perfis;
create policy hj_perfis_upd on public.hj_perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and papel = (select papel from public.hj_perfis where id=auth.uid()) and dono_id is not distinct from public.hj_meu_dono());
drop policy if exists hj_convites_owner on public.hj_convites;
create policy hj_convites_owner on public.hj_convites for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists hj_conversas_sel on public.hj_conversas;
create policy hj_conversas_sel on public.hj_conversas for select to authenticated using (public.hj_participa(id));
drop policy if exists hj_conversas_mod on public.hj_conversas;
create policy hj_conversas_mod on public.hj_conversas for update to authenticated using (owner = auth.uid() and public.hj_participa(id));
drop policy if exists hj_conversas_del on public.hj_conversas;
create policy hj_conversas_del on public.hj_conversas for delete to authenticated using (owner = auth.uid() and public.hj_participa(id));
drop policy if exists hj_part_sel on public.hj_participantes;
create policy hj_part_sel on public.hj_participantes for select to authenticated using (public.hj_participa(conversa_id));
drop policy if exists hj_part_upd on public.hj_participantes;
create policy hj_part_upd on public.hj_participantes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists hj_msg_sel on public.hj_mensagens;
create policy hj_msg_sel on public.hj_mensagens for select to authenticated using (public.hj_participa(conversa_id));
drop policy if exists hj_msg_ins on public.hj_mensagens;
create policy hj_msg_ins on public.hj_mensagens for insert to authenticated with check (autor = auth.uid() and public.hj_participa(conversa_id));
drop policy if exists hj_msg_del on public.hj_mensagens;
create policy hj_msg_del on public.hj_mensagens for delete to authenticated using (autor = auth.uid());

-- Realtime (RLS filtra quem recebe)
do $$ begin
  begin alter publication supabase_realtime add table public.hj_mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hj_participantes; exception when duplicate_object then null; end;
end $$;
