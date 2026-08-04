// Seed di sviluppo (Fase 12). Piano di migrazione Technical_Specification §8 passo 2:
// "i mock del prototipo diventano il seed". Qui si crea il minimo indispensabile per far
// girare auth + margini; i dataset completi (93 capi) arrivano col censimento SKU (Fase 21, DEC-024).
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // app_settings (DEC-022): quota costi fissi e soglia margine
  await prisma.appSetting.upsert({
    where: { chiave: 'capi_prodotti_annui' },
    update: {},
    create: { chiave: 'capi_prodotti_annui', valore: '442' },
  })
  await prisma.appSetting.upsert({
    where: { chiave: 'soglia_margine_percent' },
    update: {},
    create: { chiave: 'soglia_margine_percent', valore: '35' },
  })

  // Primo utente admin (sostituisce il selettore demo del prototipo)
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@heemia.local').toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (password) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { nome: 'Admin Heemia', email, role: 'admin', passwordHash: await bcrypt.hash(password, 12) },
    })
    console.log(`Utente admin pronto: ${email}`)
  } else {
    console.log('SEED_ADMIN_PASSWORD non impostata: utente admin non creato.')
  }

  // --- Da qui in giù: dati FINTI, solo per sviluppo ---
  // Il seed gira a ogni deploy (è idempotente), quindi in produzione deve fermarsi qui:
  // un prodotto "Maiorca Top" o voci di costo inventate falserebbero margini e report
  // dell'azienda vera. I costi fissi reali si inseriscono dall'app (Costi e margini),
  // i prodotti arrivano con la migrazione dati della Fase 21.
  if (process.env.NODE_ENV === 'production') {
    console.log('Ambiente di produzione: nessun dato di esempio inserito.')
    return
  }

  // Voci di costo fisso di esempio — servono a far calcolare una quota in sviluppo.
  const fixedCount = await prisma.fixedCostItem.count()
  if (fixedCount === 0) {
    await prisma.fixedCostItem.createMany({
      data: [
        { nome: 'Affitto laboratorio', importoAnnuo: 9600 },
        { nome: 'Commercialista', importoAnnuo: 2400 },
        { nome: 'Software e abbonamenti', importoAnnuo: 1200 },
      ],
    })
  }

  // Un prodotto d'esempio con scheda tecnica finale, per verificare il calcolo margini
  const prod = await prisma.product.upsert({
    where: { codiceProdotto: 'DEMO-001' },
    update: {},
    create: {
      nome: 'Maiorca Top',
      codiceProdotto: 'DEMO-001',
      linea: 'tessile',
      stato: 'in_vendita',
      prezzoVendita: 120,
      prezzoNettoIva: 98.36,
    },
  })
  const hasSheet = await prisma.technicalSheet.findFirst({ where: { productId: prod.id } })
  if (!hasSheet) {
    await prisma.technicalSheet.create({
      data: {
        productId: prod.id,
        versione: 'finale',
        costoTessuto: 18,
        costoAccessori: 4,
        costoManodopera: 22,
        costoPackaging: 2,
        altriCostiDiretti: 1,
      },
    })
  }

  console.log('Seed completato (con dati di esempio di sviluppo).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
