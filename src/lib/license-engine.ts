import "server-only";

/** Лицензии генерирует DRIVEMODS; на нашей стороне остаётся только приём файла ШГУ. */
export function validateDeviceIdFile(buffer: Buffer): { ok: true } | { ok: false; reason: string } {
  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, reason: "Файл пуст" };
  }
  if (buffer.byteLength > 5 * 1024 * 1024) {
    return { ok: false, reason: "Файл слишком большой (>5 МБ)" };
  }
  return { ok: true };
}
