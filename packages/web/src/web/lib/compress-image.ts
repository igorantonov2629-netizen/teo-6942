/** Reads an image file and returns a JPEG data URL no larger than `max` px per side. */
export function compressImage(file: File, max = 1000, quality = 0.78) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)
      return reject(new Error("Выберите фото до 8 МБ каждое"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось открыть фото"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas
          .getContext("2d")!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
