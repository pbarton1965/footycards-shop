# FootyCardscz

E-shop se sběratelskými kartami: katalog, košík, objednávka s QR platbou,
oznámení o objednávce na Telegram (a/nebo e-mail) a správa pro prodejce
chráněná heslem. Karty, sklad a objednávky jsou ve sdílené databázi, takže
zákazníci vidí přesně to, co přidáš ty.

## Jak to funguje

- **Zákazník** vidí jen karty skladem, přidá je do košíku, vyplní jméno a telefon,
  souhlasí s podmínkami a odešle objednávku. Hned dostane QR kód k platbě.
- **Server** při objednávce atomicky odečte sklad (dva lidé nekoupí poslední kus),
  cenu spočítá sám (z prohlížeče ji nelze podvrhnout), uloží objednávku
  a pošle ti zprávu na Telegram / e-mail.
- **Ty (správce)** se přihlásíš odkazem „Správce“ úplně dole na stránce. Pak můžeš
  přidávat, upravovat a mazat karty, vidíš všechny objednávky (s telefonem
  zákazníka) a můžeš objednávku zrušit — karty se vrátí na sklad.

## Nasazení krok za krokem

### 1. GitHub a Vercel
Nahraj obsah této složky do nového repozitáře na GitHubu (soubory musí být
přímo v kořeni repozitáře, ne ve složce). Na [vercel.com](https://vercel.com)
přihlášení přes GitHub → **Add New → Project** → vyber repozitář → **Deploy**
(nastavení nech výchozí, Vercel pozná Vite).

### 2. Databáze (zdarma)
Ve Vercelu otevři projekt → záložka **Storage** → **Create Database** →
**Upstash for Redis** → zvol bezplatný tarif → **Connect to Project**.
Vercel sám přidá potřebné proměnné (`KV_REST_API_URL`, `KV_REST_API_TOKEN`
nebo `UPSTASH_REDIS_REST_URL/TOKEN` — appka umí obě varianty).
Názvy tlačítek se mohou mírně lišit podle aktuální podoby Vercelu.

### 3. Proměnné prostředí
**Settings → Environment Variables**, přidej:

| Název | Hodnota | Povinné |
|---|---|---|
| `ADMIN_PASSWORD` | dlouhé heslo pro správu (min. 12 znaků) | ano |
| `PAYMENT_ACCOUNT` | číslo účtu, např. `19-2000145399/0800` nebo `123456789/0100` | pro QR platbu |
| `TELEGRAM_BOT_TOKEN` | token bota z @BotFather | pro Telegram |
| `TELEGRAM_CHAT_ID` | tvoje číslo z @userinfobot | pro Telegram |
| `RESEND_API_KEY` + `SHOP_EMAIL` | klíč z resend.com a tvoje adresa | pro e-mail (volitelné) |

Bez `PAYMENT_ACCOUNT` se QR nezobrazí (zákazníkovi se napíše, že platbu domluvíš).
IBAN se dopočítá sám.

### 4. Redeploy
**Deployments → ⋯ → Redeploy**, aby se proměnné načetly.

### 5. První spuštění
1. Otevři adresu appky, dole klikni na **Správce**, zadej `ADMIN_PASSWORD`.
2. V záložce **Přidat kartu** přidej první karty (fotky se při nahrání zmenší samy).
3. Odhlas se a zkus udělat zkušební objednávku jako zákazník — zpráva přijde na Telegram.
   Zkušební objednávku pak v záložce **Objednávky** zruš, karty se vrátí na sklad.

### Telegram
1. V Telegramu napiš **@BotFather** → `/mybots` → tvůj bot → **API Token**.
2. Napiš **@userinfobot** — odpoví ti tvým číslem **Id** (to je `TELEGRAM_CHAT_ID`).
3. Otevři svého bota a klikni **Start** (jinak ti nemůže psát).

Token nikdy nevkládej do kódu ani na GitHub, patří jen do proměnných ve Vercelu.
Pokud ho někdo uvidí, v @BotFather ho zneplatníš (**Revoke current token**)
a ve Vercelu nahradíš novým.

## Dobré vědět

- Heslo správce se kontroluje na serveru; po 10 špatných pokusech za 15 minut se IP zablokuje.
- Jedna IP může odeslat max. 5 objednávek za hodinu (ochrana proti zahlcení skladu).
- Košík a „Moje objednávky“ si zákazník pamatuje ve svém zařízení; ostatní data jsou v databázi.
- Před spuštěním doplň své údaje v `src/App.jsx` v konstantě `SELLER`
  (jméno, adresa, IČO) — zobrazují se v obchodních podmínkách a GDPR.
- Karty z dřívější verze appky (ukládané jen v prohlížeči) se nepřenášejí,
  obchod začíná prázdný.
