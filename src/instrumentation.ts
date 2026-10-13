export async function register() {
  // Проверка именно внутри if: по ней сборка выкидывает Node-модули из edge-бандла.
  // Локальный dev смотрит в ту же БД, что и прод: вторые планировщики не нужны.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startSchedulers } = await import("./instrumentation-node");
    startSchedulers();
  }
}
