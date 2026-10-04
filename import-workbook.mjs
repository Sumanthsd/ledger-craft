import XLSX from 'xlsx'
import postgres from 'postgres'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const workbookPath = process.argv[2] || 'C:\\Users\\suman\\Downloads\\Stitching Income-2026.xlsx'
const book = XLSX.readFile(workbookPath, { cellDates: true })
const sql = postgres(process.env.DATABASE_URL, { prepare: false })
const clean = value => value == null ? '' : String(value).trim()
const numeric = value => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const dateValue = value => value instanceof Date ? value.toISOString().slice(0, 10) : null

async function run() {
  let imported = 0
  for (const sheetName of book.SheetNames.filter(name => name.toLowerCase() !== 'total income')) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, defval: null })
    const [customer] = await sql`insert into customers (name) values (${sheetName}) on conflict do nothing returning id`
    const customerRow = customer || (await sql`select id from customers where name=${sheetName}`)[0]
    let group = 0
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index]
      const service = clean(row[2])
      const color = clean(row[3])
      const material = clean(row[4])
      const charge = numeric(row[6])
      if (!service && !color && !material && !charge) continue
      if (row[0] != null && clean(row[0])) group = clean(row[0])
      const orderNumber = `WB-${sheetName.slice(0, 8).replace(/[^a-z0-9]/gi, '').toUpperCase()}-${index}`
      const orderDate = dateValue(row[1])
      const [order] = await sql`insert into orders (order_number, customer_id, service_name, details, material_cost, stitching_charge, status, order_date) values (${orderNumber}, ${customerRow.id}, ${service || 'Stitching work'}, ${[color, material, group ? `Group ${group}` : ''].filter(Boolean).join(' · ')}, ${numeric(row[5])}, ${charge}, ${numeric(row[7]) >= charge && charge > 0 ? 'Paid' : 'Pending'}, coalesce(${orderDate}, current_date)) on conflict (order_number) do nothing returning id`
      if (!order) continue
      const paid = numeric(row[7])
      if (paid > 0) await sql`insert into payments (order_id, amount, paid_on, note) values (${order.id}, ${paid}, coalesce(${dateValue(row[8])}, current_date), ${typeof row[7] === 'string' ? row[7] : null})`
      imported++
    }
  }
  console.log(`Imported ${imported} workbook rows into Neon.`)
  await sql.end()
}
run().catch(error => { console.error(error); process.exit(1) })
