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
const body = req => new Promise((resolve, reject) => { let data=''; req.on('data', chunk => data += chunk); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch (error) { reject(error) } }); req.on('error', reject) })
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end() }
    if (req.url === '/api/health') return json(res, 200, { ok: true, database: 'neon-postgres' })
    if (req.url === '/api/customers' && req.method === 'POST') {
      const input = await body(req)
      if (!input.name) return json(res, 400, { error: 'Customer name is required' })
      const [customer] = await sql`insert into customers (name, phone) values (${input.name}, ${input.mobile || input.phone || null}) returning id, name, phone`
      return json(res, 201, customer)
    }
    if (req.url === '/api/orders' && req.method === 'POST') {
      const input = await body(req)
      if (!input.customer || !input.service) return json(res, 400, { error: 'Customer and stitching type are required' })
      let customerRow = (await sql`select id, name, phone from customers where name=${input.customer} order by created_at asc limit 1`)[0]
      if (!customerRow) {
        [customerRow] = await sql`insert into customers (name, phone) values (${input.customer}, ${input.mobile || null}) returning id, name, phone`
      }
      const orderNumber = input.orderNumber || `LC-${Date.now()}`, today = new Date().toISOString().slice(0,10), orderDate = input.date && input.date !== 'Today' ? input.date : today, paidDate = input.paidDate || input.materialDate || today
      const [order] = await sql`insert into orders (order_number, customer_id, service_name, details, material_cost, stitching_charge, status, order_date) values (${orderNumber}, ${customerRow.id}, ${input.service}, ${input.detail || [input.color, input.material].filter(Boolean).join(' · ') || null}, ${Number(input.materialCost || 0)}, ${Number(input.charge || 0)}, ${Number(input.paid || 0) >= Number(input.charge || 0) ? 'Paid' : 'Pending'}, ${orderDate}) returning id, order_number`
      if (Number(input.paid || 0) > 0) await sql`insert into payments (order_id, amount, paid_on, note) values (${order.id}, ${Number(input.paid)}, ${paidDate}, ${input.notes || null})`
      return json(res, 201, { id: order.order_number, customer: customerRow.name, service: input.service, detail: input.detail || '', charge: Number(input.charge || 0), paid: Number(input.paid || 0), status: Number(input.paid || 0) >= Number(input.charge || 0) ? 'Paid' : 'Pending', date: input.date || 'Today' })
    }
    if (req.url === '/api/orders' && req.method === 'GET') {
      const rows = await sql`select o.order_number as id, c.name as customer, c.phone as mobile, o.service_name as service, o.details as detail, o.material_cost as "materialCost", o.stitching_charge as charge, coalesce(sum(p.amount),0) as paid, o.status, to_char(o.order_date,'YYYY-MM-DD') as date from orders o join customers c on c.id=o.customer_id left join payments p on p.order_id=o.id group by o.id,c.name,c.phone order by o.order_date desc,o.created_at desc`
      return json(res, 200, rows)
    }
    return json(res, 404, { error: 'Not found' })
  } catch (error) { console.error(error); return json(res, 500, { error: 'Database request failed' }) }
})

ensureSchema().then(() => server.listen(process.env.PORT || 8787, () => console.log(`API listening on ${process.env.PORT || 8787}`))).catch(error => { console.error('Schema setup failed', error); process.exit(1) })
