/**
 * Dati legali dell'azienda, in un punto solo.
 *
 * Erano scritti dentro l'informativa privacy della vista cliente; da quando servono anche
 * altrove (l'import delle fatture elettroniche usa la partita IVA per capire quali fatture
 * sono di Heemia e quali no) vivono qui: due copie della stessa partita IVA sono due cose
 * che possono divergere, e questa è di quelle che si aggiornano di rado e si dimenticano.
 *
 * Forniti da Giulia il 2026-08-06; CAP aggiunto il 2026-08-11 (chiude [[OQ-25]]).
 */
export const AZIENDA = {
  ragioneSociale: 'Omeni S.r.l.s.',
  marchio: 'Heemia',
  sedeLegale: 'Via B. Peruzzi 26, 41012 Carpi (MO)',
  partitaIva: '04067450363',
  email: 'heemia.lab@gmail.com',
} as const

/** Come si presenta il titolare del trattamento nell'informativa privacy. */
export const TITOLARE = {
  ragioneSociale: `${AZIENDA.ragioneSociale} — marchio ${AZIENDA.marchio}`,
  sedeLegale: AZIENDA.sedeLegale,
  partitaIva: AZIENDA.partitaIva,
  email: AZIENDA.email,
} as const
