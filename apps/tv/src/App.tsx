/**
 * Placeholder TV app.
 * Real UI will be built in a later prompt.
 */
export default function App({ mockName }: { mockName?: string } = {}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold">{mockName ?? 'TV app OK'}</h1>
        <p className="mt-2 text-gray-400">මහියංගනය බස් නිලයම — Placeholder</p>
      </div>
    </main>
  );
}
