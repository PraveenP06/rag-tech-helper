import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "RAG Tech Helper",
  description: "Plain-language, step-by-step help with phones, tablets and computers",
};

// Matches the guides in the knowledge base; update it when topics are added or removed.
const TOPICS = [
  "Setting up a new phone",
  "Making text bigger",
  "Video calls with family",
  "Texting and sending photos",
  "Checking voicemail",
  "Connecting to Wi-Fi",
  "Pairing Bluetooth headphones",
  "Downloading apps",
  "Updating your phone",
  "Fixing a frozen or slow phone",
  "Finding a lost phone",
  "Forgotten passcodes and passwords",
  "Backing up photos",
  "Taking a screenshot",
  "Setting alarms",
  "Calling for help in an emergency",
  "Blocking unwanted calls",
  "Spotting scams",
  "Staying safe on public Wi-Fi",
  "Making strong passwords",
] as const;

const TEAM_BUTTON =
  "rounded-lg border border-black/15 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/20 dark:text-zinc-300 dark:hover:bg-zinc-900";

export default function Home() {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-10 bg-white px-6 py-14 dark:bg-black sm:px-10">
        <nav aria-label="Team pages" className="flex items-center justify-end gap-2 text-sm">
          <span className="mr-1 text-zinc-500 dark:text-zinc-400">Team:</span>
          <Link href="/ingest" className={TEAM_BUTTON}>
            Add guides
          </Link>
          <Link href="/admin" className={TEAM_BUTTON}>
            Admin
          </Link>
        </nav>

        <header className="-mt-4 flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">Tech Helper</h1>
          <p className="text-xl leading-relaxed text-zinc-700 dark:text-zinc-300">
            Ask a question about your phone, tablet or computer in your own words. You&apos;ll get
            plain-language, step-by-step help from trusted guides.
          </p>
        </header>

        <Link
          href="/chat"
          className="flex min-h-16 items-center justify-center rounded-xl bg-blue-700 px-8 text-2xl font-semibold text-white hover:bg-blue-800 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-700 dark:bg-blue-500 dark:text-black dark:hover:bg-blue-400 sm:self-start"
        >
          Ask a question
        </Link>

        <section className="flex flex-col gap-4">
          <h2 id="topics" className="text-2xl font-semibold text-black dark:text-zinc-50">
            Things I can help with
          </h2>
          <ul aria-labelledby="topics" className="grid gap-x-6 gap-y-3 text-lg text-zinc-800 dark:text-zinc-200 sm:grid-cols-2">
            {TOPICS.map((topic) => (
              <li key={topic} className="flex gap-3">
                <span aria-hidden="true" className="text-blue-700 dark:text-blue-400">
                  •
                </span>
                {topic}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
