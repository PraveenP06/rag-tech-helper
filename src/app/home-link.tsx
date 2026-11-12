import Link from "next/link";

/** Small "← Home" link for the top of each page. */
export function HomeLink() {
  return (
    <Link
      href="/"
      aria-label="Back to home"
      className="self-start text-sm font-medium text-zinc-600 underline-offset-4 hover:text-black hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      ← Home
    </Link>
  );
}
