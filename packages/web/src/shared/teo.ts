import type { OrderPayment } from "./commerce";
import type { AvailabilityProposal } from "./availability";
export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  image: string;
  color: string;
  description: string;
  tag?: string;
  rating: string;
  taobao: string;
  hidden?: boolean;
  clothing?: boolean;
  clothingType?: string;
  sizes?: string[];
  images?: string[];
  taobaoYuan?: number;
  yuanPrice?: number;
  /** Import provenance, server-owned; preserved on moderator saves. */
  sourcing?: Record<string, unknown>;
};
export type CartItem = { productId: number; qty: number; variant: string };
export type Order = {
  id: string;
  items: (CartItem & {
    name: string;
    price: number;
    image: string;
    taobao?: string;
    taobaoYuan?: number;
    yuanPrice?: number;
  })[];
  total: number;
  point: string;
  status: string;
  date: string;
  assemblyAt?: number;
  userId?: number;
  username?: string | null;
  phone?: string | null;
  buyerName?: string;
  /** ФИО получателя для СДЭК, снимок на момент заказа. */
  recipient?: string;
  city?: string;
  goodsPayment?: OrderPayment;
  shippingPayment?: OrderPayment;
  tracking?: string;
  history?: { status: string; at: number; actor: number }[];
  /** Moderator's availability review; buyer must accept changes before payment. */
  availability?: AvailabilityProposal;
  /** Items as ordered, kept when the buyer accepted availability changes. */
  originalItems?: Order["items"];
  /** Photos of the parcel after it arrived at the supplier. */
  arrivalPhotos?: string[];
};
export type PhotoRequest = {
  id: string;
  image: string;
  comment: string;
  status: string;
  productId?: number;
  userId?: number;
  username?: string | null;
  phone?: string | null;
  buyerName?: string;
  assignedTo?: number;
  assignedName?: string;
  assignedAt?: number;
  replyConfirmedAt?: number;
};
export const statuses = [
  "Оплачен",
  "В сборке",
  "В пути",
  "В ПВЗ СДЭК",
  "Выдан",
];
export const categories = [
  "Все",
  "Одежда",
  "Обувь",
  "Для дома",
  "Аксессуары",
  "Техника",
];
export const initialProducts: Product[] = [
  {
    id: 1,
    name: "Настольная лампа Mushroom",
    category: "Для дома",
    price: 2390,
    oldPrice: 3190,
    image: "/images/lamp.jpg",
    color: "Оранжевый",
    description:
      "Немного ретро, много уюта. Лампа с мягким тёплым светом станет любимым акцентом на вашем столе. Высота 28 см, питание от сети.",
    tag: "Хит Teo",
    rating: "4.9",
    taobao: "123456001",
  },
  {
    id: 2,
    name: "Сумка Soft Hobo",
    category: "Аксессуары",
    price: 1890,
    image: "/images/bag.jpg",
    color: "Оливковый",
    description:
      "Мягкая форма и тот самый оттенок зелёного. Вместительная сумка на каждый день из экокожи, с внутренним карманом.",
    tag: "Новинка",
    rating: "4.8",
    taobao: "123456002",
  },
  {
    id: 3,
    name: "Кеды Everyday",
    category: "Обувь",
    price: 3490,
    oldPrice: 4290,
    image: "/images/sneakers.jpg",
    color: "Бежевый",
    description:
      "Комфортная пара для больших планов и неспешных прогулок. Мягкая стелька, прочная подошва и универсальный бежевый цвет.",
    rating: "4.9",
    taobao: "123456003",
  },
  {
    id: 4,
    name: "Худи Basic",
    category: "Одежда",
    price: 2790,
    image: "/images/hoodie.jpg",
    color: "Молочный",
    description:
      "Объёмный силуэт, плотный хлопок и мягкость, которую не хочется снимать. Свободная посадка унисекс.",
    tag: "Новинка",
    rating: "4.8",
    taobao: "123456004",
  },
  {
    id: 5,
    name: "Кружка Sunday",
    category: "Для дома",
    price: 790,
    image: "/images/mug.jpg",
    color: "Кремовый",
    description:
      "Для медленных завтраков и любимого кофе. Керамическая кружка объёмом 350 мл с приятной фактурой.",
    rating: "4.9",
    taobao: "123456005",
  },
  {
    id: 6,
    name: "Наушники Quiet",
    category: "Техника",
    price: 4990,
    oldPrice: 5990,
    image: "/images/headphones.jpg",
    color: "Молочный",
    description:
      "Ваш маленький мир музыки. Беспроводное подключение, мягкие амбушюры и до 30 часов работы.",
    tag: "Хит Teo",
    rating: "4.7",
    taobao: "123456006",
  },
  {
    id: 7,
    name: "Лампа Mushroom Mini",
    category: "Для дома",
    price: 1690,
    image: "/images/lamp.jpg",
    color: "Оранжевый",
    description:
      "Маленькая версия любимой лампы. Тёплый свет для уютного уголка. Высота 20 см.",
    rating: "4.8",
    taobao: "123456007",
  },
  {
    id: 8,
    name: "Сумка Weekender",
    category: "Аксессуары",
    price: 2290,
    image: "/images/bag.jpg",
    color: "Оливковый",
    description:
      "Лёгкая, вместительная и всегда с вами. Для выходных в городе и небольших путешествий.",
    rating: "4.9",
    taobao: "123456008",
  },
];
export const pickupPoints: Record<string, string[]> = {
  Москва: ["ул. Покровка, 12", "ул. Арбат, 24", "Ленинградский проспект, 36"],
  "Санкт-Петербург": ["Невский проспект, 88", "ул. Марата, 15"],
  Казань: ["ул. Баумана, 36", "ул. Чистопольская, 19"],
};
export const money = (v: number) =>
  new Intl.NumberFormat("ru-RU").format(v) + " ₽";
