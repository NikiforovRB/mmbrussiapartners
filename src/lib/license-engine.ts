import "server-only";
import crypto from "node:crypto";

export type LicenseGenerationParams = {
  licenseNumber: string;
  type: "ECO" | "FULL" | "CUSTOM";
  features: Record<string, boolean | string>;
  termStart: Date;
  termEnd: Date;
  customerFio: string;
  customerOrganization?: string | null;
  vehicleVin?: string | null;
};

export type LicenseGenerationResult = {
  buffer: Buffer;
  filename: string;
  meta: { signature: string; size: number };
};

/**
 * Stub for the license generator. When the vendor API spec arrives, replace the
 * body of this function with an authenticated HTTP call to LICENSE_API_URL.
 *
 * The current implementation produces a deterministic binary blob:
 * a 16-byte header, the original device-id bytes, then a JSON tail
 * containing license metadata, ending with a SHA-256 signature.
 */
export async function generateLicense(
  deviceIdBuffer: Buffer,
  params: LicenseGenerationParams,
): Promise<LicenseGenerationResult> {
  const externalUrl = process.env.LICENSE_API_URL;
  const externalKey = process.env.LICENSE_API_KEY;

  if (externalUrl && externalKey) {
    const res = await fetch(externalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: `Bearer ${externalKey}`,
        "X-License-Number": params.licenseNumber,
        "X-License-Type": params.type,
      },
      body: new Uint8Array(deviceIdBuffer),
    });
    if (!res.ok) {
      throw new Error(`License API error: ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      buffer: buf,
      filename: "device-license.bin",
      meta: { signature: sha256(buf).slice(0, 16), size: buf.byteLength },
    };
  }

  const header = Buffer.from("MMBLIC\x01\x00", "ascii");
  const padding = Buffer.alloc(8, 0);
  const tail = Buffer.from(
    JSON.stringify({
      licenseNumber: params.licenseNumber,
      type: params.type,
      features: params.features,
      termStart: params.termStart.toISOString(),
      termEnd: params.termEnd.toISOString(),
      customer: { fio: params.customerFio, organization: params.customerOrganization ?? null },
      vehicleVin: params.vehicleVin ?? null,
      generatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  const body = Buffer.concat([header, padding, deviceIdBuffer, Buffer.from("\n--LIC--\n"), tail]);
  const signature = sha256(body);
  const sigBuf = Buffer.from(`\n--SIG--\n${signature}\n`, "utf8");
  const buffer = Buffer.concat([body, sigBuf]);

  return {
    buffer,
    filename: "device-license.bin",
    meta: { signature: signature.slice(0, 16), size: buffer.byteLength },
  };
}

function sha256(b: Buffer): string {
  return crypto.createHash("sha256").update(b).digest("hex");
}

export function validateDeviceIdFile(buffer: Buffer): { ok: true } | { ok: false; reason: string } {
  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, reason: "Файл пуст" };
  }
  if (buffer.byteLength > 5 * 1024 * 1024) {
    return { ok: false, reason: "Файл слишком большой (>5 МБ)" };
  }
  return { ok: true };
}
