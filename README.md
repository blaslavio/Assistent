# Assistent

Een persoonlijke assistent voor telefoon en iPad: Vandaag, agenda en taken, chat en bellen, de assistent, mail,
lijsten, budget, beleggen, leren en zakelijk.

- `web/`: de app (React, Vite, Tailwind). `npm --prefix web run build` bouwt hem naar `docs/app/` (GitHub Pages)
  en `nieuwe_app/` (voor Streamlit). Zet beide mee in een commit.
- `app.py` en `nieuwe_app.py`: de Streamlit-pagina die de gebouwde app laat zien.
- `sql/`: de databasefuncties in Supabase. `supabase/functions/`: de serverfuncties (AI, betalen, mail, bank…).

Testen: `npm --prefix web test`.

Geen geheimen in de code: de repository is openbaar. Sleutels staan alleen in de database of bij Supabase.

De samengebrachte instellingen, externe aanmelding, evenementen, winkelcontact en vectorkaart staan beschreven in [NIEUWE_FUNCTIES.md](NIEUWE_FUNCTIES.md), inclusief vereiste servermigraties en providerinstellingen.

Werk uitsluitend in `/workspace/Assistent` met `main` als actuele basis. De eigen kaartlogica en het waarom staan in [KAARTKOMPAS.md](KAARTKOMPAS.md).
