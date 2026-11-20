import QRCode from "qrcode";
import { COLOR } from "@/lib/design-tokens";

/**
 * The otpauth link as an inline SVG QR code, rendered on the server: no
 * external service, no client JS, and the secret never leaves this response.
 * Port of the template app/[locale]/profile/sicherheit/QrCode.tsx; dark on light from the
 * tokens. The SVG markup comes from the qrcode library, never from user input.
 */
export async function QrCode({ value, label }: { value: string; label: string }) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 200,
    color: { dark: COLOR.root, light: COLOR.text },
  });
  return <div role="img" aria-label={label} className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
