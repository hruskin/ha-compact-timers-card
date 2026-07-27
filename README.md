# Compact Timers Card

Kompaktní Lovelace karta s odpočtem časovačů z reproduktorů Google Home / Nest.
Jeden řádek na časovač, výška ~30 px: vlevo ikona a nastavený čas, uprostřed
ubývající bar, vpravo zbývající čas a tlačítko pro zrušení.

Karta se sama skryje, když neběží žádný časovač.

Registruje element `compact-timers-card`, takže může běžet vedle
[google_home_timers_card](https://github.com/DurgNomis-drol/google_home_timers_card)
(`googletimers-card`) i [timer-bar-card](https://github.com/rianadon/timer-bar-card)
bez kolize.

## Požadavky

- [ha-google-home](https://github.com/leikoilja/ha-google-home) — poskytuje entity
  `sensor.<zarizeni>_timers` s atributem `timers`
- Home Assistant 2024.10.0 nebo novější

Volitelně umí zobrazit i nativní `timer.*` entity.

## Instalace

### HACS (vlastní repozitář)

1. HACS → Frontend → tři tečky → Custom repositories
2. URL repozitáře, kategorie **Lovelace**
3. Nainstalovat a obnovit stránku

### Ručně

Zkopíruj `dist/compact-timers-card.js` do `/config/www/` a přidej resource:

```yaml
url: /local/compact-timers-card.js
type: module
```

## Konfigurace

Karta má vizuální editor — v dashboardu ji přidáš přes **Přidat kartu →
Compact Timers Card** a nastavíš myší. Nabídka zdrojů je předfiltrovaná, takže
vybíráš jen z entit `sensor.*_timers` a `timer.*`. Pod formulářem je pro každý
vybraný zdroj vlastní výběr ikony.

Vybíráš **zdroje**, ne jednotlivé časovače: zaškrtnutý reproduktor zobrazí
všechny své běžící časovače. Jednotlivé časovače vybírat nelze — jejich
`timer_id` je UUID, které Google vygeneruje při založení, takže po doběhnutí
a založení nového by uložený výběr nesedel na nic.

YAML odpovídající tomu, co editor vytvoří:

```yaml
type: custom:compact-timers-card
entities:
  - sensor.living_room_timers
  - sensor.bedroom_timers
```

S ikonou podle zařízení:

```yaml
type: custom:compact-timers-card
entities:
  - entity: sensor.living_room_timers
    icon: mdi:sofa
  - entity: sensor.bedroom_timers
    icon: mdi:bed
  - entity: timer.dishwasher_timer
    icon: mdi:dishwasher
```

### Volby

| Volba | Výchozí | Popis |
| --- | --- | --- |
| `entities` | — | Povinné. Seznam entit, buď `entity_id`, nebo objekt s `entity` a `icon`. |
| `title` | není | Když je vyplněný, karta dostane hlavičku s ikonou a textem. |
| `icon` | `mdi:timer-sand` | Výchozí ikona řádku pro zdroje bez vlastní `icon`. |
| `font_size` | `0` | Velikost písma v px. `0` převezme velikost z motivu (`--ha-font-size-m`). |
| `hide_when_empty` | `true` | Skryje celou kartu, když neběží žádný časovač. |
| `show_cancel` | `true` | Zobrazí tlačítko pro zrušení časovače. |
| `confirm_cancel` | `true` | Zrušení na dva kliky — první ozbrojí, druhý do 3 s potvrdí. |
| `warn_ratio` | `0.2` | Podíl zbývajícího času, pod kterým bar zežloutne. |
| `danger_seconds` | `10` | Počet sekund, pod kterým bar i číslo zčervenají. |
| `linger_seconds` | `20` | Jak dlouho po doběhnutí řádek zůstane, než ho HA odstraní. |
| `max_timers` | `0` | Limit počtu zobrazených řádků, `0` = bez limitu. |

Časovače se řadí podle nejbližšího doběhnutí.

### Písmo

Karta nemá vlastní font — dědí `--ha-font-family-body` z motivu, takže splyne
se zbytkem dashboardu. Číslice používají `font-variant-numeric: tabular-nums`,
aby měly pevnou šířku a odpočet při přepisu neposkakoval.

Velikost se bere z `--ha-font-size-m`; volbou `font_size` ji přebiješ. Ostatní
prvky se odvozují od ní — nastavený čas o 2 px menší, ikony a tlačítko úměrně,
šířky sloupců v `em`. Výšku řádku drží tlačítko pro zrušení, takže větší písmo
kartu nenatáhne.

## Zrušení časovače

- Google Home: `google_home.delete_timer` s `entity_id` a `timer_id`
- Nativní timer: `timer.cancel`

## Známé omezení

U **pozastaveného** časovače integrace nedodává použitelný `fire_time` a význam
atributu `duration` je nejednoznačný. Karta proto drží poslední zbývající čas
z doby, kdy časovač ještě běžel, a bar zmrazí (ztlumí a zobrazí ikonu pauzy).
Když se karta načte ve chvíli, kdy je časovač už pozastavený, ukáže místo toho
`duration` — to může být plná délka místo zbytku.

## Vývoj

`dev/preview.html` je harness, který kartu i editor spustí mimo Home Assistant
nad podvrženými daty — stubuje `ha-card`, `ha-icon`, `ha-form` a
`ha-icon-picker` a loguje volání služeb i události `config-changed`.

```bash
npx http-server . -p 5201 -c-1
```

Pak otevři `http://localhost:5201/dev/preview.html`.
