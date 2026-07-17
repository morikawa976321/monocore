"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useSyncExternalStore } from "react";

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
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex items-center w-full gap-4 px-2 py-2 text-sm font-medium transition-colors rounded-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 group-hover:px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
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
        </button>
    );
}
