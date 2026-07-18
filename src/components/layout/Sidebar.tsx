"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    Clock,
    Menu,
    LogOut,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { createClient } from "@/src/lib/supabase/client";

const MENU_ITEMS = [
    { href: "/schedules", icon: Clock, label: "Schedule" },
] as const;

export function Sidebar() {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    async function handleLogout() {
        setIsLoggingOut(true);
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    return (
        <>
            {/* Desktop: 従来のサイドバー（sm 以上で表示） */}
            <nav
                className="hidden sm:flex fixed inset-y-0 left-0 z-30 flex-col w-12 transition-all duration-150 ease-in-out bg-transparent border-r border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 group hover:w-64 hover:bg-neutral-50 dark:hover:bg-neutral-900 overflow-hidden"
                aria-label="メインナビゲーション"
            >
                <div className="flex flex-col flex-1 gap-2 p-1 mt-4">
                    {MENU_ITEMS.map(({ href, icon: Icon, label }) => (
                        <SidebarItem
                            key={href}
                            href={href}
                            icon={<Icon className="w-5 h-5 flex-shrink-0" />}
                            label={label}
                        />
                    ))}
                </div>
                <div className="p-2 mb-4 space-y-2">
                    <SidebarActionButton
                        icon={<LogOut className="w-5 h-5 flex-shrink-0" />}
                        label="Logout"
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                    />
                    <ThemeToggle />
                </div>
            </nav>

            {/* Mobile: ハンバーガーボタン（左下固定） */}
            <div className="fixed bottom-4 left-4 z-30 sm:hidden">
                <button
                    type="button"
                    onClick={() => setIsOpen((prev) => !prev)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "メニューを閉じる" : "メニューを開く"}
                    className="flex items-center justify-center w-12 h-12 rounded-sm border-2 border-neutral-400 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
                >
                    <Menu className="w-6 h-6" />
                </button>
            </div>

            {/* Mobile: オーバーレイ（メニュー外タップで閉じる） */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-20 bg-neutral-950 opacity-50 dark:opacity-75 sm:hidden"
                    aria-hidden
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Mobile: ドロワーパネル */}
            <div
                className={`fixed inset-y-0 left-0 z-30 w-64 flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 transition-transform duration-150 ease-in-out sm:hidden ${
                    isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
                }`}
                role="dialog"
                aria-modal="true"
                aria-label="メニュー"
                aria-hidden={!isOpen}
            >
                <div className="p-1 sm:p-2 mt-4 space-y-2">
                    <SidebarActionButton
                        icon={<LogOut className="w-5 h-5 flex-shrink-0" />}
                        label="Logout"
                        onClick={async () => {
                            setIsOpen(false);
                            await handleLogout();
                        }}
                        showLabel
                        disabled={isLoggingOut}
                    />
                    <ThemeToggle showLabel />
                </div>
                <div className="flex flex-col gap-2 p-1 sm:p-2 mt-auto mb-12 pb-4 sm:pb-6 overflow-auto">
                    {MENU_ITEMS.map(({ href, icon: Icon, label }) => (
                        <SidebarItem
                            key={href}
                            href={href}
                            icon={<Icon className="w-5 h-5 flex-shrink-0" />}
                            label={label}
                            showLabel
                            onNavigate={() => setIsOpen(false)}
                        />
                    ))}
                </div>
            </div>
        </>
    );
}

const SidebarItem = ({
    href,
    icon,
    label,
    showLabel = false,
    onNavigate,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    showLabel?: boolean;
    onNavigate?: () => void;
}) => {
    return (
        <Link
            href={href}
            onClick={onNavigate}
            className="flex items-center gap-2 sm:gap-4 px-2 py-2 text-sm sm:text-base font-medium leading-6 sm:leading-7 transition-colors rounded-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 group-hover:px-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
        >
            <div className="flex items-center justify-center w-8 h-8 shrink-0">{icon}</div>
            <span
                className={`whitespace-nowrap transition-opacity duration-150 ease-in-out ${
                    showLabel ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
            >
                {label}
            </span>
        </Link>
    );
};

const SidebarActionButton = ({
    icon,
    label,
    onClick,
    showLabel = false,
    disabled = false,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void | Promise<void>;
    showLabel?: boolean;
    disabled?: boolean;
}) => {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="w-full flex items-center gap-2 sm:gap-4 px-2 py-2 text-sm sm:text-base font-medium leading-6 sm:leading-7 transition-colors rounded-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 disabled:opacity-50 group-hover:px-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
        >
            <div className="flex items-center justify-center w-8 h-8 shrink-0">{icon}</div>
            <span
                className={`whitespace-nowrap transition-opacity duration-150 ease-in-out ${
                    showLabel ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
            >
                {label}
            </span>
        </button>
    );
};
