import type { Customer, Order } from '../types'

export const customers: Customer[] = [
  { id: 'cust-01', nome: 'Marta Colombo', email: 'marta.colombo@example.com', paese: 'IT', tipologia: 'ecommerce', valoreTotaleAcquistato: 540.0, numeroOrdini: 4 },
  { id: 'cust-02', nome: 'Studio Vela Showroom', email: 'info@studiovela.example', paese: 'IT', tipologia: 'showroom_partner', valoreTotaleAcquistato: 3200.0, numeroOrdini: 6, note: 'Showroom Milano, riordini stagionali' },
  { id: 'cust-03', nome: 'Anna Keller', email: 'anna.keller@example.com', paese: 'DE', tipologia: 'ecommerce', valoreTotaleAcquistato: 189.0, numeroOrdini: 1 },
  { id: 'cust-04', nome: 'Retail Concept S.r.l.', email: 'ordini@retailconcept.example', paese: 'IT', tipologia: 'retailer', valoreTotaleAcquistato: 8100.0, numeroOrdini: 3, sconto: 20 },
]

export const orders: Order[] = [
  { id: 'ord-01', numero: 'SH-10021', customerId: 'cust-01', canale: 'shopify', stato: 'spedito', priorita: 'normale', data: '2026-07-10', totale: 129.0, prodottiIds: ['prod-01'] },
  { id: 'ord-02', numero: 'SH-10022', customerId: 'cust-03', canale: 'shopify', stato: 'in_lavorazione', priorita: 'alta', data: '2026-07-13', totale: 99.0, prodottiIds: ['prod-06'] },
  { id: 'ord-03', numero: 'POS-0044', customerId: 'cust-02', canale: 'fisico', stato: 'consegnato', priorita: 'normale', data: '2026-07-08', totale: 780.0, prodottiIds: ['prod-01', 'prod-07'] },
  { id: 'ord-04', numero: 'SH-10023', customerId: 'cust-01', canale: 'shopify', stato: 'annullato', priorita: 'normale', data: '2026-07-12', totale: 89.0, prodottiIds: ['prod-05'] },
]
