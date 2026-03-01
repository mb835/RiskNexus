# RiskNexus – Operational Fleet Risk Dashboard

RiskNexus je real-time dashboard pro řízení rizik vozového parku.

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

RiskNexus proto převádí provozní signály – rychlost, ztrátu komunikace, ECO události, servisní interval i kontext počasí – do jednoho srozumitelného **Risk Score**.

Nejde jen o číslo. Každé vozidlo má vysvětlený důvod rizika, takže rozhodnutí má vždy oporu v datech, ne jen v intuici.

Cílem je rychlá prioritizace zásahů bez nutnosti manuální analýzy dat.

---

## 🧰 Tech Stack

![Vue](https://img.shields.io/badge/Vue%203-42b883?style=for-the-badge&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06b6d4?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)

Hlavní moduly:
- `riskEngine.ts`
- `serviceEngine.ts`
- `weatherRiskEngine.ts`
- `FleetMap.vue`
- `RiskChart.vue`
- `VehicleDetailDrawer.vue`

Business logika je oddělena od UI vrstvy.  
Komponenty pouze renderují data – výpočty probíhají mimo ně.

#### Backend

- Express proxy vrstva  
- Jednotný `/api/*` kontrakt  
- Oddělení frontend ↔ externí GPS API  
- Validace parametrů  
- Základní bezpečnostní vrstva  

Proxy server byl navržen jako bezpečnostní a architektonická bariéra
mezi klientskou aplikací a externími službami.  
Zajišťuje ochranu API klíčů a kontrolu nad komunikací s externími API.

---

## 🤖 Použití AI nástrojů

Použité nástroje:

- **ChatGPT** – architektonické konzultace, návrh risk modelu, debug strategie  
- **Cursor** – implementace a refaktoring konkrétních změn  

Ještě před zahájením práce jsem si v Cursoru definoval jasná pravidla (rules), která určovala:

- žádné přepisování celých souborů mimo scope  
- žádné narušení existující business logiky  
- minimální a cílené změny  
- zachování architektonické konzistence  

AI jsem používal jako sparring partnera nástroj pro ověření uvažování a bezpečný refaktoring.  
Finální rozhodnutí a validace byly vždy manuální.

---

## 🔄 Development Workflow

Projekt byl vyvíjen postupně, po malých a kontrolovaných krocích,
s důrazem na stabilitu a řízení komplexity.

Každá změna měla jasně definovaný scope a byla ověřena
před dalším rozšířením funkcionality.

Typický vývojový cyklus:

1. Definice problému (UX, rendering, business logika).
2. Návrh řešení a posouzení architektonického dopadu.
3. Cílená implementace s minimálním zásahem do existujícího kódu.
4. Manuální validace v reálném UI (Network, Console, edge cases).
5. Commit až po stabilizaci změny.
6. V případě nestability vědomý revert místo rychlého patchování.

Priorita byla vždy:

**stabilita > množství funkcí**

---

## ⚠ Hlavní technické výzvy

### 1️⃣ Stabilita mapy (Leaflet + clustering)

Problémy:
- artefakty při zoomu  
- nekonzistentní viewport při přepínání počasí  
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

Zásadní princip:
komponenta pouze renderuje, business logika žije mimo ni.

---

### 3️⃣ Proxy a API stabilita

- CORS problémy při přímém volání API  
- Zavedení Express proxy  
- Jednotný API kontrakt  
- Validace parametrů a fallback logika  

Výsledkem je čistá separace odpovědností mezi frontendem a backendem.

---

## 🚀 Možný další rozvoj

Další rozvoj bych rozdělil do tří oblastí: robustnost, rozšíření risk modelu a škálování.

### 1️⃣ Robustnost a kvalita

- Unit testy pro risk score, servisní výpočty a weather logiku  
- CI pipeline (automatický build + test)  
- Přesnější typování API modelů a validace vstupních dat  
- Audit log změn risk score pro dohledatelnost rozhodnutí  

### 2️⃣ Rozšíření risk modelu

Risk skóre by mohlo zohledňovat další kontextové faktory:

- Dopravní situaci (nehody, uzavírky, hustota provozu)  
- Typ trasy (město vs. dálnice vs. rizikové úseky)  
- Historické chování řidiče  
- Frekvenci tvrdého brzdění / akcelerace  
- Podezřelé palivové vzorce  
- Servisní historii místo simulovaných intervalů  

Cílem by bylo přejít od reaktivního hodnocení k prediktivnímu modelu rizika.

### 3️⃣ Škálování a výkon

- Server-side agregace místo čistě frontendové logiky  
- Cache vrstvy (např. TTL pro počasí a dopravní data)  
- Debounce a optimalizace renderu při větším počtu vozidel  
- WebSocket místo polling přístupu  

Směr: posun od prototypu směrem k produkčně škálovatelné risk platformě.

---

## 📌 Shrnutí

Cílem nebylo vytvořit vizuálně efektní aplikaci, ale stabilní a srozumitelný rozhodovací nástroj.

Projekt demonstruje:

- oddělení business logiky od UI  
- řešení reálných lifecycle a rendering problémů  
- kontrolu nad technickým dluhem  
- práci s proxy a API integrací  
- disciplinované využití AI nástrojů  

---

## 🛠 Lokální spuštění

### Požadavky
- Node.js 18+
- npm 9+

### Instalace
```bash
git clone https://github.com/your-username/risknexus.git
cd risknexus
npm install
```

### Konfigurace
V kořenové složce projektu vytvoř soubor `.env`:

```env
GPS_API_URL=...
GPS_API_USERNAME=...
GPS_API_PASSWORD=...
WEATHER_API_KEY=...
```

### Spuštění

Backend (Express proxy):
```bash
npm run server
```

Frontend (Vite):
```bash
npm run dev
```

Frontend běží na:
http://localhost:5173
