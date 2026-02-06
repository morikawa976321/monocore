import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 gap-6">
      <h1 className="text-2xl font-mono tracking-tight text-zinc-900">monocore_ui_test</h1>
      
      <div className="flex gap-4">
        {/* 標準のボタン */}
        <Button>Deploy Engine</Button>
        
        {/* 枠線のみのボタン */}
        <Button variant="outline">Secondary Action</Button>
        
        {/* 警告色のボタン */}
        <Button variant="destructive">Reset Core</Button>
      </div>

      <p className="text-xs text-zinc-400 font-mono">system_status: operational</p>
    </div>
  );
}