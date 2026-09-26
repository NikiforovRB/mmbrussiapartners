import "server-only";

import { db } from "./db";

/**
 * Повторная генерация — для этого ШГУ лицензия уже выдавалась: так отвечает
 * DRIVEMODS (recoverable) либо она есть в портале у любого представителя.
 *
 * Повторная генерация бесплатна, поэтому признак считает только сервер по
 * ответу DRIVEMODS: присланному браузером флагу или ID устройства верить
 * нельзя — так бесплатной можно было бы сделать любую генерацию.
 */
export async function isRepeatGeneration(deviceId: string, recoverable: boolean): Promise<boolean> {
  if (recoverable) return true;
  if (!deviceId) return false;
  return (await db.license.count({ where: { deviceId, deletedAt: null } })) > 0;
}
