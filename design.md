# Teo — Design

Telegram Mini App inspired by the supplied reference. Warm minimal marketplace, orange accent, editorial desktop layout and compact mobile layout.

Palette: cream #faf9f6, orange #ff681f, ink #242620, muted #85877e, olive #697452, butter #f4edcc. Manrope Cyrillic body and Poppins wordmark. Thin dividers, 16–24px radii, product photography, generous whitespace. Desktop: top navigation, two-column campaign hero, four-column product grid. Mobile: two-column grid and fixed bottom navigation. Catalog, favorites, fullscreen product/photos, cart, pickup selection, purchase requests, orders, profile, photo search and protected moderator UI. Shared data lives in the database; cart/favorites stay locally scoped by Telegram account. Payment happens later and is never presented as completed.

## Current flows

- Open bot → voluntarily share own contact → open Mini App → purchase/photo request → notification to buyer and moderators.
- Owners alone can grant moderator access and view the full users list. Buyer contacts remain visible to authorized moderators on the relevant orders/requests.
- New product starts with clothing/shoes yes/no; clothing type determines category and available size controls.
- Brand splash: teo logo, product photography, «С teo — заказывать из Китая просто».
- Search screen shows the last five searches. Sale badges carry a percentage.
- Fullscreen photo supports download and native photo sharing when the device supports it; product-link fallback otherwise.
- Keep contact-consent and payment-later language explicit. No fictitious paid state or automatic shipment transitions.
- Bot persistent keyboard: «Старт», «Поддержка»; contact button is added only for registration. Support links: @myinik and @sanekhelper.
- Photo triage: atomically claim → show assigned moderator → open buyer chat with draft → manually confirm «Ответ отправлен». No claim that the bot can observe a moderator's personal messages.
- Mobile/touch form controls use at least 16px to prevent iOS focus zoom; pinch zoom remains enabled.

## Manual commerce — approved iteration

- Checkout and profile share a searchable city/region directory and manual CDEK pickup address. Clear stale addresses when changing city; local storage is account-scoped. Directory explicitly does not claim CDEK coverage.
- Buyers see only the RUB price (no yuan figure — the Taobao price is a purchase cost, not a buyer price).
- Owner settings are persisted server-side. Formula: price ₽ = round(Taobao ¥ × rate) + delivery to the supplier ₽ + teo service ₽, where delivery/service are fixed ruble amounts per item type (футболка 400/400, худи/кофта 700/600, штаны 700/600, куртка/пуховик 1200/800, кроссовки/обувь 1200/800, другие товары 700/600 — delivery taken at the upper bound of the owner's range). СДЭК is always separate. Settings show a per-type table of the two ruble amounts. Issued invoices and orders retain their price/requisite snapshots.
- Product editor: once ¥ is entered the RUB field is read-only and a soft card «Расчёт цены» shows the type label and the line «672 ¥ × 14 ₽ = 9 408 ₽ + доставка до поставщика 400 ₽ + сервис teo 400 ₽ = 10 208 ₽»; it updates live when category/type change.
- Warm cream payment panels, selectable/copyable requisites, receipt image preview, distinct pending vs approved labels. Shipping disclosure uses a light orange surface and left orange rule; never disguise separate shipping as included.
- Goods payment is first. «Я оплатил» only reports the transfer; only owner confirms actual receipt, with a second confirmation in Telegram. The exact requested post-payment status is «В пути к поставщику».
- Moderator confirms warehouse arrival, manually calculates shipping from Vladivostok, issues a separate invoice, waits for separate owner approval, enters CDEK tracking, then manually marks sent and delivered.
- Compact vertical timestamped timeline avoids a ten-column progress bar on mobile. All payment actions are sequential, server-authorized, and disabled while pending. Atomic CAS + outbox batch protects order transitions and notifications.
- Existing orders retain their old statuses. New process does not silently reinterpret legacy payments.

## Home / friendly order updates — approved iteration
- Compact buyer-scoped order panel directly below the hero: prioritise outstanding invoices, then active orders; show latest completed order only if none active. Empty state invites a first order. Pending verification never asks for a second transfer.
- Two cream/olive informational banners: photo-search opens the existing request form; ordering guide expands inline and explains separate goods and CDEK shipping payments.
- Larger 16px order labels with a distinct emoji per stage. Internal stored statuses and payment authorisation stay unchanged; customer copy is friendly and accurate about shipping prerequisites.
- Product editor accepts full Taobao/Tmall item URLs or numeric IDs, normalised server-side. Short share links without an item ID require the full item URL.
- Moderators publish directly, without owner approval. When finance settings are absent, clearly offer manual RUB pricing with empty CNY; do not invent rates or allow moderators to edit owner settings.

## Brand & Colors

## Catalog / moderation refinement
- Compact profile identity card; larger actionable profile links. Five bottom tabs including «Мои заказы»; moderation tabs minimum 44px touch targets.
- Product editor accepts up to eight photos, multiple file selection, cover selection and removal. Product detail and fullscreen support swipe and explicit previous/next controls.
- Cart button becomes a cart navigation button after adding the selected variant.
- Products are reversibly hidden, not deleted; hidden products remain editable/restorable. User requested all current products except Mushroom lamp hidden.
- Manual «Заказ не оплачен. Отменить» after 30 minutes from goods invoice, allowed while waiting or pending verification, never once owner approved. Confirmation requires checking actual receipt; cancelled payment cannot be reported or approved later. Buyer notified; history preserved. Existing invoices derive issued time from their matching history stage.

One token set, consumed per platform:

- **Web & desktop**: CSS variables in `packages/web/src/web/styles.css` (desktop loads the web UI).
- **Mobile**: `Colors.light` / `Colors.dark` in `packages/mobile/constants/theme.ts`, read via `useColors()`; `userInterfaceStyle: "automatic"` follows the system light/dark setting.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| primary | #1F1F1F | #E5E5E5 | Buttons, active tab, accents |
| background | #FFFFFF | #0A0A0A | Page/screen background |
| card | #FFFFFF | #1A1A1A | Cards, surfaces |
| foreground | #171717 | #FAFAFA | Primary text |
| mutedForeground | #737373 | #A3A3A3 | Secondary text |
| border | #E5E5E5 | #262626 | Hairlines |
| destructive | #DC2626 | #EF4444 | Delete / errors |

## Typography

Name the display + body pairing here. Web: set font families in `styles.css` (self-hosted files go in `packages/web/public/fonts/`). Mobile: system font by default; load custom fonts with `useFonts` from `expo-font` and reference them via `Fonts` in `constants/theme.ts`.

## Pages & Screens

List each page/screen, its route file, and what it shows. Example:

- **Web — Home** (`packages/web/src/web/pages/index.tsx`) — what the user sees first.
- **Mobile — Home** (`packages/mobile/app/(tabs)/index.tsx`) — main tab.
- Add web pages under `src/web/pages/` (+ route in `app.tsx`); mobile tabs under `app/(tabs)/`, stack/modal screens under `app/`.

## Key User Flows

1. Describe the primary flow end to end (open → action → result).
2. ...

## Architecture

- **API**: typed oRPC client (`lib/api.ts` in each package) → the backend in `@template/web`. Query/mutation hooks live in `queries/` (one file per feature); pages/screens call them with `@tanstack/react-query`.
- **State/sync**: TanStack Query with optimistic updates for instant-feel interactions.
- **Auth / payments / uploads**: see `skills/app/references/` when those features are needed.

## Banner correction
- Main campaign and both informational banners form one horizontally swipeable, snap-aligned carousel, one slide per viewport, with working dots and arrows. Order status remains below, outside carousel. No vertical stack of informational banners.
- Product editor draft mode: «Скрыт из каталога» toggle. Hidden drafts save with only name + price (missing Taobao ID, photo or sizes allowed); visible products must be complete. Missing items render as an orange-bordered checklist above the save button — never rely on native browser validation bubbles (Telegram WebView hides them). Sizes are never pre-selected: the moderator ticks the seller's full size grid; per-order availability is checked before payment. Shoes include half sizes 35–46; a custom size field covers seller-specific labels.
- Availability check (order step between «Заявка принята» and the goods invoice): product cards show the seller's full size grid with a small muted note «Наличие размера подтвердим до оплаты». Moderator reviews each order line: «Есть» / «Другой размер» / «Убрать» plus optional new unit price and a comment. All lines available → invoice directly. Any change → buyer sees an orange-bordered «Изменения в заказе» card (old → new, struck-through old values, new total, countdown to the 3-hour deadline) with primary «Согласен, выставить счёт» and secondary «Отменить заказ». Expired/declined proposals cancel the order.
- Arrival photos: at «Заказ у меня» the moderator may attach up to 8 photos (compressed JPEG). Buyer sees them as a horizontal thumbnail strip in the order card; tap opens full size. Also sent to the buyer in Telegram.
- Info tips instead of long paragraphs: buyer-facing explanations (shipping paid separately, how to pay, phone sharing, CDEK pickup address, proposal deadline rules, checkout notes) collapse into an `InfoTip` row — a large 32px orange-outlined circle with a serif «i» plus a one-line summary of the key fact. Tapping the row expands the full text inline in a soft cream panel (no floating popovers — they clip in Telegram WebView). Critical facts (amount, deadline, «деньги не списываются») stay visible in the summary line. Home order status message is clamped to 2 lines; full text is in the order.
- Home order journey panel («Ваш заказ» under the carousel): the whole card is tinted by stage so progress is readable at a glance. Tones: no orders — soft sage neutral; request/availability/goods payment — butter #f4edcc; «В пути к поставщику» — high-contrast ink #242620 with cream text and orange accents; at supplier (arrived → shipping paid) — olive #697452 with white text; «Отправлен к вам» (СДЭК) — solid orange #ff681f with white text; delivered — light success green with olive check; cancelled — pale red with dark-red text and «Причина: …» line. Inside: small framed (56px, 12px radius, 2px light border) photo of the first item + its name («и ещё N»), the status label, a one-sentence stage description, and a 6-segment progress track (Заявка · Оплата · В пути · Поставщик · СДЭК · Получен) with done/current/upcoming segments; hidden when cancelled. When the buyer must act (pay/answer), the CTA becomes a filled orange pill regardless of tone.
- ФИО получателя (required for СДЭК): Profile shows a `FullNameCard`. Missing → orange-bordered required card «ФИО получателя для СДЭК» with the warning that without фамилия/имя/отчество СДЭК не примет посылку, three large inputs (Фамилия, Имя, Отчество) and a «Нет отчества (по паспорту)» checkbox, primary «Сохранить ФИО». Filled → compact card with the full name and «Изменить». Checkout shows the same card when missing and keeps «Оформить заявку» disabled until saved. Moderators see a «ФИО для СДЭК» block in every order (red when absent on old orders).
- Moderator entry: owner/moderators get a full-width dark (#242620) «Панель модератора» button with an orange icon at the very top of Профиль — no scrolling; it is not repeated in the profile menu.
- Moderation «Товары»: big orange «Добавить товар», search, segmented filter Все / В каталоге / Скрытые with counts. Each product is a roomy card: 92px rounded thumbnail, name (2 lines), price, category/sizes chips, a status pill (В каталоге / Скрыт), and two 50px full-width buttons «Изменить» and «Скрыть товар»/«Вернуть в каталог». Tapping the card body opens the editor.
- Arrival photos picker: a large dashed drop-zone with a camera icon «Сфотографируйте прибывший товар» and a counter N/8, thumbnails below with remove buttons.
- Bot (not UI): owner `/broadcast` (text, photo with caption, or album → preview → «Отправить N»), owner/moderators `/newproduct` step-by-step wizard with inline buttons (category → type → name → Taobao price ¥ (or «… ₽» for a manual price; summary shows the breakdown) → Taobao → colour → size toggles → photos → description → summary with «Опубликовать» / «Сохранить черновик»), `/cancel` ends any conversation.
- Taobao field: one input «Ссылка на товар Taobao / Tmall» (no ID wording). Accepts a full link, the whole «Поделиться» text or a short e.tb.cn / m.tb.cn link (opened server-side); the field is normalised to `https://item.taobao.com/item.htm?id=…` and a green «✓ Ссылка на товар распознана» line (or an orange error: shop link / expired link) sits under it. Stored value stays the item id.

