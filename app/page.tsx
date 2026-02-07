import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();

  const { data: testData } = await supabase
    .from("test")
    .select("*")
    .limit(1)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg.dark-background gap-6">
      <h1 className="text-2xl font-mono tracking-tight text-primary">monocore_ui_test</h1>

      <div className="flex gap-4">
        {/* 標準のボタン */}
        <Button>Deploy Engine</Button>

        {/* 枠線のみのボタン */}
        <Button variant="outline">Secondary Action</Button>

        {/* 警告色のボタン */}
        <Button variant="destructive">Reset Core</Button>
      </div>

      <div className="flex gap-4">
        {testData?.[0].test ?? "No Data"}
      </div>

      <p className="text-xs text-zinc-400 font-mono">system_status: operational</p>
    </div>
  );
}