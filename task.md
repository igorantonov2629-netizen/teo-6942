# Clothing sourcing import — 2026-10-18
- User approved first 13 only, rate 14 RUB/CNY and fixed delivery/service tiers.
- Imported 13 hidden drafts, verified database readback and preservation of 9 existing rows. No new public products; current SKU availability remains unverified.
- Stored estimate/source provenance in product `sourcing`; no `taobaoYuan` live repricing, no invented sizes or ratings.
- Direct numeric item IDs verified for 10 listings; 3 draft links remain sourcing pages. Photos downloaded from browser-discovered seller URLs; black AF1 photo omitted because seller cover is blue.
- Owner rate set to 14; existing bank details and percentage fields preserved. Fixed fees are in per-draft estimates, not misrepresented as percentages.
- Price table: clothing-prices.md. Source evidence: sourcing-live.json. Backup: clothing-import-before.json.
- Build passed; public catalog POST confirmed only existing lamp. Needs SKU/condition verification before unhiding. New assets require platform republish.

 # Teo — Telegram Mini App

 ## Выполнено
 - [x] Каталог, фильтры, избранное, корзина, выбор ПВЗ, распродажа.
 - [x] Общая Turso/Drizzle база товаров, пользователей, заказов, фото-запросов, отзывов и уведомлений.
 - [x] Telegram HMAC-аутентификация, серверные роли, владелец привязан к проверенному числовому ID.
 - [x] Бот: /start, свой контакт с согласием, /id, /deletephone, команды владельца /newmoder, /delmoder, /moderators.
 - [x] Заявки без списания денег; цена рассчитывается сервером, ключи повторной отправки.
 - [x] Заказы и фото направляются покупателю и модераторам через очередь. Статусы отправляются в личный чат с ботом.
 - [x] Контакты покупателя видны в заказах и фото-запросах. Полный список пользователей доступен только владельцу, включая проверку API.
 - [x] История пяти поисков, % скидки, фирменная заставка, полноэкранные фото, скачать/поделиться.
 - [x] Мастер одежды/обуви и размеров, безопасные URL изображений, лимиты фото.
 - [x] Компоненты вынесены из страницы; лимит 2000 строк соблюдён.
 - [x] Стабилизировано локальное хранение корзины по аккаунтам; Telegram ready/expand.
 - [x] Lint/build прошли. Интеграционный тест: подпись, изоляция покупателей, контакт, повторная заявка, цена, отсутствие оплаты, фото, конкурентный статус, доступы.
 - [x] Chrome/Playwright: мобильный каталог, история 5, JPG download, отсутствие overflow/JS ошибок, скрытая панель гостю, список владельца, мастер размеров, сохранение guest-корзины.

 ## Telegram подключён
 - Предыдущая версия опубликована: webhook включён, HTTP 200 с секретом, очередь обновлений Telegram опустела без ошибок.
 - Проверка новых заказов/фото в интеграционном тесте использует mock, а не реальные отправки.

 ## Итерация: меню и обработка фото
 - [x] Постоянные кнопки «Старт» и «Поддержка», контакты @myinik и @sanekhelper, команда /support.
 - [x] На touch-устройствах поля не меньше 16px: устранена причина iOS focus zoom, ручное масштабирование сохранено.
 - [x] «Взял в работу» атомарно закрепляет запрос за одним модератором; имя показывается всем, чужие изменения блокируются.
 - [x] Покупатель → Telegram deep link с готовым текстом. Без username — ссылка по добровольно предоставленному номеру, зависит от настроек приватности Telegram.
 - [x] «Ответ отправлен» — ручная отметка, повторное действие блокируется. Бот не отправляет черновик и не видит личную отправку.
 - [x] Кнопки карточек синхронизируются между модераторами; Telegram message_id сохранён в outbox. Миграция применена.
 - [x] API тест: гонка двух модераторов, чужой доступ, точный черновик, дубль ответа, меню поддержки, callback acknowledgement.
 - [x] Chrome mobile: поиск 16px, overflow отсутствует, ошибок JS нет.
 - [x] Фото-итерация опубликована; webhook проверен, callback_query включён.

 ## Итерация: двухэтапная ручная оплата
 - [x] Город из справочника, адрес ПВЗ СДЭК вручную; профиль и checkout используют одни данные. Локальный адрес разделён по аккаунтам.
 - [x] Справочник из 1117 городов с проверенной лицензией CC BY 4.0; атрибуция в UI и THIRD_PARTY_NOTICES.md. Это не список ПВЗ или покрытие СДЭК.
 - [x] Подтверждение наличия → счёт за товар → «Я оплатил» + необязательное фото чека → проверка владельцем в боте, с двумя кнопками подтверждения. В приложении есть резервное owner-only подтверждение.
 - [x] Только после поступления денег: «В пути к поставщику» → «Заказ у меня» → ручной счёт за доставку из Владивостока → отдельная проверка владельцем → трек СДЭК → отправлен → доставлен.
 - [x] Все 10 этапов создают уведомления покупателю. Статус и outbox меняются атомарным batch; уникальная ревизия и CAS предотвращают дубли при гонках.
 - [x] Нельзя пропускать этапы, подтвердить оплату модератором, отправить неоплаченную доставку или отгрузить без трека.
 - [x] Раскрытие отдельной доставки до оплаты. Реквизиты, RUB/CNY и суммы заказов сохраняются снимками. Taobao-ссылки модератору сохранены.
 - [x] Курс и оба процента редактирует только владелец, исходная Taobao CNY — в товаре. Все настройки изначально пустые, текущие RUB цены сохранены.
 - [x] `bun --env-file=.env scripts/test-isolated.ts`: прежние Telegram сценарии и полная новая цепочка проверены в отдельной SQLite БД, Telegram замокан. Проверены гонки, изоляция, CNY/округление, неизменность снимков, откат при отказе outbox.
 - [x] `python scripts/test-commerce-browser.py`: Chrome 390px, поля 16px, профиль/город, checkout/prefill/доставка, оплата и owner UI, пустые настройки; нет overflow или JS ошибок. Все записи замоканы.
 - [x] Lint/build пройдены; предупреждение Vite: основной bundle больше 500 kB, не блокирует сборку.
 - [x] Опубликована; webhook 200, callback_query включён, pending_update_count 0. Реальное поступление денег не тестировалось.
 - [ ] Владелец заполняет реквизиты, курс и оба процента; реальные закупочные цены Taobao предоставит пользователь.

 ## Известные ограничения оплаты
 - Нет интеграции банка, платёжного провайдера или API СДЭК. «Я оплатил» — заявление покупателя, не факт платежа.
 - Чек только изображение до 8 МБ до сжатия, не PDF. Чек не является доказательством поступления денег.
 - Возвраты не добавлялись; перевод по уже отменённому счёту разбирается через поддержку.
 - Старые статусы не мигрируются принудительно, суммы старых заказов не меняются.

 ## Итерация: отмена, фотографии и навигация
 - [x] По явному запросу пользователя 8 товаров скрыты в общей БД, оставлена только «Настольная лампа Mushroom» id=1. Published catalog проверен: только id=1. Другие товары обратимо скрыты, не уничтожены.
 - [x] Модератор может вручную отменить счёт товара через 30 минут, в waiting и pending после «Я оплатил». Подтверждённые владельцем деньги блокируют отмену. Доставка не отменяется этим действием.
 - [x] issuedAt сохранён в новых счетах; существующие счета используют время этапа истории. Статус отмены и уведомление сохраняются атомарно; старые кнопки подтверждения/повторные отчёты блокируются.
 - [x] До восьми фотографий товара: выбор нескольких файлов, сжатие, выбор обложки, удаление отдельного фото. Свайп и предыдущая/следующая в карточке и fullscreen.
 - [x] Пять нижних вкладок с «Мои заказы». Компактная карточка профиля, крупнее ссылки и модераторские вкладки (44px+). Кнопка добавленного товара ведёт в корзину, в карточке учитывает выбранный вариант.
 - [x] API isolated tests: отмена раньше/позже 30 минут, waiting/pending, запрет buyer и approved, гонка cancel/approve, одно уведомление, multi-photo и возврат скрытого товара.
 - [x] Chrome mobile: загрузка нескольких фото, обложка/удаление/сохранение, листание фото, пять вкладок, переход в корзину, отмена pending UI, размеры модераторских вкладок; нет overflow и JS ошибок. Записи и Telegram замоканы.
 - [x] Lint/build пройдены, файл страницы 1797 строк.
 - [ ] Нужна повторная публикация нового кода (скрытие каталога уже применено к общей БД).

 ## Не входит в текущую итерацию
 - Платёжный провайдер и реальные расчёты СДЭК.
 - Политика возвратов/персональных данных, юридические реквизиты.
 - Отдельный фоновый worker уведомлений: при ошибках сейчас повтор через панель модератора.
 - Фото хранятся с лимитом в БД, не в отдельном файловом хранилище.
 - Сохранение в галерею/нативная отправка фото на реальном телефоне требует проверки устройства.

 ## Итерация: главная, статусы и ссылки Taobao
 - [x] Под главным баннером — статус собственного заказа; неоплаченные счета приоритетны, явная сумма и переход к оплате. Pending не просит повторного перевода. Пустой/завершённый/отменённый заказ и изоляция owner/admin проверены.
 - [x] Два баннера: поиск по фото открывает форму; инструкция раскрывает цепочку и отдельную оплату доставки СДЭК.
 - [x] Крупные 16px статусы и разные emoji для всех 10 этапов. Дружелюбные сообщения в Telegram, прибытие к поставщику явно требует отдельной оплаты доставки перед отправкой. Внутренние статусы сохранены.
 - [x] Полные ссылки Taobao/Tmall и числовые ID нормализуются на сервере. Чужие/подменённые хосты и неоднозначные ID отклоняются; короткая ссылка требует полного URL товара.
 - [x] Модератор публикует сразу без одобрения; при пустых финансовых настройках доступна ручная RUB цена с пустыми юанями. Настройки и подтверждение поступления денег остаются owner-only.
 - [x] Изолированные API tests и Chrome mobile/desktop: новые панели, пустые/pending состояния, отсутствие утечки admin-заказов, moderator create, ссылки, уведомления, без overflow/JS ошибок. Все записи/Telegram замоканы; общая БД не менялась.
 - [x] Lint/build прошли; страница меньше 2000 строк.
 - [ ] Нужна повторная публикация этой итерации через платформу.

## Moderator save fix + SKU recheck
- Root cause: imported drafts (sizes [], empty image/taobao) and old seed clothing failed zod; oRPC returned generic "Input validation failed"; native `required` silently blocked empty Taobao field.
- Fix: hidden drafts save with name+price only; visible/unhide requires full publishProblems(); readable server errors; inline checklist; no guessed sizes; half/custom sizes; sourcing preserved server-side and stripped from public catalog.
- Tests: scripts/test-drafts.ts (in test-isolated), browser draft scenario.
- SKU: login wall everywhere; 10/13 listings exist, prices unchanged; no sizes confirmed.

## Проверка наличия до оплаты + фото прибытия
- [x] Карточка товара: сетка продавца + «Наличие размера подтвердим до оплаты». Редактор: сетка продавца, не подтверждённое наличие.
- [x] Модератор на «Заявка принята»: по каждой позиции Есть / Другой размер / Убрать + новая цена + комментарий. Без изменений → счёт сразу. Всё убрано → «Заказ отменён: товара нет в наличии».
- [x] Изменения → «Ждём согласия покупателя», 3 часа. Покупатель: «Согласен, выставить счёт» (пересчёт, счёт на новую сумму, originalItems сохранены) или «Отменить заказ». CAS по версии, только владелец заказа. Модераторы/владелец получают уведомление о решении.
- [x] Таймаут 3 часа применяется лениво при чтении заказов (покупатель/панель) и при ответе; одно уведомление под конкуренцией. Нет фонового таймера: отмена фиксируется при первом открытии приложения кем-либо после срока.
- [x] Фото прибытия: до 8, при «Заказ у меня» и позже; уходят покупателю sendPhoto, видны в заказе.
- [x] Tests: scripts/test-availability.ts (isolated), browser сценарии; lint/build ok.
- [ ] Нужна повторная публикация.

## Iteration: /start without phone prompt + InfoTip
- bot-webhook: /start|«Старт» for users with stored phone -> only welcome + openAppMarkup; /phone still offers contact button. Tests in test-telegram.ts (update_ids 900000000010-12).
- components/info-tip.tsx: big circled «i» + one-line summary, expands inline (.info-tip-body, hidden attr). Used in BuyerOrders shipping, PaymentCard, BuyerProposal, checkout modal, RegistrationCard, destination-picker. Home order status clamped to 3 lines.
- Home guide (opt-in) left expanded on purpose.
- Verified: lint, tsc, build, isolated tests, commerce browser test (expand checks), screenshots.

## Iteration: home order journey panel
- shared/order-presentation.ts: orderJourney(status) -> {tone, step, short, title}; journeySteps (6). Cancel reasons -> «Причина: …».
- home-updates.tsx: stage-tinted panel (tone-request/transit/supplier/cdek/delivered/cancelled), item thumb + name, short description, 6-step track, urgent CTA pill.
- Browser test: homeJourneyTones (tone, thumb, current step, cancel reason). Screens /tmp/journey-*.png.

## Iteration: ФИО, moderation redesign, bot broadcast + bot product wizard (DONE)
Plan:
1. ФИО: teo_users.last_name/first_name/middle_name (+ «нет отчества» => middle_name=""), route profile.saveFullName, createOrder requires ФИО (snapshot order.recipient), bot/admin show ФИО. UI: FullNameCard in profile (required, warning re СДЭК) + checkout blocks.
2. Arrival photos: already exist at «Заказ у меня» — make prominent block «📸 Фото прибывшего товара».
3. Moderation redesign: bigger product cards (thumb 88px, 48px buttons), tabs; extract AdminProducts component.
4. Profile: moderator panel button at top, distinct dark/olive color.
5. Bot: teo_bot_sessions table. Owner /broadcast (рассылка): text | photo+caption | album -> preview -> confirm -> outbox to all started users, flushed in batches.
6. Bot: /newproduct for owner+moderators: guided steps category -> clothing type -> name -> price -> taobao -> color -> sizes -> photos -> description -> save hidden draft or publish if complete.

### Result (ФИО / moderation / bot)
- Done: required ФИО (profile + checkout gate + server check + recipient on order + «ФИО для СДЭК» in admin), dark moderator entry at top of profile, new admin product cards + 3-segment filter, arrival-photo drop-zone.
- Bot: `bot-session.ts` (TTL, CAS step, optimistic mutate), `bot-broadcast.ts` (/broadcast owner-only, album race-safe, preview, CAS send, failed rows marked `failed`), `bot-product-wizard.ts` (/newproduct owner+moderators, inline buttons, size toggles, photos via getFile, publish/draft via storeProduct), `/cancel`.
- Commands menu updated via scripts/connect-telegram.ts (buyer/moderator/owner scopes); /newmoder sets moderator menu.
- DB pushed (last_name/first_name/middle_name, teo_bot_sessions).
- Verified: lint 0, tsc OK, build OK, isolated tests incl. new scripts/test-bot.ts, browser test incl. fullNameRequired / moderatorEntryTop / adminProductCards.

## Iteration — ruble price from yuan (rate 14, fixed per-type markups) — DONE
- `shared/pricing.ts`: price ₽ = round(¥ × rate) + delivery to supplier + teo service (fixed ₽ per type; upper bound of delivery range). Tiers: футболка 400/400, кофта 700/600, штаны 700/600, куртка 1200/800, обувь 1200/800, прочее 700/600 (assumption).
- `CommerceSettings.markups` replaces supplier/service percents; `pricingReady` = rate > 0; `getSettings` normalizes markups; `saveSettings` validates int 0–100000 per tier.
- Catalog/product-store use `priceBreakdown`; buyer-facing «¥ · со сборами» removed (yuanPrice always undefined; orders snapshot taobaoYuan).
- Editor: live «Расчёт цены» card; settings: per-type markup table; bot `/newproduct` asks Taobao ¥ (or «… ₽» manual) and shows breakdown in summary.
- Real DB: settings rate 14 + default markups (percents dropped); 13 sourced products got `taobaoYuan = sourcing.sourceYuan` — all recalculated prices equal the previous ones (`scripts/migrate-pricing.ts`).
- Tests updated (commerce, availability, bot, browser incl. live breakdown). Lint/tsc/build OK.

## Iteration — paste a link instead of ID — DONE
- `shared/taobao.ts`: link parsing (any *.taobao.com / *.tmall.com / *.tmall.hk, `id=` or `/item/N.htm`, link inside share text), short-link detection, `taobaoDisplay`.
- `api/services/taobao-link.ts`: resolves e.tb.cn/m.tb.cn (fixed hosts only, redirect manual, 6 s timeout, `var url='…'`), errors for shop/expired links. Used by `storeProduct` (editor + bot) and `routes/taobao.ts` `taobao.resolve` (moderator) for live feedback.
- Editor `TaobaoLinkField`; bot step 4 asks for a link; admin search accepts a pasted link. Tests: `scripts/test-taobao.ts` + browser. Live check with a real e.tb.cn link → id 1030084947463.
