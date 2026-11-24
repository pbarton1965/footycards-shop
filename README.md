# FootyCardscz

E-shop se sběratelskými kartami: katalog, košík, objednávka s QR platbou,
oznámení o objednávce na Telegram (a/nebo e-mail) a správa pro prodejce
chráněná heslem. Karty, sklad a objednávky jsou ve sdílené databázi, takže
zákazníci vidí přesně to, co přidáš ty.

## Jak to funguje

- **Zákazník** vidí jen karty skladem, přidá je do košíku, vyplní jméno, telefon a e-mail,
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
| `SMTP_HOST` | adresa SMTP serveru od poskytovatele e-mailu | pro e-mail (volitelné) |
| `SMTP_PORT` | port SMTP; výchozí je `465` | pro e-mail (volitelné) |
| `SMTP_USER` | přihlašovací jméno k SMTP | pro e-mail (volitelné) |
| `SMTP_PASS` | heslo nebo aplikační heslo k SMTP | pro e-mail (volitelné) |
| `SHOP_EMAIL` | adresa, na kterou chodí oznámení prodejci | pro e-mail (volitelné) |
| `EMAIL_FROM` | volitelná adresa odesílatele; jinak se použije `SMTP_USER` | volitelné |
| `VITE_PACKETA_API_KEY` | veřejný klíč widgetu Zásilkovny z klientské sekce Packeta | pro výběr výdejního místa |

Bez `PAYMENT_ACCOUNT` se QR nezobrazí (zákazníkovi se napíše, že platbu domluvíš).
IBAN se dopočítá sám.

`VITE_PACKETA_API_KEY` je veřejný klíč určený pro widget; nevkládej API heslo. Nastav ho ve Vercelu pro produkční prostředí a aplikaci znovu nasaď. Objednávky zatím obsahují vybrané výdejní místo, zásilky vytváříš ručně v klientské sekci Packeta a cenu dopravy potvrzuješ před uzavřením smlouvy.

### 4. Redeploy
**Deployments → ⋯ → Redeploy**, aby se proměnné načetly.

### 5. První spuštění
1. Otevři adresu appky, dole klikni na **Správce**, zadej `ADMIN_PASSWORD`.
2. V záložce **Přidat kartu** přidej první karty (fotky se při nahrání zmenší samy).
3. Odhlas se a zkus udělat zkušební objednávku jako zákazník. Zkontroluj nastavená oznámení a pak ji v záložce **Objednávky** zruš, aby se karty vrátily na sklad.

### E-mailová oznámení

E-mailová oznámení jsou volitelná a používají SMTP. Nastav ve Vercelu → **Settings → Environment Variables**:

- `SMTP_HOST`: SMTP server poskytovatele e-mailu.
- `SMTP_PORT`: port SMTP; pokud ho vynecháš, aplikace použije `465`.
- `SMTP_USER`: přihlašovací jméno k SMTP.
- `SMTP_PASS`: heslo nebo aplikační heslo k SMTP.
- `SHOP_EMAIL`: cílová adresa pro oznámení prodejci.
- `EMAIL_FROM`: volitelné jméno nebo adresa odesílatele; bez něj se použije `SMTP_USER`.

Aplikace používá stejné SMTP nastavení pro oznámení prodejci i potvrzení objednávky zákazníkovi. E-mail zákazníka je při objednávce povinný. Po změně proměnných proveď **Redeploy**. Nastavení `RESEND_API_KEY` samo o sobě nestačí, protože aktuální kód odesílá poštu přes SMTP.

### Telegram
1. V Telegramu napiš **@BotFather** → `/mybots` → tvůj bot → **API Token**.
2. Napiš **@userinfobot** — odpoví ti tvým číslem **Id** (to je `TELEGRAM_CHAT_ID`).
3. Otevři svého bota a klikni **Start** (jinak ti nemůže psát).

Token nikdy nevkládej do kódu ani na GitHub, patří jen do proměnných ve Vercelu.
Pokud ho někdo uvidí, v @BotFather ho zneplatníš (**Revoke current token**)
a ve Vercelu nahradíš novým.

### Když oznámení nechodí
1. Vytvoř zkušební objednávku a potom se přihlas jako správce → **Objednávky**.
2. U objednávky zkontroluj stav e-mailu a Telegramu. Objednávka se uloží i při selhání oznámení; můžeš ji proto vyřídit ručně a zkušební objednávku zrušit, aby se karty vrátily na sklad.
3. Ověř názvy a hodnoty proměnných ve Vercelu. Po každé změně udělej **Redeploy**.

## Obrázky karet

- U každé karty lze nahrát **přední i zadní stranu**. Zákazník si kartu v obchodě otočí tlačítkem
  „Otočit“ a kliknutím ji zvětší (líc i rub vedle sebe).
- Fotka se zobrazí **celá, bez ořezu**, v poměru skutečné karty 5:7. Velké fotky z telefonu
  se při nahrání samy zmenší (delší strana 800 px) a zkomprimují, takže stačí vyfotit a nahrát.
- U existující karty jde zadní stranu přidat, vyměnit nebo odebrat v **Upravit**.

## Dobré vědět

- Heslo správce se kontroluje na serveru; po 10 špatných pokusech za 15 minut se IP zablokuje.
- Jedna IP může odeslat max. 5 objednávek za hodinu (ochrana proti zahlcení skladu).
- Košík a „Moje objednávky“ si zákazník pamatuje ve svém zařízení; ostatní data jsou v databázi.
- Před spuštěním doplň své údaje v `src/App.jsx` v konstantě `SELLER`
  (jméno, adresa, IČO) — zobrazují se v obchodních podmínkách a GDPR.
- Karty z dřívější verze appky (ukládané jen v prohlížeči) se nepřenášejí,
  obchod začíná prázdný.
