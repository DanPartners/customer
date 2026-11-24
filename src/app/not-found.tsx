import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center px-5">
      <h1 className="font-display text-4xl">Not on the menu</h1>
      <p className="mt-3 text-ink-soft">That page is not part of this shop&apos;s ordering site.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-display text-accent-ink underline">
        Back to the menu
      </Link>
    </main>
  );
}
