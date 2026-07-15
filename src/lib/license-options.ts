export const LICENSE_PLATFORMS = [
  "Android",
  "Linux",
  "QNX",
  "WinCE",
  "Универсальная",
] as const;

export type LicensePlatform = (typeof LICENSE_PLATFORMS)[number];

export function isLicensePlatform(value: unknown): value is LicensePlatform {
  return typeof value === "string" && (LICENSE_PLATFORMS as readonly string[]).includes(value);
}

export const LICENSE_PLATFORM_OPTIONS = LICENSE_PLATFORMS.map((p) => ({ value: p, label: p }));
