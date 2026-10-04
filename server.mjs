import http from 'node:http'
import postgres from 'postgres'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const sql = postgres(process.env.DATABASE_URL, { max: 3, prepare: false })

async function ensureSchema() {
  await sql`create extension if not exists pgcrypto`
  await sql`create table if not exists customers (id uuid primary key default gen_random_uuid(), name text not null, phone text, notes text, created_at timestamptz not null default now())`
  await sql`create table if not exists service_types (id uuid primary key default gen_random_uuid(), name text not null unique, default_charge numeric(12,2), active boolean not null default true)`
  await sql`create table if not exists orders (id uuid primary key default gen_random_uuid(), order_number text not null unique, customer_id uuid not null references customers(id), service_type_id uuid references service_types(id), service_name text not null, details text, material_cost numeric(12,2) not null default 0, stitching_charge numeric(12,2) not null default 0, status text not null default 'Pending', order_date date not null default current_date, created_at timestamptz not null default now())`
  await sql`create table if not exists payments (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade, amount numeric(12,2) not null check (amount >= 0), paid_on date not null default current_date, note text, created_at timestamptz not null default now())`
  await sql`create index if not exists orders_customer_id_idx on orders(customer_id)`
  await sql`create index if not exists payments_order_id_idx on payments(order_id)`
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)) }
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end() }
    if (req.url === '/api/health') return json(res, 200, { ok: true, database: 'neon-postgres' })
    if (req.url === '/api/orders' && req.method === 'GET') {
      const rows = await sql`select o.order_number as id, c.name as customer, o.service_name as service, o.details as detail, o.stitching_charge as charge, coalesce(sum(p.amount),0) as paid, o.status, to_char(o.order_date,'DD Mon YYYY') as date from orders o join customers c on c.id=o.customer_id left join payments p on p.order_id=o.id group by o.id,c.name order by o.order_date desc,o.created_at desc`
      return json(res, 200, rows)
    }
    return json(res, 404, { error: 'Not found' })
  } catch (error) { console.error(error); return json(res, 500, { error: 'Database request failed' }) }
})

ensureSchema().then(() => server.listen(process.env.PORT || 8787, () => console.log(`API listening on ${process.env.PORT || 8787}`))).catch(error => { console.error('Schema setup failed', error); process.exit(1) })
