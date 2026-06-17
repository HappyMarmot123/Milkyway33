import { SettingsPanel } from "@/components/features/SettingsPanel";

export function SettingsPage() {
  return (
    <main aria-label="settings-page" className="relative min-h-full overflow-hidden bg-gradient-to-b from-bg-0 via-bg-100/50 to-bg-100">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-20 right-10 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 left-10 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative mx-auto w-full min-w-0 max-w-4xl p-4 sm:p-6 lg:p-8">
        <SettingsPanel />
      </div>
    </main>
  );
}
