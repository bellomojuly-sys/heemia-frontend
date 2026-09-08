// Preflight della Fase 21. Non scrive sul database: controlla i tre CSV destinati alla
// migrazione e termina con exit code 2 finché esistono dati che richiedono una conferma
// umana. Serve a impedire che "importabile" venga confuso con "corretto oggi".
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

type Row = Record<string, string>

type MigrationDecisions = {
  stockSnapshotDate: string
  stockSnapshotConfirmedCurrent: boolean
  stockSnapshotDecision?: string
  productsOutsideCatalogDecision: string
  duplicateCommercialNamesDecision: string
  productStageMapping: string
  /** Capi tenuti volutamente fuori dall'inventario iniziale (Denver e Moss, 2026-08-13). */
  excludedFromInitialInventory?: string
  stockLocationSplit?: string
  sitePriceRule?: string
  vatMissingSuppliers?: string
}

/**
 * Capi esclusi dall'inventario iniziale per decisione di Giulia (2026-08-13): quantita zero,
 * nessuna variante, nessuna giacenza. Non avere colori o stock non e' un dato mancante per
 * loro — e' esattamente quello che si e' deciso — quindi non devono comparire fra i buchi.
 */
const ESCLUSI_DALL_INVENTARIO = new Set(['Denver', 'Moss'])

const censusDir = fileURLToPath(
  new URL('../../../03_Technical_Specification/Censimento_Dati/', import.meta.url),
)

function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('CSV non valido: virgolette non chiuse')
  if (field || row.length) {
    row.push(field)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }
  const headers = rows.shift()?.map((value) => value.trim().replace(/^\uFEFF/, '')) ?? []
  return rows.map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV non valido alla riga ${index + 2}: ${values.length} colonne invece di ${headers.length}`)
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]))
  })
}

function duplicates(values: string[]) {
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value)
    seen.add(value)
  }
  return [...duplicate].sort()
}

function list(rows: Row[], predicate: (row: Row) => boolean, field: string) {
  return rows.filter(predicate).map((row) => row[field]).filter(Boolean).sort()
}

function integerOrBlank(value: string) {
  return value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)))
}

const [productsText, variantsText, suppliersText, decisionsText] = await Promise.all([
  readFile(`${censusDir}/products.csv`, 'utf8'),
  readFile(`${censusDir}/product_variants.csv`, 'utf8'),
  readFile(`${censusDir}/suppliers.csv`, 'utf8'),
  readFile(`${censusDir}/migration_decisions.json`, 'utf8'),
])

const products = parseCsv(productsText)
const variants = parseCsv(variantsText)
const suppliers = parseCsv(suppliersText)
const decisions = JSON.parse(decisionsText) as MigrationDecisions
const productCodes = new Set(products.map((row) => row.codice_prodotto))
const variantsByProduct = new Map<string, Row[]>()
for (const variant of variants) {
  const group = variantsByProduct.get(variant.codice_prodotto) ?? []
  group.push(variant)
  variantsByProduct.set(variant.codice_prodotto, group)
}

const inInventario = (row: Row) => !ESCLUSI_DALL_INVENTARIO.has(row.nome)

const missingCost = list(products, (row) => row.costo_diretto === '', 'nome')
const missingColors = list(products, (row) => inInventario(row) && row.colori_disponibili === '', 'nome')
const missingSizes = list(products, (row) => inInventario(row) && row.taglie_disponibili === '', 'nome')
const missingProductStock = list(products, (row) => inInventario(row) && row.stock_totale === '', 'nome')
const missingVariantStock = list(variants, (row) => row.stock_disponibile === '', 'sku')
const invalidVariantStock = list(variants, (row) => !integerOrBlank(row.stock_disponibile), 'sku')
const orphanVariants = list(variants, (row) => !productCodes.has(row.codice_prodotto), 'sku')
const productsWithoutVariants = products
  .filter((row) => inInventario(row) && !(variantsByProduct.get(row.codice_prodotto)?.length))
  .map((row) => row.nome)
  .sort()

const stockMismatches = products.flatMap((product) => {
  const group = variantsByProduct.get(product.codice_prodotto) ?? []
  if (!product.stock_totale || group.length === 0 || group.some((row) => row.stock_disponibile === '')) return []
  const variantsTotal = group.reduce((sum, row) => sum + Number(row.stock_disponibile), 0)
  const declaredTotal = Number(product.stock_totale)
  return variantsTotal === declaredTotal
    ? []
    : [{ codice: product.codice_prodotto, nome: product.nome, dichiarato: declaredTotal, varianti: variantsTotal }]
})

const suppliersWithoutVat = list(suppliers, (row) => row.piva === '', 'nome')
const suppliersWithoutContact = list(
  suppliers,
  (row) => row.email === '' && row.telefono === '',
  'nome',
)

const report = {
  status: 'blocked',
  source: {
    directory: censusDir,
    stockSnapshot: decisions.stockSnapshotDate,
    stockSnapshotConfirmedCurrent: decisions.stockSnapshotConfirmedCurrent,
  },
  counts: {
    products: products.length,
    variants: variants.length,
    variantsWithStock: variants.length - missingVariantStock.length,
    stockPieces: variants.reduce(
      (sum, row) => sum + (integerOrBlank(row.stock_disponibile) && row.stock_disponibile ? Number(row.stock_disponibile) : 0),
      0,
    ),
    suppliersReady: suppliers.length,
    suppliersExpected: 29,
  },
  structuralErrors: {
    duplicateProductCodes: duplicates(products.map((row) => row.codice_prodotto)),
    duplicateProductNames: duplicates(products.map((row) => row.nome.toLocaleLowerCase('it'))),
    duplicateSkus: duplicates(variants.map((row) => row.sku)),
    orphanVariants,
    invalidVariantStock,
    stockMismatches,
  },
  incompleteRecords: {
    productsWithoutDirectCost: missingCost,
    productsWithoutColors: missingColors,
    productsWithoutSizes: missingSizes,
    productsWithoutDeclaredStock: missingProductStock,
    productsWithoutVariants,
    variantsWithoutStock: missingVariantStock,
  },
  // Dati che mancano ma **non fermano la migrazione**: per decisione di Giulia (2026-08-13)
  // il fornitore entra lo stesso e la partita IVA si completa dopo. Restano elencati perche'
  // finche' manca la P.IVA le fatture elettroniche di quel fornitore non lo riconoscono.
  daCompletareDopo: {
    suppliersWithoutVat,
    suppliersWithoutAnyContact: suppliersWithoutContact,
  },
  manualDecisionsRequired: {
    productsOutsideCatalog: {
      // 'Bomber' e' uscito da questa lista il 2026-09-07: non e' un capo, e' il nome con cui il
      // foglio "Break Even per Capo" chiama Alaska (Data_Census §10). I capi fuori anagrafica
      // Notion restano quattro.
      records: ['Atene', 'Madrid', 'Dallas', 'Giuli'],
      decision: decisions.productsOutsideCatalogDecision,
      resolved: decisions.productsOutsideCatalogDecision.trim() !== '',
    },
    duplicateCommercialNames: {
      records: ['Barcellona (pantalone/bermuda)', 'Pechino (felpa/giacca)'],
      decision: decisions.duplicateCommercialNamesDecision,
      resolved: decisions.duplicateCommercialNamesDecision.trim() !== '',
    },
    missingSupplierRegistryRows: Math.max(0, 29 - suppliers.length),
    productStageMapping: {
      decision: decisions.productStageMapping,
      resolved: decisions.productStageMapping.trim() !== '',
    },
    currentStock: {
      snapshot: decisions.stockSnapshotDate,
      confirmedCurrent: decisions.stockSnapshotConfirmedCurrent,
      decision: decisions.stockSnapshotDecision ?? '',
    },
    excludedFromInitialInventory: {
      records: [...ESCLUSI_DALL_INVENTARIO],
      decision: decisions.excludedFromInitialInventory ?? '',
      resolved: (decisions.excludedFromInitialInventory ?? '').trim() !== '',
    },
  },
}

const structuralCount = Object.values(report.structuralErrors).reduce((sum, value) => sum + value.length, 0)
const incompleteCount = Object.values(report.incompleteRecords).reduce((sum, value) => sum + value.length, 0)
const manualCount = Number(!report.manualDecisionsRequired.productsOutsideCatalog.resolved)
  + Number(!report.manualDecisionsRequired.duplicateCommercialNames.resolved)
  + report.manualDecisionsRequired.missingSupplierRegistryRows
  + Number(!report.manualDecisionsRequired.productStageMapping.resolved)
  + Number(!report.manualDecisionsRequired.excludedFromInitialInventory.resolved)
  + Number(!report.manualDecisionsRequired.currentStock.confirmedCurrent)

if (structuralCount === 0 && incompleteCount === 0 && manualCount === 0 && report.source.stockSnapshotConfirmedCurrent) {
  report.status = 'ready'
}

console.log(JSON.stringify(report, null, 2))
if (report.status !== 'ready') process.exitCode = 2
