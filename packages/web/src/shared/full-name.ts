/** ФИО получателя: без него СДЭК не примет посылку к отправке. */
export type FullNameFields = {
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
};

export const fullNameWhy =
  "Без фамилии, имени и отчества СДЭК не примет посылку — заказ невозможно отправить. Укажите данные как в паспорте: их проверят при выдаче в ПВЗ.";

const namePart = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё' -]{0,58}[A-Za-zА-Яа-яЁё]?$/;

export function cleanNamePart(v: string) {
  const s = v.replace(/\s+/g, " ").trim();
  return s
    .split(/([ -])/)
    .map((w) =>
      w.length > 1 || /[A-Za-zА-Яа-яЁё]/.test(w)
        ? w.charAt(0).toUpperCase() + w.slice(1)
        : w,
    )
    .join("");
}

/** null middleName = not answered yet, "" = no patronymic. */
export function hasFullName(u: FullNameFields) {
  return (
    !!u.lastName &&
    !!u.firstName &&
    u.middleName !== null &&
    u.middleName !== undefined
  );
}

export function fullNameOf(u: FullNameFields) {
  if (!hasFullName(u)) return "";
  return [u.lastName, u.firstName, u.middleName].filter(Boolean).join(" ");
}

export function fullNameProblems(input: {
  lastName: string;
  firstName: string;
  middleName: string;
  noMiddleName: boolean;
}) {
  const out: string[] = [];
  const check = (v: string, label: string) => {
    const s = cleanNamePart(v);
    if (!s) out.push(`Укажите ${label}.`);
    else if (!namePart.test(s))
      out.push(
        `${label[0]!.toUpperCase()}${label.slice(1)}: только буквы, пробел, дефис.`,
      );
  };
  check(input.lastName, "фамилию");
  check(input.firstName, "имя");
  if (!input.noMiddleName) check(input.middleName, "отчество");
  return out;
}
