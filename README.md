# RiskNexus – Operational Fleet Risk Dashboard

RiskNexus je webová aplikace pro monitoring a prioritizaci provozních rizik vozového parku v reálném čase.  
Nejde o mapové demo nad GPS API, ale o rozhodovací nástroj pro každodenní operativní práci.

---

## 🎯 Pro koho je aplikace

Aplikace je určena pro:

- Fleet manažery  
- Dispečery  
- Provozní a risk management týmy  

Většina GPS systémů ukazuje polohu a rychlost. To ale nestačí.  
Operativní tým potřebuje rychle vědět:

- Které vozidlo je problém?
- Proč je rizikové?
- Je potřeba zásah hned?

RiskNexus proto převádí provozní signály do jednoho srozumitelného **Risk Score**.

Zohledňuje:

- Rychlostní rizika  
- Ztrátu komunikace  
- ECO události  
- Servisní interval  
- Kontext počasí  

Každé skóre je vysvětlitelné — u vozidla je vždy vidět konkrétní důvod rizika.

Cílem je rychlá prioritizace zásahů bez nutnosti manuální analýzy dat.

---

## 🧠 Architektura

### Frontend
- Vue 3 + TypeScript  
- TailwindCSS  
- Leaflet + MarkerCluster  

Hlavní moduly:
- `riskEngine.ts`
- `serviceEngine.ts`
- `weatherRiskEngine.ts`
- `FleetMap.vue`
- `RiskChart.vue`
- `VehicleDetailDrawer.vue`

Business logika je oddělena od UI vrstvy.  
Komponenty pouze renderují data — výpočty probíhají mimo ně.

### Backend
- Express proxy vrstva
- Jednotný `/api/*` kontrakt
- Oddělení frontend ↔ externí GPS API
- Validace parametrů a základní bezpečnostní vrstva

---

## 🤖 Použití AI nástrojů

Použité nástroje:

- **ChatGPT** – architektonické konzultace, návrh risk modelu, debug strategie  
- **Cursor** – implementace a refaktoring konkrétních změn  

AI nebyla použita jako generátor aplikace.  
Sloužila jako sparring partner pro:

- root cause analýzu  
- ověření architektonických rozhodnutí  
- bezpečný refaktoring  

Každá změna byla manuálně validována (UI, edge cases, Network, Console) a commit proběhl až po stabilizaci.

---

## ⚠ Hlavní technické výzvy

### 1️⃣ Stabilita mapy (Leaflet + clustering)

Problémy:
- artefakty při zoomu  
- nekonzistentní viewport při toggle počasí  
- marker drift mezi prohlížeči  
- riziko memory leak při unmountu  

Řešení:
- oddělení plného renderu markerů od aktualizace ikon  
- centralizovaná viewport logika (`applyViewport`)  
- deterministický lifecycle: init → render → cleanup  
- stabilní SVG ikony místo emoji  

Výsledek: předvídatelné chování bez glitchů a bez přepisování celé mapové logiky.

---

### 2️⃣ Risk a servisní logika

- Víceúrovňové prahy pro offline vozidla  
- Oddělení výpočtu skóre od prezentace  
- Oprava bugů v servisním progress výpočtu  
- Deterministický model bez náhodných hodnot  

Princip:  
UI nereší business logiku. Ta žije v oddělené vrstvě.

---

### 3️⃣ Proxy a API stabilita

- CORS problémy při přímém volání API  
- Zavedení Express proxy  
- Jednotný API kontrakt  
- Validace parametrů a fallback logika  

Frontend je díky tomu čistý a nezávislý na implementačních detailech externího API.

---

## 🚀 Možný další rozvoj

- Unit testy pro risk a servisní výpočty  
- Lepší oddělení domén (Risk / Service / Map)  
- Centralizovaný state management  
- Server-side cache (např. pro počasí)  
- CI pipeline (build + test)  
- Optimalizace výkonu při větším počtu vozidel  

---

## 📌 Shrnutí

Cílem nebylo vytvořit vizuálně efektní aplikaci, ale stabilní a srozumitelný rozhodovací nástroj.

Projekt demonstruje:

- oddělení business logiky od UI  
- řešení reálných lifecycle a rendering problémů  
- kontrolu nad technickým dluhem  
- práci s proxy a API integrací  
- pragmatické využití AI jako nástroje  

RiskNexus je základ profesionální fleet risk platformy – ne jen další dashboard nad API.
