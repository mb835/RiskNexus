# RiskNexus

**Operational Fleet Risk Dashboard**

## 🎯 Pro koho je appka a proč

RiskNexus je rozhodovací dashboard pro fleet manažery, dispečery a provozní týmy. 

Většina GPS systémů ukazuje pouze polohu a rychlost. Operativní řízení však potřebuje rychle znát odpovědi na kritické otázky:
* Které vozidlo je rizikové?
* Proč je rizikové?
* Je nutný okamžitý zásah?

RiskNexus převádí surové provozní signály (rychlost, offline stav, servisní interval, ECO události, kontext počasí) do srozumitelného **Risk Score** doplněného vysvětlením. 

**Cíl:** Žádný prázdný vizuální efekt, ale rychlá a obhajitelná prioritizace zásahů.

---

## Na co jsem narazil a jak jsem to vyřešil

### 🗺 Stabilita mapy (Leaflet + clustering)
* **Problém:** Artefakty při zoomu, nekonzistentní viewport a riziko memory leak při unmountu.
* **Jak jsem to vyřešil:** Oddělil jsem plný render markerů od pouhé aktualizace ikon, centralizoval viewport logiku do jediné funkce (`applyViewport`) a zavedl deterministický lifecycle (init → render → cleanup). Nestabilní emoji ikony byly nahrazeny SVG.
* **Výsledek:** Předvídatelné chování bez glitchů a bez přepisování celé mapové vrstvy.

### ⚙️ Risk a servisní logika
* **Problém:** Nepřesnosti ve výpočtu servisního progressu a míchání výpočtové logiky s UI.
* **Jak jsem to vyřešil:** Zavedl jsem víceúrovňové prahy pro offline stav, opravil výpočet servisního intervalu a přesunul veškerou business logiku do samostatných modulů mimo UI. Skóre je nyní plně deterministické.
* **Výsledek:** Stabilní a konzistentní risk model, kde komponenty pouze renderují data.

### 🔐 Proxy a API stabilita
* **Problém:** CORS chyby a vystavení API klíčů při přímém volání externího API.
* **Jak jsem to vyřešil:** Zavedl jsem Express proxy vrstvu, vytvořil jednotný `/api/*` kontrakt a přidal serverovou validaci parametrů s fallback logikou.
* **Výsledek:** Čistá separace frontend ↔ backend a kontrolovaná komunikace s externími službami.
---

## 🤖 Využití AI nástrojů

AI sloužila jako podpůrný nástroj pro zrychlení iterací, nicméně finální rozhodnutí a validace byly vždy manuální. Prompty do Cursoru byly psány v angličtině kvůli maximální terminologické přesnosti.

**Nástroje:**
* **ChatGPT:** Architektonické konzultace, návrh risk modelu, práce s edge cases.
* **Cursor:** Implementace a cílený refaktoring.

**Workflow:**
1. Definice problému a architektonického dopadu.
2. Návrh řešení s AI jako sparring partnerem.
3. Implementace s jasně omezeným scope *(ochrana proti feature creepu)*.
4. Manuální validace (Network tab, Console, testování edge cases).
5. Commit až po plné stabilizaci.

---

##  Co bych přidal, kdybych měl více času

* **Bezpečnost:** Striktní omezení CORS, autentizace, základní hardening backendu.
* **Mapová vrstva:** Výkonnější WebGL řešení pro stabilní rendering většího množství vozidel.
* **AI vrstva:** Inteligentní nadstavba pro automatickou prioritizaci a doporučení zásahů.
* **Robustnost:** Zavedení unit testů pro risk model, integrace CI pipeline, striktnější validace vstupů.
* **Škálování:** Přechod na WebSocket místo HTTP pollingu, server-side agregace, nasazení cache vrstvy.
* **Risk model:** Rozšíření o live dopravní data, historické vzorce chování řidiče a prediktivní hodnocení.
