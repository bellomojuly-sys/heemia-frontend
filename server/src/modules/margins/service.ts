// Calcolo margini server-side. Porting fedele di src/lib/margins.ts:
//   quotaPerCapo = SUM(fixed_cost_items.importo_annuo) / capi_prodotti_annui  (DEC-022)
//   costoDiretto = costo_tessuto + costo_accessori + costo_manodopera + costo_packaging + altri_costi_diretti
//                  (scheda tecnica non archiviata — v_product_costo_diretto, Database_Schema §5)
//   costoTotale  = costoDiretto + quotaPerCapo
//   margineNetto = prezzoNettoIva - costoTotale ; sottoSoglia = margine% < soglia
import { Prisma, type TechnicalSheet } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'

const r2 = (n: number) => Math.round(n * 100) / 100

export async function computeQuotaPerCapo(): Promise<{
  quotaPerCapo: number
  totaleCostiFissi: number
  capiProdottiAnnui: number
  sogliaMarginePercent: number
}> {
  const [items, setting, soglia] = await Promise.all([
    prisma.fixedCostItem.findMany(),
    prisma.appSetting.findUnique({ where: { chiave: 'capi_prodotti_annui' } }),
    prisma.appSetting.findUnique({ where: { chiave: 'soglia_margine_percent' } }),
  ])
  const totaleCostiFissi = items.reduce((s, i) => s + Number(i.importoAnnuo), 0)
  const capiProdottiAnnui = Number(setting?.valore ?? 0)
  const quotaPerCapo = capiProdottiAnnui > 0 ? r2(totaleCostiFissi / capiProdottiAnnui) : 0
  // La soglia viaggia insieme alla quota: l'interfaccia deve mostrare quella vera,
  // altrimenti l'etichetta "sotto soglia (35%)" mentirebbe se il valore cambia.
  return { quotaPerCapo, totaleCostiFissi, capiProdottiAnnui, sogliaMarginePercent: Number(soglia?.valore ?? 35) }
}

export interface ProductMargin {
  productId: string
  nome: string
  prezzoNettoIva: number
  costoDiretto: number
  costoIndirettoAllocato: number
  costoTotale: number
  margineLordo: number
  margineNettoStimato: number
  marginePercentuale: number
  breakEvenPrice: number
  prezzoMinimoConsigliato: number
  sottoSoglia: boolean
}

export async function computeProductMargin(productId: string): Promise<ProductMargin | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { technicalSheets: { where: { archiviata: false } } },
  })
  if (!product) return null

  const { quotaPerCapo } = await computeQuotaPerCapo()
  const sogliaSetting = await prisma.appSetting.findUnique({ where: { chiave: 'soglia_margine_percent' } })
  const thresholdPercent = Number(sogliaSetting?.valore ?? 35)

  const sheet = product.technicalSheets.find((t: TechnicalSheet) => t.versione === 'finale') ?? product.technicalSheets[0]
  const costoDiretto = sheet
    ? r2(
        Number(sheet.costoTessuto) + Number(sheet.costoAccessori) + Number(sheet.costoManodopera) +
          Number(sheet.costoPackaging) + Number(sheet.altriCostiDiretti),
      )
    : 0

  const prezzoNettoIva = Number(product.prezzoNettoIva)
  const costoTotale = r2(costoDiretto + quotaPerCapo)
  const margineLordo = r2(prezzoNettoIva - costoDiretto)
  const margineNettoStimato = r2(prezzoNettoIva - costoTotale)
  const marginePercentuale = prezzoNettoIva > 0 ? Math.round((margineNettoStimato / prezzoNettoIva) * 1000) / 10 : 0

  return {
    productId: product.id,
    nome: product.nome,
    prezzoNettoIva,
    costoDiretto,
    costoIndirettoAllocato: quotaPerCapo,
    costoTotale,
    margineLordo,
    margineNettoStimato,
    marginePercentuale,
    breakEvenPrice: costoTotale,
    prezzoMinimoConsigliato: r2(costoTotale * 1.15),
    sottoSoglia: marginePercentuale < thresholdPercent,
  }
}

/**
 * Margini di tutti i prodotti (equivalente server di useLiveMargins).
 * Calcolato in una sola query invece di N chiamate a computeProductMargin.
 */
export async function computeAllMargins(): Promise<ProductMargin[]> {
  const [products, quota, sogliaSetting] = await Promise.all([
    prisma.product.findMany({ include: { technicalSheets: { where: { archiviata: false } } } }),
    computeQuotaPerCapo(),
    prisma.appSetting.findUnique({ where: { chiave: 'soglia_margine_percent' } }),
  ])
  const thresholdPercent = Number(sogliaSetting?.valore ?? 35)
  const { quotaPerCapo } = quota

  return products.map((product) => {
    const sheet = product.technicalSheets.find((t: TechnicalSheet) => t.versione === 'finale') ?? product.technicalSheets[0]
    const costoDiretto = sheet
      ? r2(
          Number(sheet.costoTessuto) + Number(sheet.costoAccessori) + Number(sheet.costoManodopera) +
            Number(sheet.costoPackaging) + Number(sheet.altriCostiDiretti),
        )
      : 0
    const prezzoNettoIva = Number(product.prezzoNettoIva)
    const costoTotale = r2(costoDiretto + quotaPerCapo)
    const margineNettoStimato = r2(prezzoNettoIva - costoTotale)
    const marginePercentuale = prezzoNettoIva > 0 ? Math.round((margineNettoStimato / prezzoNettoIva) * 1000) / 10 : 0
    return {
      productId: product.id,
      nome: product.nome,
      prezzoNettoIva,
      costoDiretto,
      costoIndirettoAllocato: quotaPerCapo,
      costoTotale,
      margineLordo: r2(prezzoNettoIva - costoDiretto),
      margineNettoStimato,
      marginePercentuale,
      breakEvenPrice: costoTotale,
      prezzoMinimoConsigliato: r2(costoTotale * 1.15),
      sottoSoglia: marginePercentuale < thresholdPercent,
    }
  })
}

// --- Voci di costo fisso (DEC-022): sostituiscono il 17,30 €/capo hardcoded del prototipo ---

export function listFixedCosts() {
  return prisma.fixedCostItem.findMany({ orderBy: { nome: 'asc' } })
}

/**
 * Riepilogo dei costi fissi pronto per le letture economiche: totale annuo, mensile,
 * quota per capo e voci ordinate per peso.
 *
 * Esiste perché le domande vere non sono «quanto costa il commercialista» ma «quanto pesa
 * il fisso al mese» e «quali tre voci fanno metà del totale»: dati che altrimenti ogni
 * pagina — dashboard economica, break-even, report, AI Assistant — ricalcolerebbe per
 * conto suo, con quattro occasioni di sbagliare invece di una.
 */
export async function riepilogoCostiFissi() {
  const [voci, quota] = await Promise.all([listFixedCosts(), computeQuotaPerCapo()])
  const totaleAnnuo = r2(voci.reduce((s, v) => s + Number(v.importoAnnuo), 0))
  const perPeso = [...voci]
    .map((v) => ({
      id: v.id,
      nome: v.nome,
      importoAnnuo: Number(v.importoAnnuo),
      importoMensile: r2(Number(v.importoAnnuo) / 12),
      nota: v.nota,
      percentuale: totaleAnnuo > 0 ? Math.round((Number(v.importoAnnuo) / totaleAnnuo) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.importoAnnuo - a.importoAnnuo)

  return {
    voci: perPeso,
    totaleAnnuo,
    totaleMensile: r2(totaleAnnuo / 12),
    numeroVoci: voci.length,
    capiProdottiAnnui: quota.capiProdottiAnnui,
    quotaPerCapo: quota.quotaPerCapo,
    // Detto esplicitamente invece di lasciare uno zero ambiguo: senza il numero di capi
    // annui la quota è 0, e uno zero fa sembrare che i costi fissi non pesino.
    quotaCalcolabile: quota.capiProdottiAnnui > 0,
  }
}

export async function createFixedCost(
  input: { nome: string; importoAnnuo: number; nota?: string },
  userId: string,
) {
  const nome = input.nome.trim()
  const esistente = await prisma.fixedCostItem.findUnique({ where: { nome } })
  if (esistente) throw conflict(`Esiste già una voce di costo fisso «${nome}».`)
  return prisma.$transaction(async (tx) => {
    const created = await tx.fixedCostItem.create({
      data: { nome, importoAnnuo: new Prisma.Decimal(input.importoAnnuo), nota: input.nota?.trim() || null },
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'fixed_cost', entitaId: created.id,
      valoreNuovo: `${nome}: €${input.importoAnnuo}`,
    })
    return created
  })
}

export async function updateFixedCost(
  id: string,
  patch: { nome?: string; importoAnnuo?: number; nota?: string },
  userId: string,
) {
  const before = await prisma.fixedCostItem.findUnique({ where: { id } })
  if (!before) throw notFound('Voce di costo non trovata')

  const data: Prisma.FixedCostItemUpdateInput = {}
  if (patch.nome !== undefined) {
    const nome = patch.nome.trim()
    if (!nome) throw badRequest('Il nome della voce non può restare vuoto.')
    if (nome !== before.nome) {
      const omonima = await prisma.fixedCostItem.findUnique({ where: { nome } })
      if (omonima) throw conflict(`Esiste già una voce di costo fisso «${nome}».`)
    }
    data.nome = nome
  }
  if (patch.importoAnnuo !== undefined) data.importoAnnuo = new Prisma.Decimal(patch.importoAnnuo)
  if (patch.nota !== undefined) data.nota = patch.nota.trim() || null
  if (Object.keys(data).length === 0) throw badRequest('Nessuna modifica indicata.')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.fixedCostItem.update({ where: { id }, data })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'fixed_cost', entitaId: id,
      valorePrecedente: `${before.nome}: €${Number(before.importoAnnuo)}`,
      valoreNuovo: `${updated.nome}: €${Number(updated.importoAnnuo)}`,
    })
    return updated
  })
}

export async function deleteFixedCost(id: string, userId: string) {
  const before = await prisma.fixedCostItem.findUnique({ where: { id } })
  if (!before) throw notFound('Voce di costo non trovata')
  return prisma.$transaction(async (tx) => {
    await tx.fixedCostItem.delete({ where: { id } })
    await logActivity(tx, { userId, azione: 'delete', entita: 'fixed_cost', entitaId: id, valorePrecedente: before.nome })
    return { deleted: true }
  })
}

// --- Impostazioni numeriche (capi annui, soglia margine) ---

export async function setSetting(chiave: string, valore: string, userId: string) {
  const before = await prisma.appSetting.findUnique({ where: { chiave } })
  return prisma.$transaction(async (tx) => {
    const saved = await tx.appSetting.upsert({
      where: { chiave },
      update: { valore },
      create: { chiave, valore },
    })
    await logActivity(tx, {
      userId, azione: 'update', entita: 'app_setting', entitaId: chiave,
      valorePrecedente: before?.valore, valoreNuovo: valore,
    })
    return saved
  })
}

// --- Storico quota (FR-40) ---

export function listQuotaHistory() {
  return prisma.quotaHistory.findMany({ orderBy: { registrataIl: 'desc' } })
}

export async function saveQuotaSnapshot(periodo: string, nota: string | undefined, userId: string) {
  const { quotaPerCapo, totaleCostiFissi, capiProdottiAnnui } = await computeQuotaPerCapo()
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.quotaHistory.create({
      data: {
        periodo,
        capiProdottiAnnui,
        totaleCostiFissi: new Prisma.Decimal(r2(totaleCostiFissi)),
        quotaPerCapo: new Prisma.Decimal(quotaPerCapo),
        nota,
      },
    })
    await logActivity(tx, {
      userId, azione: 'create', entita: 'quota_history', entitaId: periodo,
      valoreNuovo: `€${quotaPerCapo.toFixed(2)}/capo su ${capiProdottiAnnui} capi`,
    })
    return snapshot
  })
}
