# LedgerCraft

First web-app slice for converting the stitching income workbook into a proper order and payment system. The `Total Income` sheet is intentionally out of scope for this first build.

## Current slice

- Responsive dashboard layout for desktop and mobile browsers
- Income, collected, pending, and active-order summary cards
- Recent-orders table with search
- New-order form with charge and payment status
- Sample data shaped from the workbook's customer sheets

## Database decision

Use **Neon Postgres** for the production database. This data is relational: customers have many orders, orders can have multiple line items, and payments need auditable transaction history. Neon provides managed PostgreSQL, branching for development, and a serverless-friendly connection model. The app should use a small typed data layer (Drizzle ORM is the preferred next step) and keep the database URL in environment variables.

Suggested core tables:

`customers`, `orders`, `order_items`, `payments`, `materials`, and `service_types`.

The workbook should be treated as an import source, not as the application's long-term data model. Blank dates and free-text payment notes can remain during import and be cleaned later.

## Run locally

```bash
npm install
npm run dev
```

## Planned next phases

1. Add Neon connection, migrations, and workbook import tooling.
2. Replace sample data with customers, orders, and payment APIs.
3. Add customer detail, order editing, payment history, and exports.
4. Add authentication and role/access rules.
5. Reuse the API for a mobile app after the web workflow stabilizes.
