import Link from "next/link";

export default function ToolCTA({ href, ctaText }: { href: string; ctaText: string }) {
  return (
    <Link href={href} className="btn-primary mt-6 inline-flex">
      {ctaText}
    </Link>
  );
}
