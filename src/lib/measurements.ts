// Misure da prendere per gli ordini su misura (estensione DEC-026).
// ⚠ Set PROPOSTO e da validare con la founder: il vault non documenta un set standard,
// quindi queste sono le misure sartoriali tipiche per macro-tipologia di capo.
// Tutte in centimetri; nel prototipo sono facoltative (possono essere prese in showroom).

export interface MisuraDef {
  id: string
  label: string
}

const M = (id: string, label: string): MisuraDef => ({ id, label })

const SPALLE = M('spalle', 'Larghezza spalle')
const TORACE = M('torace', 'Circonferenza torace')
const VITA = M('vita', 'Circonferenza vita')
const FIANCHI = M('fianchi', 'Circonferenza fianchi')
const MANICA = M('manica', 'Lunghezza manica')
const BRACCIO = M('braccio', 'Circonferenza braccio')
const LUNGHEZZA = M('lunghezza', 'Lunghezza capo')
const BUSTO = M('busto', 'Lunghezza busto (spalla-vita)')
const CAVALLO = M('cavallo', 'Cavallo')
const GAMBA = M('gamba', 'Lunghezza esterna gamba')

// Capispalla strutturati: giacca, blazer, cappotto, bomber.
const CAPOSPALLA: MisuraDef[] = [SPALLE, TORACE, VITA, FIANCHI, MANICA, BRACCIO, LUNGHEZZA]
// Parte alta: felpa, maglione, maglia, cardigan, top, t-shirt, polo, body, camicia.
const PARTE_ALTA: MisuraDef[] = [SPALLE, TORACE, VITA, MANICA, LUNGHEZZA]
// Abito intero.
const ABITO: MisuraDef[] = [SPALLE, TORACE, VITA, FIANCHI, MANICA, BUSTO, LUNGHEZZA]
// Pantalone e salopette.
const PANTALONE: MisuraDef[] = [VITA, FIANCHI, CAVALLO, GAMBA]
// Gonna.
const GONNA: MisuraDef[] = [VITA, FIANCHI, LUNGHEZZA]

export function getMisureForCategoria(categoria: string): MisuraDef[] {
  const c = categoria.toLowerCase()
  if (/(giacca|blazer|cappotto|bomber)/.test(c)) return CAPOSPALLA
  if (/abito/.test(c)) return ABITO
  if (/(pantalone|salopette)/.test(c)) return PANTALONE
  if (/gonna/.test(c)) return GONNA
  if (/(felpa|maglione|maglia|cardigan|top|t-shirt|tshirt|polo|body|camicia|sciarpa)/.test(c)) return PARTE_ALTA
  return [TORACE, VITA, FIANCHI, LUNGHEZZA]
}
