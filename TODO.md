# TODO Minimalista — stato di avanzamento

> Documento di lavoro: ogni sezione riporta le istruzioni originali (in sintesi) e
> **cosa è stato effettivamente implementato** (✅), con le differenze rispetto allo
> spec. Il riferimento architetturale aggiornato è `ARCHITETTURA.md`; il resoconto
> delle attività completate è in `DONE.md`.

## Checklist per la pubblicazione (azioni manuali / non eseguibili in codice)

- [ ] **Rimuovere il toggle di sviluppo PRO** (Impostazioni → Info → "PRO — solo sviluppo",
      `proDevToggle` / `_devPro` in `background.js` e `options.js`): è un espediente SOLO
      per la fase di development.
- [ ] Registrare l'estensione su extensionpay.com e impostare il suo ID in `EXT_PAY_ID`
      (`common.js`) — oggi vuoto: in produzione senza ID le funzioni PRO restano bloccate.
- [ ] Valutare formalmente l'impatto della licenza **AGPL-3.0** di `ExtPay.js` sul progetto
      (nota preliminare in `DONE.md`).
- [ ] Verifica manuale su Chrome reale del banner incognito (categoria Adulti).
- [ ] (Facoltativo) dashboard/popup non caricano ExtPay: nessuna superficie PRO, per ora.