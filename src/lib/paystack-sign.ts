import { createHmac, timingSafeEqual } from "node:crypto";

export function paystackSignatureOk(raw: string, signature: string | null, secret: string) {
  if (!secret || !signature) return false;
  const digest = createHmac("sha512", secret).update(raw).digest("hex");
  const left = Buffer.from(digest);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
