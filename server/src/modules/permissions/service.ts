// Salvataggio della matrice permessi (2026-09-07).
//
// La matrice si legge da `core/permissions.ts`, che è anche il posto dove vivono i valori
// predefiniti. Qui c'è solo la scrittura, e fa tre cose che meritano di essere dette:
//
//   1. **Scrive solo le differenze.** Una riga che coincide col predefinito viene
//      cancellata invece che salvata: la tabella resta l'elenco delle scelte fatte, non
//      una fotografia che si scollega dal codice appena qualcuno aggiunge un modulo.
//   2. **Rifiuta la porta chiusa a chiave.** Un amministratore non può togliersi
//      Impostazioni né Utenti: sono le due schermate da cui si rimedia a un errore, e
//      senza di esse l'unico rimedio sarebbe il database.
//   3. **Registra cosa è cambiato**, permesso per permesso, nell'activity log. Chi ha
//      dato o tolto un accesso, e quando, è esattamente il tipo di domanda che si fa
//      dopo, non prima.
import type { Role } from '@prisma/client'
import { prisma } from '../../core/prisma.js'
import { badRequest, conflict } from '../../core/errors.js'
import { logActivity } from '../../core/activityLog.js'
import {
  AZIONI, MODULE_KEYS, MODULE_LABELS, RUOLI, invalidaCachePermessi, matriceCompleta,
  permessiEffettivi, permessiPredefiniti, permessoBloccato,
  type Azione, type ModuleKey, type PermessiModulo,
} from '../../core/permissions.js'

export interface VoceMatrice {
  role: Role
  moduleKey: ModuleKey
  permessi: PermessiModulo
}

/** La matrice per l'interfaccia: righe, etichette e quali caselle non si possono togliere. */
export async function getMatrice() {
  return {
    ruoli: RUOLI,
    moduli: MODULE_KEYS.map((chiave) => ({ chiave, etichetta: MODULE_LABELS[chiave] })),
    azioni: AZIONI,
    matrice: await matriceCompleta(),
    /** Caselle sempre attive e non modificabili, con il motivo da mostrare a schermo. */
    bloccati: RUOLI.flatMap((role) =>
      MODULE_KEYS.flatMap((moduleKey) =>
        AZIONI.filter((azione) => permessoBloccato(role, moduleKey, azione)).map((azione) => ({
          role,
          moduleKey,
          azione,
          motivo:
            'Da qui si rimedia a un permesso tolto per sbaglio: se lo si togliesse, ' +
            'non resterebbe nessuna schermata da cui rientrare.',
        })),
      ),
    ),
  }
}

const uguali = (a: PermessiModulo, b: PermessiModulo) =>
  a.vedere === b.vedere && a.creare === b.creare && a.modificare === b.modificare && a.eliminare === b.eliminare

const descrivi = (p: PermessiModulo) => {
  const attivi = AZIONI.filter((a) => p[a])
  return attivi.length === 0 ? 'nessun accesso' : attivi.join(', ')
}

/**
 * Salva un blocco di voci. Tutte insieme in una transazione: una matrice applicata a metà
 * è peggio di una non applicata, perché nessuno saprebbe quale metà è passata.
 */
export async function salvaMatrice(voci: VoceMatrice[], autoreId: string) {
  if (voci.length === 0) throw badRequest('Nessuna modifica da salvare.')

  // Validazione prima di toccare qualsiasi cosa.
  for (const v of voci) {
    if (!RUOLI.includes(v.role)) throw badRequest(`Ruolo sconosciuto: ${v.role}`)
    if (!MODULE_KEYS.includes(v.moduleKey)) throw badRequest(`Modulo sconosciuto: ${v.moduleKey}`)
    // Creare, modificare o eliminare senza poter vedere è una combinazione che non
    // significa niente: l'endpoint di lettura sarebbe chiuso e quello di scrittura aperto.
    if (!v.permessi.vedere && (v.permessi.creare || v.permessi.modificare || v.permessi.eliminare)) {
      throw badRequest(
        `«${MODULE_LABELS[v.moduleKey]}» per ${v.role}: non si può scrivere in un modulo che non si vede. ` +
          'Attiva anche la visualizzazione, oppure togli le altre spunte.',
      )
    }
    for (const azione of AZIONI) {
      if (permessoBloccato(v.role, v.moduleKey, azione) && !v.permessi[azione]) {
        throw conflict(
          `«${MODULE_LABELS[v.moduleKey]}» non si può togliere all'amministratore: ` +
            'è la schermata da cui si rimedia a un permesso sbagliato.',
        )
      }
    }
  }

  const precedenti = new Map<string, PermessiModulo>()
  for (const v of voci) {
    precedenti.set(`${v.role}::${v.moduleKey}`, await permessiEffettivi(v.role, v.moduleKey))
  }

  await prisma.$transaction(async (tx) => {
    for (const v of voci) {
      const predefinito = permessiPredefiniti(v.role, v.moduleKey)
      if (uguali(v.permessi, predefinito)) {
        // Torna al predefinito: si cancella la riga invece di salvarne una identica al
        // codice. Così la tabella resta leggibile come «ecco cosa è stato cambiato».
        await tx.rolePermission.deleteMany({ where: { role: v.role, moduleKey: v.moduleKey } })
        continue
      }
      const dati = {
        puoVedere: v.permessi.vedere,
        puoCreare: v.permessi.creare,
        puoModificare: v.permessi.modificare,
        puoEliminare: v.permessi.eliminare,
      }
      await tx.rolePermission.upsert({
        where: { role_moduleKey: { role: v.role, moduleKey: v.moduleKey } },
        update: dati,
        create: { role: v.role, moduleKey: v.moduleKey, ...dati },
      })
    }
  })

  // La cache va buttata **dopo** la transazione: invalidarla prima significherebbe
  // ricaricarla da uno stato che sta ancora per cambiare.
  invalidaCachePermessi()

  const cambiate = voci.filter((v) => {
    const prima = precedenti.get(`${v.role}::${v.moduleKey}`)
    return !prima || !uguali(prima, v.permessi)
  })

  for (const v of cambiate) {
    const prima = precedenti.get(`${v.role}::${v.moduleKey}`)!
    await logActivity(prisma, {
      userId: autoreId,
      azione: 'modifica_permessi',
      entita: 'role_permission',
      entitaId: `${v.role}::${v.moduleKey}`,
      valorePrecedente: `${MODULE_LABELS[v.moduleKey]} · ${v.role}: ${descrivi(prima)}`,
      valoreNuovo: `${MODULE_LABELS[v.moduleKey]} · ${v.role}: ${descrivi(v.permessi)}`,
    })
  }

  return { salvate: voci.length, cambiate: cambiate.length, matrice: await matriceCompleta() }
}

/** Riporta tutto ai valori predefiniti del codice: la via d'uscita da una matrice storta. */
export async function ripristinaPredefiniti(autoreId: string) {
  const { count } = await prisma.rolePermission.deleteMany({})
  invalidaCachePermessi()
  await logActivity(prisma, {
    userId: autoreId, azione: 'ripristina_permessi', entita: 'role_permission',
    valoreNuovo: `${count} personalizzazioni rimosse: matrice riportata ai valori predefiniti`,
  })
  return { rimosse: count, matrice: await matriceCompleta() }
}

export type { Azione, ModuleKey, PermessiModulo }
