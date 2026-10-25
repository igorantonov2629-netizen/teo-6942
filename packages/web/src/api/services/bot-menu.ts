export const supportText =
  "💬 Поддержка teo — мы на связи!\n@myinik\n@sanekhelper\n\nНапишите одному из нас — поможем с заказом или поиском вашей находки.";
export const supportMarkup = () => ({
  inline_keyboard: [
    [
      { text: "@myinik", url: "https://t.me/myinik" },
      { text: "@sanekhelper", url: "https://t.me/sanekhelper" },
    ],
  ],
});
export const botMenu = (contact = false) => ({
  keyboard: [
    [{ text: "Старт" }, { text: "Поддержка" }],
    ...(contact
      ? [[{ text: "Поделиться номером", request_contact: true }]]
      : []),
  ],
  resize_keyboard: true,
  is_persistent: true,
});

/** Telegram «/» menu: everyone, moderators (per chat), and the owner (per chat). */
export const buyerCommands = [
  { command: "start", description: "Открыть Teo и зарегистрироваться" },
  { command: "support", description: "Поддержка: @myinik и @sanekhelper" },
  { command: "id", description: "Узнать свой Telegram ID" },
  { command: "phone", description: "Поделиться номером телефона" },
  { command: "deletephone", description: "Удалить номер из профиля" },
  { command: "cancel", description: "Отменить текущее действие" },
  { command: "help", description: "Помощь и команды" },
];
export const moderatorCommands = [
  ...buyerCommands,
  { command: "newproduct", description: "Добавить товар по шагам" },
];
export const ownerCommands = [
  ...moderatorCommands,
  { command: "broadcast", description: "Рассылка всем пользователям" },
  { command: "newmoder", description: "Добавить модератора: ID или @username" },
  { command: "delmoder", description: "Отозвать доступ модератора" },
  { command: "moderators", description: "Список модераторов" },
];
