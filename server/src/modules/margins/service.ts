// Calcolo margini server-side. Porting fedele di src/lib/margins.ts:
//   quotaPerCapo = SUM(fixed_cost_items.importo_annuo) / capi_prodotti_annui  (DEC-022)
//   costoDiretto = costo_tessuto + costo_accessori + costo_manodopera + costo_packaging + altri_costi_diretti
//                  (scheda tecnica non archiviata — v_product_costo_diretto, Database_Schema §5)
//   costoTotale  = costoDiretto + quotaPerCapo
//   margineNetto = prezzoNettoIva - costoTotale ; sottoSoglia = margine% < soglia
import { prisma } from '../../core/prisma.js'
import type { TechnicalSheet } from '@prisma/client'

const r2 = (n: number) => Math.round(n * 100) / 100

export async function computeQuotaPerCapo(): Promise<{ quotaPerCapo: number; totaleCostiFissi: number; capiProdottiAnnui: number }> {
  const [items, setting] = await Promise.all([
    prisma.fixedCostItem.findMany(),
    prisma.appSetting.findUnique({ where: { chiave: 'capi_prodotti_annui' } }),
  ])
  const totaleCostiFissi = items.reduce((s, i) => s + Number(i.importoAnnuo), 0)
  const capiProdottiAnnui = Number(setting?.valore ?? 0)
  const quotaPerCapo = capiProdottiAnnui > 0 ? r2(totaleCostiFissi / capiProdottiAnnui) : 0
  return { quotaPerCapo, totaleCostiFissi, capiProdottiAnnui }
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
