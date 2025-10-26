/*
  # Create Clients Table for SmartOps

  1. New Tables
    - `clients`
      - `id` (uuid, primary key) - Unique identifier for each client
      - `name` (text) - Client name
      - `start_date` (date, nullable) - Partnership start date
      - `notes` (text, nullable) - Internal notes about the relationship
      - `tiktok_handle` (text, nullable) - TikTok handle used for content
      - `tiktok_email` (text, nullable) - TikTok login email
      - `tiktok_password` (text, nullable) - TikTok login password placeholder
      - `created_at` (timestamptz) - When the record was created
      - `updated_at` (timestamptz) - When the record was last updated

  2. Security
    - Enable RLS on `clients`
    - Allow both `anon` and `authenticated` roles to manage client records
*/

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  notes text,
  tiktok_handle text,
  tiktok_email text,
  tiktok_password text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_clients_name on clients (lower(name));
create index if not exists idx_clients_start_date on clients (start_date);

create or replace function set_clients_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger trg_clients_updated_at
before update on clients
for each row
execute function set_clients_updated_at();

alter table clients enable row level security;

create policy "Allow public read access on clients"
  on clients
  for select
  to authenticated, anon
  using (true);

create policy "Allow public insert access on clients"
  on clients
  for insert
  to authenticated, anon
  with check (true);

create policy "Allow public update access on clients"
  on clients
  for update
  to authenticated, anon
  using (true)
  with check (true);

create policy "Allow public delete access on clients"
  on clients
  for delete
  to authenticated, anon
  using (true);
