# TODO Minimalista — stato di avanzamento

> Documento di lavoro: ogni sezione riporta le istruzioni originali (in sintesi) e
> **cosa è stato effettivamente implementato** (✅), con le differenze rispetto allo
> spec. Il riferimento architetturale aggiornato è `ARCHITETTURA.md`.

## Checklist per la pubblicazione

- [ ] Registrare l'estensione su extensionpay.com e impostare il suo ID in `EXT_PAY_ID`
      (`common.js`) — oggi vuoto: in produzione senza ID le funzioni PRO restano bloccate.
- [ ] Rimuovere il toggle di sviluppo: UI in Info (`proTestToggle`), chiave `_devPro`, messaggio
      `proTest` e il ramo di sviluppo in `verifyProLive()`.
- [ ] Valutare l'impatto della licenza **AGPL-3.0** di `ExtPay.js` sul progetto.
- [ ] Verifica manuale su Chrome reale del banner incognito (categoria Adulti).
- [ ] (Facoltativo) dashboard/popup non caricano ExtPay: nessuna superficie PRO, per ora.