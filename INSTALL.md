# Silly Park installeren en spelen

Deze handleiding is voor ouders: van een lege Windows-pc tot vier kinderen met controllers op de bank. Je hebt
alleen bij het installeren en bijwerken internet nodig.

**In het kort (Windows):**

1. Installeer **Node.js LTS** van [nodejs.org](https://nodejs.org).
2. Haal het spel binnen (met Git, of als ZIP-bestand).
3. Dubbelklik op **`play.bat`** in de map van het spel. De browser opent het spel vanzelf.

Bijwerken naar de nieuwste versie: dubbelklik op **`update.bat`**.

---

## Wat je nodig hebt

- Een pc met **Windows 10 of 11** (een Mac of Linux kan ook, zie [onderaan](#mac-en-linux)).
- **Google Chrome** of **Microsoft Edge**. Andere browsers werken vaak ook, maar controllers en "als app installeren"
  werken het best in Chrome en Edge.
- Controllers: een **HORI Pad Mini** of een andere USB- of Bluetooth-controller (Xbox, PlayStation, Switch Pro...).
  Tot vier spelers. Zonder controllers kan het ook: twee spelers op het toetsenbord, of met een touchscreen.
- Een tv via HDMI is fijn, maar niet nodig.

## Stap 1: Node.js installeren (eenmalig)

Node.js is het programma dat het spel klaarzet en op je eigen pc laat draaien.

1. Ga naar [nodejs.org](https://nodejs.org) en download de **LTS**-versie (versie 22 of nieuwer).
2. Installeer met alle standaardkeuzes (steeds op *Next* klikken).
3. Controleer het: open **Opdrachtprompt** (Start-knop, typ `cmd`, Enter) en typ:

   ```
   node --version
   ```

   Je ziet iets als `v24.9.0`. Zie je *"node wordt niet herkend"*, start de pc dan opnieuw op en probeer het nog eens.

## Stap 2: Het spel binnenhalen (eenmalig)

Kies **A** of **B**. Met Git (A) is bijwerken later één dubbelklik.

### A. Met Git (aanrader)

1. Installeer **Git for Windows** van [git-scm.com](https://git-scm.com/download/win), met de standaardkeuzes.
2. Open Opdrachtprompt en typ (de map mag je zelf kiezen; zet de naam tussen aanhalingstekens als er een spatie in zit):

   ```
   git clone https://github.com/Knaapman/Silly-dog-game.git "C:\games\silly dogs"
   ```

   Is de repository privé, dan vraagt Git om in te loggen bij GitHub. Er opent een venster, log daar in.

### B. Als ZIP-bestand

1. Ga naar [github.com/Knaapman/Silly-dog-game](https://github.com/Knaapman/Silly-dog-game), klik op de groene knop
   **Code** en dan op **Download ZIP**.
2. Klik met de rechtermuisknop op het ZIP-bestand, kies **Alles uitpakken...** en kies een map, bijvoorbeeld
   `C:\games\silly dogs`.

## Stap 3: Spelen

1. Open de map van het spel in de Verkenner.
2. Dubbelklik op **`play.bat`**.
   - Er opent een zwart venster. De eerste keer haalt het een minuut of twee onderdelen binnen (daarvoor is internet
     nodig). Daarna zet het het spel klaar en opent de browser vanzelf op **http://localhost:4321**.
   - Krijg je een waarschuwing van Windows (*"Windows heeft uw pc beveiligd"* of *"Kan de uitgever niet
     verifiëren"*)? Klik op **Meer informatie** en **Toch uitvoeren** (of op **Uitvoeren**). Dat komt omdat het bestand
     van internet komt; het doet niets anders dan wat hierboven staat.
   - Vraagt de **Windows Firewall** of Node.js toegang mag hebben tot het netwerk? Dat is niet nodig om op deze pc te
     spelen: **Annuleren** mag. Kies je **Toegang toestaan**, dan kan een tablet in hetzelfde wifi-netwerk het spel ook
     openen (op het adres dat in het zwarte venster staat bij *Network*).
   - Opent het spel in een andere browser dan Chrome of Edge? Kopieer dan het adres `http://localhost:4321` naar Chrome
     of Edge.
3. **Laat het zwarte venster open** zolang er gespeeld wordt. Het venster sluiten stopt het spel (behalve als het als
   app is geïnstalleerd, zie hieronder).

Liever zelf typen? In Opdrachtprompt:

```
cd /d "C:\games\silly dogs"
npm install
npm run play
```

## Controllers en de tv

- Sluit de controllers aan **voordat** je de browser opent, of druk daarna op een knop: browsers laten een controller
  pas zien als er een keer op gedrukt is.
- Op het startscherm start **elke knop** het spel. Elke volgende controller doet mee met een druk op een knop.
- Op de tv: sluit de pc aan met HDMI en druk op **F11** voor volledig scherm (of gebruik de knop **Full screen** in
  het ouder-menu).
- Werkt een controller niet goed? In het ouder-menu zit **Test controllers**: elke knop die je indrukt licht op.
- Een kind vastgelopen? Houd **alle vier de schouderknoppen** (L, R, ZL en ZR) **5 seconden** ingedrukt: het dier
  ploft los en komt naast een vriendje (of op het plein) weer tevoorschijn. Duwt een kind een tijdje tegen iets aan
  zonder vooruit te komen, dan gebeurt dat ook vanzelf.

## Het ouder-menu

Houd **Start** (de `+`-knop op de HORI) **1 seconde** ingedrukt, of druk op **Esc** op het toetsenbord. Het spel staat
stil zolang het menu open is. Het menu is in het Engels; dit zit erin:

- Bovenaan knoppen voor geluid, muziek, **Tidy up the park** (alles terug op zijn plek), **Full screen**,
  **Back to start**, **Test controllers**, het stickerboek (**Sticker album**) en **Close**. Daaronder het volume en de
  zoom (hoe dichtbij de camera is).
- De instellingen (blijven bewaard), onder andere:
  - **Running speed**: *Calm* / *Normal* / *Zoomy*.
  - **Split screen when far apart**: het scherm splitst als de kinderen ver uit elkaar lopen (*On*). Staat het *Off*,
    dan worden de kinderen zachtjes bij elkaar gehouden (**Stay together**).
  - **Buddy when playing alone**: een computer-maatje voor een kind dat alleen speelt.
  - **Catching the cats**: hoe makkelijk de parkkatten te vangen zijn (*Auto* past zich per kind aan).
  - **Surprises**, **Controller rumble** en **Graphics** (*Auto* / *Low* / *High* / *Ultra*).
- **Progress** (sterren, hoedjes en stickers), **Photos** (de foto's die de kinderen maakten, met **Save** om op te
  slaan) en **Put it on the desktop** (zie hieronder).
- **Play log**: een kort verslag van de laatste tien speelsessies op deze pc: hoe soepel het spel liep, of er dieren
  vast kwamen te zitten, of een controller wegviel, en eventuele fouten. Met **Save** sla je het op als bestand, om
  mee te sturen als er iets niet goed gaat; **Clear** maakt het leeg. Er wordt nooit vanzelf iets verstuurd.
- Een plaatje met alle knoppen van controller en toetsenbord.

## Als app op het bureaublad (werkt ook zonder internet)

Is het spel één keer gestart met `play.bat`, dan kun je het als app installeren:

- In Chrome of Edge: klik op het **installeer-icoontje** rechts in de adresbalk, of kies **Put it on the desktop** in
  het ouder-menu.
- Daarna staat er een Silly Park-icoon op het bureaublad. Dat opent het spel schermvullend, **zonder** zwart venster
  en zonder internet.
- Na een update (zie hieronder) start je één keer `play.bat` en open je het spel. Daarna opent de app ook de nieuwe
  versie.

## Bijwerken naar de nieuwste versie

- **Met Git (A):** dubbelklik op **`update.bat`**. Die haalt de nieuwste versie op en start daarna het spel.
- **Met een ZIP (B):** download de ZIP opnieuw en pak hem uit over de oude map heen (bestanden vervangen). Dubbelklik
  daarna op `play.bat`.

Zie je na een update nog de oude versie? Sluit het spel (en de app), start `play.bat` opnieuw en druk in de browser
op **Ctrl+F5**.

## Voortgang: stickers, sterren, hoedjes en foto's

Alles wordt in de **browser** op deze pc bewaard, bij het adres `http://localhost:4321`. Dus:

- Speel steeds in **dezelfde browser** (of de app), dan blijft alles bewaard. Een andere browser begint opnieuw.
- **Browsergegevens wissen** (cookies en sitegegevens) wist ook de stickers en foto's.
- Opnieuw beginnen kan in het ouder-menu bij **Progress**: klik op **Start over** en daarna nog een keer.
- Foto's bewaren: in het ouder-menu bij **Photos**, met de knop **Save** onder een foto.

## Problemen oplossen

| Wat je ziet | Wat je kunt doen |
|---|---|
| *"npm" of "node" wordt niet herkend* | Node.js is niet (goed) geïnstalleerd, of de pc is nog niet opnieuw opgestart na de installatie. Zie stap 1. |
| In PowerShell: *"running scripts is disabled on this system"* | Gebruik `play.bat` of de gewone **Opdrachtprompt** (`cmd`) in plaats van PowerShell. |
| `npm install` geeft een fout over internet of een proxy | Controleer de internetverbinding en probeer het opnieuw. De eerste keer is internet nodig. |
| Het spel opent op een ander adres, zoals `localhost:4322` | Er draait al een spel in een ander zwart venster. Sluit alle zwarte vensters en start `play.bat` opnieuw. (Op een ander adres lijkt de voortgang weg, want die hoort bij `localhost:4321`.) |
| Zwart of grijs scherm | Gebruik Chrome of Edge en zet in de browserinstellingen **Grafische versnelling gebruiken** aan (Chrome: Instellingen → Systeem). Werk eventueel het stuurprogramma van de videokaart bij. |
| Het spel hapert | Zet in het ouder-menu **Graphics** op *Low*. Op *Auto* gaat het spel na een paar seconden zelf omlaag. Een gesplitst scherm met drie of vier kinderen is zwaarder; dat kun je uitzetten met **Split screen when far apart**. |
| Een controller doet niets | Druk op een knop (browsers zien hem pas na een druk). Probeer een andere USB-poort. Kijk bij **Test controllers** in het ouder-menu wat het spel binnenkrijgt. |
| Een kind is "weg" (💤 bij zijn badge) | De controller is losgeraakt of de batterij is leeg. Sluit hem weer aan en druk op een knop: het dier wordt wakker. |
| Het beeld wordt zwart en het spel begint na een paar seconden opnieuw | De videokaart viel even weg (bijvoorbeeld na de slaapstand of een update van het stuurprogramma). Het spel start dan vanzelf opnieuw; stickers, sterren en instellingen blijven bewaard, de kinderen drukken op een knop om weer mee te doen. Gebeurt het vaak, werk dan het stuurprogramma van de videokaart bij. |
| Iets gaat steeds mis, of een deel van het park doet het niet | Open het ouder-menu en klik bij **Play log** op **Save**. Stuur dat bestand mee met wat je zag: daarin staat hoe soepel het spel liep, waar dieren vastzaten en welke fouten er waren. (Gaat er iets mis in één deel van het park, dan speelt de rest gewoon door.) |
| De oude versie na een update | Sluit alles, start `play.bat` opnieuw en druk op **Ctrl+F5** in de browser. |
| `update.bat` zegt dat de map geen Git-kopie is | Je hebt het spel als ZIP gedownload. Werk bij door de ZIP opnieuw te downloaden (zie *Bijwerken*), of haal het één keer opnieuw binnen met Git (stap 2A). |

## Mac en Linux

Installeer Node.js LTS (en Git) en gebruik de Terminal:

```
git clone https://github.com/Knaapman/Silly-dog-game.git silly-park
cd silly-park
npm install
npm run play
```

Bijwerken: `git pull`, daarna weer `npm install` en `npm run play`.

## Voor wie aan het spel wil sleutelen

Alles over de code, de tests en de opbouw van het spel staat in [README.md](README.md), onder *Development*.
