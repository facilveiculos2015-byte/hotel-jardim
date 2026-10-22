-- Hotel Jardim — tabelas hj_* (não altera nada do Minera Pará)
-- Aplicar no Supabase: Dashboard > SQL Editor > colar e Run. Idempotente.
create extension if not exists pgcrypto;

create table if not exists public.hj_quartos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero text not null, tipo text, capacidade int not null default 1 check (capacidade>0),
  diaria numeric(12,2) not null default 0 check (diaria>=0),
  status text not null default 'disponivel' check (status in ('disponivel','ocupado','limpeza','manutencao')),
  obs text, created_at timestamptz not null default now(),
  unique (owner, numero));

create table if not exists public.hj_hospedagens (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quarto_id uuid references public.hj_quartos(id) on delete set null,
  hospede text not null, documento text, telefone text,
  entrada date not null, saida date not null, valor numeric(12,2) not null default 0,
  pago boolean not null default false,
  status text not null default 'ativa' check (status in ('ativa','finalizada')),
  obs text, created_at timestamptz not null default now());

create table if not exists public.hj_camareiras (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null, telefone text, valor_limpeza numeric(12,2) not null default 0,
  ativa boolean not null default true, created_at timestamptz not null default now());

create table if not exists public.hj_limpezas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quarto_id uuid references public.hj_quartos(id) on delete set null,
  camareira_id uuid references public.hj_camareiras(id) on delete set null,
  data date not null default current_date,
  status text not null default 'pendente' check (status in ('pendente','andamento','concluida')),
  valor numeric(12,2) not null default 0, pago boolean not null default false, data_pagamento date,
  obs text, created_at timestamptz not null default now());

create table if not exists public.hj_despesas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria text not null, valor numeric(12,2) not null check (valor>=0), data date not null default current_date,
  comprovante text, -- foto comprimida (data URL jpeg) opcional
  obs text, created_at timestamptz not null default now());

create table if not exists public.hj_clientes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null, telefone text, documento text, endereco text, obs text,
  created_at timestamptz not null default now());

create table if not exists public.hj_emprestimos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.hj_clientes(id) on delete cascade,
  valor numeric(12,2) not null check (valor>0), data date not null,
  taxa numeric(8,4) not null default 0 check (taxa>=0), -- % ao mês
  tipo text not null default 'simples' check (tipo in ('simples','composto')),
  parcelas int not null default 1 check (parcelas between 1 and 360),
  primeiro_vencimento date, obs text, created_at timestamptz not null default now());

create table if not exists public.hj_parcelas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emprestimo_id uuid not null references public.hj_emprestimos(id) on delete cascade,
  numero int not null, vencimento date not null, valor numeric(12,2) not null,
  created_at timestamptz not null default now());

create table if not exists public.hj_pagamentos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emprestimo_id uuid not null references public.hj_emprestimos(id) on delete cascade,
  valor numeric(12,2) not null check (valor>0), data date not null default current_date, obs text,
  created_at timestamptz not null default now());

create table if not exists public.hj_eventos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null, inicio timestamptz not null, lembrete_min int not null default 30,
  cliente_id uuid references public.hj_clientes(id) on delete set null,
  obs text, created_at timestamptz not null default now());

-- RLS estrito por dono
do $$ declare t text; begin
  foreach t in array array['hj_quartos','hj_hospedagens','hj_camareiras','hj_limpezas','hj_despesas',
    'hj_clientes','hj_emprestimos','hj_parcelas','hj_pagamentos','hj_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t||'_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t||'_owner', t);
    execute format('create index if not exists %I on public.%I (owner)', t||'_owner_idx', t);
  end loop; end $$;

create index if not exists hj_hosp_quarto_idx on public.hj_hospedagens(quarto_id);
create index if not exists hj_hosp_entrada_idx on public.hj_hospedagens(owner, entrada);
create index if not exists hj_limp_quarto_idx on public.hj_limpezas(quarto_id);
create index if not exists hj_limp_cam_idx on public.hj_limpezas(camareira_id);
create index if not exists hj_desp_data_idx on public.hj_despesas(owner, data);
create index if not exists hj_emp_cli_idx on public.hj_emprestimos(cliente_id);
create index if not exists hj_parc_emp_idx on public.hj_parcelas(emprestimo_id);
create index if not exists hj_parc_venc_idx on public.hj_parcelas(owner, vencimento);
create index if not exists hj_pag_emp_idx on public.hj_pagamentos(emprestimo_id);
create index if not exists hj_evt_inicio_idx on public.hj_eventos(owner, inicio);
