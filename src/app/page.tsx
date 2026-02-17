import { createClient } from "@/src/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();

  const { data: testData } = await supabase
    .from("test")
    .select("*")
    .limit(1)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-50 gap-6">
      <h1 className="text-2xl font-mono tracking-tight text-neutral-400">monocore_ui_test</h1>

      <div className="flex gap-4">
        {/* 標準のボタン */}
        <button className="px-4 py-2 bg-neutral-50 text-neutral-950 rounded-md font-medium">Deploy Engine</button>

        {/* 枠線のみのボタン */}
        <button className="px-4 py-2 border border-neutral-800 text-neutral-50 rounded-md font-medium hover:bg-neutral-900 transition-colors">Secondary Action</button>

        {/* 警告色のボタン */}
        <button className="px-4 py-2 bg-red-600 text-neutral-50 rounded-md font-medium hover:bg-red-700 transition-colors">Reset Core</button>
      </div>

      <div className="flex gap-4">
        {testData?.[0].test ?? "No Data"}
      </div>

      <p className="text-xs text-neutral-500 font-mono">system_status: operational</p>
    </div>
  );
}
