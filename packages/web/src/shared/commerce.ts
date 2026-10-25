import { defaultMarkups, type Markups } from "./pricing";

export type CommerceSettings = {
  rate: number | null;
  /** Fixed ₽ per item type: delivery to the supplier + teo service. */
  markups: Markups;
  bank: string;
  recipient: string;
  details: string;
};
export const emptySettings: CommerceSettings = {
  rate: null,
  markups: defaultMarkups,
  bank: "",
  recipient: "",
  details: "",
};
export const shippingNotice =
  "Доставка из Владивостока до вашего ПВЗ не включена. Она рассчитывается и оплачивается отдельно после поступления товара на наш склад.";
export const orderStages = [
  "Заявка принята",
  "Ожидает оплаты товара",
  "Проверяем оплату товара",
  "В пути к поставщику",
  "Заказ у меня",
  "Ожидает оплаты доставки",
  "Проверяем оплату доставки",
  "Доставка оплачена",
  "Заказ отправлен получателю",
  "Заказ доставлен",
] as const;
export type PaymentState = "waiting" | "pending" | "approved" | "cancelled";
export const unpaidTimeout = 30 * 60 * 1000;
export function goodsIssuedAt(o: {
  goodsPayment?: OrderPayment;
  history?: { status: string; at: number }[];
}) {
  return (
    o.goodsPayment?.issuedAt ??
    o.history?.find((h) => h.status === "Ожидает оплаты товара")?.at
  );
}
export type OrderPayment = {
  amount: number;
  issuedAt?: number;
  state: PaymentState;
  version: string;
  bank: string;
  recipient: string;
  details: string;
  receipt?: string;
  submittedAt?: number;
  approvedAt?: number;
  approvedBy?: number;
  cancelledAt?: number;
  cancelledBy?: number;
};
export function pricingReady(s: Pick<CommerceSettings, "rate">) {
  return s.rate !== null && s.rate > 0;
}
