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

  // Primo utente admin: serve solo a entrare la prima volta. Da lì in avanti gli utenti si
  // creano dall'app (Impostazioni → Utenti e accessi) e ognuno cambia la propria password.
  //
  // ⚠️ Il seed NON riallinea più la password a ogni deploy. Lo faceva, ed era giusto finché
  // il cambio password dentro l'app non esisteva: era l'unica via di recupero. Ora però
  // significherebbe che ogni deploy riporta la password dell'amministratore al valore di
  // una variabile Render, cancellando in silenzio quella che la persona ha scelto.
  //
  // La via di recupero resta, ma diventa esplicita: `SEED_ADMIN_FORCE_PASSWORD=true`
  // riallinea la password al prossimo deploy. Si imposta quando serve e si toglie subito
  // dopo — un'azione dichiarata, non un effetto collaterale silenzioso di ogni rilascio.
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@heemia.local').toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  const forzaPassword = process.env.SEED_ADMIN_FORCE_PASSWORD === 'true'
  if (password) {
    const passwordHash = await bcrypt.hash(password, 12)
    const esistente = await prisma.user.findUnique({ where: { email } })
    if (!esistente) {
      await prisma.user.create({ data: { nome: 'Admin Heemia', email, role: 'admin', passwordHash } })
      console.log(`Utente admin creato: ${email}`)
    } else if (forzaPassword) {
      await prisma.user.update({ where: { email }, data: { passwordHash, attivo: true, role: 'admin' } })
      console.log(
        `Utente admin: password RIALLINEATA a SEED_ADMIN_PASSWORD (${email}). ` +
          'Togli SEED_ADMIN_FORCE_PASSWORD dalle variabili, altrimenti succederà a ogni deploy.',
      )
    } else {
      console.log(`Utente admin già presente (${email}): password lasciata com'è.`)
    }
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
