"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/src/components/ui/Button";

type ThemeToggleProps = {
    showLabel?: boolean;
};

function subscribe() {
    return () => {};
}

export function ThemeToggle({ showLabel = false }: ThemeToggleProps) {
    const { resolvedTheme, setTheme } = useTheme();
    const mounted = useSyncExternalStore(subscribe, () => true, () => false);

    if (!mounted) {
        return (
            <div className="flex items-center gap-4 px-2 py-2">
                <div className="w-8 h-8 shrink-0"></div>
            </div>
        );
    }

    const isDark = resolvedTheme === "dark";

    return (
        <Button
            color="ghost"
            size="nav"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="gap-4 group-hover:px-3"
        >
            <div className="flex items-center justify-center w-8 h-8 shrink-0">
                {isDark ? (
                    <Moon className="w-5 h-5 flex-shrink-0" />
                ) : (
                    <Sun className="w-5 h-5 flex-shrink-0" />
                )}
            </div>
            <span
                className={`transition-opacity duration-150 ease-in-out whitespace-nowrap ${
                    showLabel ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
            >
                Toggle Theme
            </span>
        </Button>
    );
}
