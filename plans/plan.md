# План правок лендинга EssKey Music

## Правка 1: Пустая плашка 4-го видео в Latest Videos

**Проблема:** В секции Latest Videos 4-я карточка отображается пустой. В [`script.js`](script.js:129) фильтруются только `"Private video"` и `"Deleted video"`, но видео с отсутствующим/недоступным thumbnail или со статусом `"none"` при отсутствии реального контента проходят фильтр.

**Решение:**
- В [`script.js`](script.js:129) в функции `fetchViaYouTubeAPI()` усилить фильтрацию:
  - Проверять что `thumbnail` существует и это валидный URL
  - Проверять что `title` не пустой и не равен дефолтным значениям YouTube
  - Добавить проверку на `liveBroadcastContent === "none"` для видео, у которых нет ни превью, ни описания
- В функции [`appendMediaCard`](script.js:276) добавить fallback: если thumbnail не загрузился, показать заглушку с иконкой play

**Файлы:** `script.js`

---

## Правка 2: Клик по EssKey Music → возврат наверх

**Проблема:** В [`index.html`](index.html:135) `.brand-wrap` — это `<div>` без интерактивности. Клик по логотипу/названию не делает ничего.

**Решение:**
- Обернуть содержимое `.brand-wrap` в `<a href="#" class="brand-link">` 
- Добавить обработчик в `script.js`: при клике `event.preventDefault()` + `window.scrollTo({ top: 0, behavior: 'smooth' })`
- Либо проще: сделать `.brand-wrap` ссылкой `<a href="#top">` и добавить `id="top"` к `<body>`

**Файлы:** `index.html`, `script.js`

---

## Правка 3: Flyout Videos — только 5 видео + стрелка развёртки

**Проблема:** В [`script.js`](script.js:327) `appendFlyoutLink` добавляет ВСЕ видео в flyout без ограничений.

**Решение:**
- Добавить константу `FLYOUT_VISIBLE_COUNT = 5` в CONFIG
- В функции [`renderVideos`](script.js:319) при заполнении `$videoFlyout`:
  - Первые 5 ссылок показывать сразу
  - Остальные обернуть в контейнер `.flyout-hidden` с `display: none`
  - Внизу flyout добавить кнопку-стрелку `.flyout-expand-btn` с иконкой ▼
  - При клике на стрелку: показать скрытые ссылки, сменить иконку на ▲, при повторном клике — скрыть
- Аналогично для [`renderStreams`](script.js:357) и `$liveFlyout`
- Стили в `styles.css` для `.flyout-hidden`, `.flyout-expand-btn`

**Файлы:** `script.js`, `styles.css`

---

## Правка 4: Заменить title

**Проблема:** В [`index.html`](index.html:6) текущий title: `"EssKeyMusic — Ambient, Lo-Fi & Downtempo for Deep Focus"`

**Решение:**
- Заменить на `"EssKey Music | Focus Sound Design"`
- Также обновить OG title в [`index.html`](index.html:12): `"EssKey Music | Focus Sound Design"`

**Файлы:** `index.html`

---

## Правка 5: Мобильная версия Latest Videos

**Проблема:** На экранах ≤640px [`styles.css`](styles.css:817) устанавливает `grid-template-columns: 1fr` — одна колонка, карточки на весь экран. Это не удобно — слишком крупные карточки, много скролла.

**Решение:**
- На мобильных (≤640px) сделать 2 колонки: `grid-template-columns: repeat(2, 1fr)`
- Уменьшить gap: `gap: 8px`
- Уменьшить шрифт заголовка в карточках
- Скрыть кнопку Watch в карточках на мобильных — клик по всей карточке уже открывает видео
- Уменьшить padding в `.media-card-body`
- Как альтернатива: горизонтальный скролл с snap-точками — но 2 колонки проще и привычнее

**Файлы:** `styles.css`

---

## Правка 6: Мобильная версия Live Streams

**Проблема:** Та же что и в правке 5 — `.media-grid` используется для обоих секций.

**Решение:**
- Те же стили применятся автоматически, т.к. оба раздела используют класс `.media-grid`
- Дополнительных изменений не требуется — правка 5 покроет оба раздела

**Файлы:** `styles.css` (уже покрыто правкой 5)

---

## Правка 7: Hamburger-меню на мобильных

**Проблема:** На экранах ≤920px [`styles.css`](styles.css:739) полностью скрывает `.nav { display: none }`. Пользователь на мобильном не может перейти к видео или трансляциям из меню.

**Решение:**
- Добавить hamburger-кнопку в topbar:
  - В [`index.html`](index.html:134) добавить `<button class="hamburger" aria-label="Menu">` внутри `.topbar` после `.brand-wrap`
  - Иконка: три полоски, при открытии трансформируется в крестик
- Добавить overlay-меню:
  - В [`index.html`](index.html:134) добавить `<div class="mobile-menu">` с ссылками: Videos, Live, Contact Us, Subscribe
  - Меню может содержать те же flyout-списки что и десктопная навигация
- В `styles.css`:
  - `.hamburger { display: none }` по умолчанию
  - На `@media (max-width: 920px)`: показать hamburger, скрыть `.nav`
  - `.mobile-menu` — полноэкранный overlay с `backdrop-filter: blur`
  - Полупрозрачный тёмный фон, анимация появления сверху или сбоку
  - Ссылки стилизовать крупными кнопками для удобного тапа
- В `script.js`:
  - Обработчик клика на `.hamburger` — toggle класса `.is-open` на `.mobile-menu` и `.hamburger`
  - Закрытие при клике на ссылку или вне меню
  - Блокировка скролла body при открытом меню (`body.is-menu-open { overflow: hidden }`)

**Файлы:** `index.html`, `styles.css`, `script.js`

---

## Сводка изменений по файлам

| Файл | Правки |
|------|--------|
| `index.html` | #2 (brand-link), #4 (title), #7 (hamburger + mobile-menu) |
| `script.js` | #1 (фильтрация), #2 (scroll handler), #3 (flyout expand), #7 (hamburger toggle) |
| `styles.css` | #3 (flyout styles), #5/#6 (mobile grid), #7 (hamburger + mobile-menu) |
