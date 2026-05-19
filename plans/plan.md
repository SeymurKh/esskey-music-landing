# План исправлений: Latest Videos + оптимизация

## Проблемы

1. **Стримы утекают в Latest Videos** — 3-е видео показывает «прямая трансляция пользователь EssKey»
2. **Два API-запроса** — `playlistItems` + `videos.list` = двойной расход квоты + медленная загрузка
3. **RSS-фоллбэк ненадёжен** — не содержит `liveBroadcastContent`, стримы не фильтруются
4. **Захардкоженные STREAMS** — не нужны, стримы должны приходить из API
5. **Надпись «Ambient & Lo-Fi»** в hero — нужно убрать
6. **Медленная загрузка** — лишние запросы, лишний код, ненужный кэш
7. **API-ключ в клиенте** — ограничить по HTTP-рефереру в Google Cloud Console

---

## Архитектура решения

```mermaid
flowchart TD
    A[script.js: один fetch] -->|playlistItems| B[YouTube Data API v3]
    B -->|JSON со всеми видео и стримами| A
    A -->|Разделение по liveBroadcastContent + паттерны| C{Тип контента}
    C -->|liveBroadcastContent = none + не стрим| D[Массив videos]
    C -->|liveBroadcastContent = live/upcoming ИЛИ паттерн стрима| E[Массив streams]
    D -->|Рендеринг| F[Секция Latest Videos]
    E -->|Рендеринг| G[Секция Streams]
```

### Ключевые принципы

- **Один API-запрос** — только `playlistItems`, второй запрос к `videos.list` удалён
- **Без кэша** — каждый визит = свежие данные, нет localStorage кэша
- **Без RSS** — удалён полностью
- **Без хардкода STREAMS** — стримы определяются из API по `liveBroadcastContent` + паттернам заголовков
- **API-ключ в клиенте** — с ограничением по HTTP-рефереру в Google Cloud Console

---

## Пошаговый план изменений

### Шаг 1: Упростить `script.js`

#### 1a. Удалить RSS-фоллбэк и связанный код

Удалить:
- `CONFIG.RSS_URL`, `CONFIG.RSS_TIMEOUT`, `CONFIG.API_TIMEOUT`
- Массив `RSS_SOURCES`
- Функции: `tryRSSSource()`, `fetchViaRSS()`, `parseYouTubeXml()`, `extractVideoId()`

#### 1b. Удалить кэширование

Удалить:
- `CONFIG.CACHE_TTL`, `CONFIG.CACHE_KEY`
- Функции: `cacheGet()`, `cacheSet()`
- Все обращения к `cacheGet` / `cacheSet` / `localStorage` внутри `fetchYouTubeVideos()`
- Блок stale cache в конце `fetchYouTubeVideos()`

#### 1c. Удалить хардкод стримов

Удалить:
- Массив `STREAMS`
- Множество `STREAM_IDS`
- Вызов `renderStreams(STREAMS)` в Bootstrap

#### 1d. Упростить `fetchViaYouTubeAPI()`

- Удалить второй запрос к `videos.list` — он не нужен
- Один запрос: `playlistItems` с `maxResults=50`
- Маппинг в объекты с полем `liveBroadcastContent` из `snippet`

#### 1e. Переписать `fetchYouTubeVideos()`

Новая логика:
```
1. Вызвать fetchViaYouTubeAPI() — один запрос к playlistItems
2. Разделить результат на два массива:
   - streams: liveBroadcastContent === 'live' | 'upcoming' ИЛИ заголовок начинается с паттернов стримов
   - videos: всё остальное
3. Отсортировать оба по дате — новые первыми
4. Вернуть { videos, streams }
```

Паттерны стримов для заголовков:
```js
const STREAM_TITLE_PATTERNS = [
  "RADIO 24/7", "24/7 RADIO", "LIVE RADIO", "24/7 STREAM"
];
```

#### 1f. Обновить Bootstrap

```js
// Было:
renderStreams(STREAMS);
renderSkeletons($videoList, CONFIG.VISIBLE_VIDEO_COUNT);

// Стало:
renderSkeletons($videoList, CONFIG.VISIBLE_VIDEO_COUNT);
renderSkeletons($liveList, 2);

const dataReady = fetchYouTubeVideos()
  .then(({ videos, streams }) => {
    renderVideos(videos);
    renderStreams(streams);
    latestVideos = videos;
    return videos;
  })
  .catch((err) => {
    clearSkeletons($videoList);
    clearSkeletons($liveList);
    renderErrorState($videoList, err.message);
    return [];
  });
```

#### 1g. Обновить CONFIG

Итоговый CONFIG:
```js
const CONFIG = {
  CHANNEL_ID: "UCa9kWM8BbmFi5OpXbjyqk9w",
  YOUTUBE_API_KEY: "AIzaSyBF1CMRH89borC-ibFL3LXX_7XofUJLEuY",
  VISIBLE_VIDEO_COUNT: 6,
  MAX_VIDEOS: 50,
  PRELOADER_MAX_TIME: 8000,
  PARALLAX_FACTOR: 0.03,
};
```

#### 1h. Обновить `renderStreams()`

- Принимает массив стримов из API
- Рендерит карточки в `$liveList`
- Рендерит ссылки в `$liveFlyout`
- Если стримов нет — показать сообщение «No active streams right now»

### Шаг 2: Обновить `index.html`

- Убрать «Ambient & Lo-Fi» из hero заголовка
- Переключить `styles.min.css` → `styles.css` и `script.min.js` → `script.js`
- Добавить `<link rel="preload">` для шрифтов Google Fonts

Было:
```html
<h1><span class="h1-brand">EssKey Music</span> <span class="h1-sub">— Ambient & Lo-Fi</span></h1>
```

Стало:
```html
<h1><span class="h1-brand">EssKey Music</span></h1>
```

### Шаг 3: Обновить `sw.js`

- Обновить `CACHE_NAME` на `esskey-v3`
- Убрать кэширование API-ответов — уже исключено через проверку на `googleapis.com`

### Шаг 4: Создать `vercel.json`

Заголовки кэширования для статики:
```json
{
  "headers": [
    {
      "source": "/(.*)\\.(css|js|webp|jpg)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600" }]
    }
  ]
}
```

### Шаг 5: Создать `.env.example`

Для документации — чтобы разработчики знали, какие переменные нужны:
```
# YouTube Data API v3 Key
# Ограничить в Google Cloud Console по HTTP-рефереру:
# https://esskey-music.vercel.app/*
YOUTUBE_API_KEY=your_key_here
```

---

## Структура файлов после изменений

```
landing/
├── index.html             ← ИЗМЕНЁН: убран Ambient & Lo-Fi, ссылки на CSS/JS, preload шрифтов
├── script.js              ← ИЗМЕНЁН: удалён RSS, кэш, хардкод STREAMS, второй API-запрос; новый fetchYouTubeVideos с разделением
├── styles.css             ← БЕЗ ИЗМЕНЕНИЙ
├── sw.js                  ← ИЗМЕНЁН: обновлён CACHE_NAME
├── vercel.json            ← НОВЫЙ: заголовки кэширования статики
├── .env.example           ← НОВЫЙ: шаблон для документации
├── manifest.json          ← БЕЗ ИЗМЕНЕНИЙ
└── plans/
    └── plan.md            ← Этот файл
```

---

## Безопасность API-ключа

На статическом сайте невозможно полностью скрыть API-ключ. Митигация:

1. **Ограничение по HTTP-рефереру** в Google Cloud Console:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Edit key → Application restrictions: HTTP referrers
   - Add: `https://esskey-music.vercel.app/*`
   - Это запретит использование ключа с других доменов

2. **Квота YouTube API** — по умолчанию 10 000 единиц/день. Один запрос `playlistItems` = 1 единица. Даже при 1000 посетителей/день = 1000 единиц — далеко от лимита.

---

## Порядок реализации

1. Обновить `script.js` — удалить RSS, кэш, хардкод STREAMS, второй API-запрос; переписать fetchYouTubeVideos с разделением videos/streams
2. Обновить `index.html` — убрать Ambient & Lo-Fi, переключить ссылки, добавить preload
3. Обновить `sw.js` — обновить CACHE_NAME
4. Создать `vercel.json` — заголовки кэширования
5. Создать `.env.example` — для документации
6. Протестировать локально
7. Задеплоить и проверить на продакшене
8. Ограничить API-ключ в Google Cloud Console по HTTP-рефереру
