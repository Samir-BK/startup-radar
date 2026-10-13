import { Suspense } from "react";
import { Board } from "@/components/board";
import { readSnapshot } from "@/lib/snapshot";

export default function Home() {
  return (
    <main className="flex-1">
      <Suspense fallback={<Loading />}>
        <LoadedBoard />
      </Suspense>
    </main>
  );
}

async function LoadedBoard() {
  const snapshot = await readSnapshot();
  return <Board snapshot={snapshot} />;
}

function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-16 md:px-6">
      <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
        Startup100 · Finland
      </p>
      <h1 className="font-heading text-4xl tracking-tight">Open roles</h1>
      <p className="text-muted-foreground">Opening the saved job list…</p>
    </div>
  );
}
