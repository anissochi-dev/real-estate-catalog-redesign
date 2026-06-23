# 🗺️ Карта структуры публичных страниц

Навигатор по декомпозированным публичным страницам проекта.

## Единый принцип

Во всех страницах: **главный файл = логика и состояние**, дочерние компоненты = **только вёрстка**. Данные и колбэки передаются пропсами.

**Где что искать:**
- Поправить **бизнес-логику** (фильтры, загрузка, SEO-мета) → главный файл страницы.
- Поправить **внешний вид блока** → соответствующий компонент в папке.
- Поменять **тексты/данные категорий** → `src/pages/category/categoryMeta.ts`.
- Поменять **заголовки каталога** → `src/pages/catalog/catalogH1.ts`.

---

## 🏠 Главная — `/`

**Логика:** `src/pages/HomePage.tsx`
**Компоненты:** `src/pages/home/`

| Файл | Назначение |
|---|---|
| `HomeHero.tsx` | Hero + ИИ-поиск |
| `HomeStatsBar.tsx` | Панель статистики |
| `HomeNewListings.tsx` | Секция «Новые объекты» |
| `HomeNewsSection.tsx` | Блок новостей |
| `HomeFaqSection.tsx` | Частые вопросы |

## 📂 Каталог — `/catalog`

**Логика:** `src/pages/CatalogPage.tsx`
**Компоненты:** `src/pages/catalog/`

| Файл | Назначение |
|---|---|
| `catalogH1.ts` | SEO-заголовки + `buildCatalogH1` |
| `CatalogHero.tsx` | Hero с ИИ-поиском |
| `CatalogFilters.tsx` | Основные фильтры |
| `CatalogMapSection.tsx` | Карта + боковая панель / фуллскрин |
| `CatalogMap.tsx` | Сама карта |
| `CatalogResults.tsx` | Список результатов |

## 🏷️ Категория — `/catalog/:type`

**Логика:** `src/pages/CategoryPage.tsx`
**Компоненты:** `src/pages/category/`

| Файл | Назначение |
|---|---|
| `categoryMeta.ts` | Данные категорий (h1–h5, описания, иконки) |
| `CategoryHero.tsx` | Шапка + фичи + ИИ-поиск |
| `CategoryToolbar.tsx` | Счётчик + панель фильтров |
| `CategorySeoBlock.tsx` | SEO-текст + перелинковка |

## 📍 Район / Округ — `/district/:district`

**Логика:** `src/pages/DistrictPage.tsx`
**Компоненты:** `src/pages/district/`

| Файл | Назначение |
|---|---|
| `DistrictHero.tsx` | Шапка со счётчиком |
| `DistrictStatsBar.tsx` | Статистика + кнопки |
| `DistrictSeoBlock.tsx` | SEO-текст (AI / описание) |

## 🏢 Объект — `/object/:slug`

**Логика:** `src/pages/PropertyPage.tsx`
**Компоненты:** `src/components/property/`

| Файл | Назначение |
|---|---|
| `PropertyTopBar.tsx` | Крошки + «Поделиться» + «Назад» |
| `PropertyAiSearchBar.tsx` | ИИ-подбор похожих |
| `PropertyMediaGallery.tsx` | Галерея фото/видео |
| `PropertyMainContent.tsx` | Контент + форма |
| `PropertySidebar.tsx` | Цена, агенты, форма |
| `PropertyFaqSection.tsx` | Блок FAQ |

---

## Общие модули

| Файл | Назначение |
|---|---|
| `src/lib/categories.ts` | Единый источник категорий: список, названия, URL |
| `src/lib/districts.ts` | Группировка районов по округам, фильтрация |
| `src/components/DistrictOptions.tsx` | Опции `<select>` районов с иерархией округов |
