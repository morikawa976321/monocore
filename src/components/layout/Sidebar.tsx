import Link from "next/link";
import {
    HomeIcon,
    FolderIcon,
    CheckCircleIcon,
    BookOpenIcon,
    ShoppingBagIcon,
    ClockIcon,
} from "@heroicons/react/24/outline";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
    return (
        <nav className="fixed inset-y-0 left-0 z-50 flex flex-col w-12 transition-all duration-150 ease-in-out bg-transparent border-r border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 group hover:w-64 hover:bg-neutral-50 dark:hover:bg-neutral-900 overflow-hidden">
            <div className="flex flex-col flex-1 gap-2 p-2 mt-4">
                <SidebarItem href="/" icon={<HomeIcon className="w-5 h-5 flex-shrink-0" />} label="Inbox" />
                <SidebarItem href="/projects" icon={<FolderIcon className="w-5 h-5 flex-shrink-0" />} label="Project" />
                <SidebarItem href="/tasks" icon={<CheckCircleIcon className="w-5 h-5 flex-shrink-0" />} label="Task" />
                <SidebarItem href="/schedules" icon={<ClockIcon className="w-5 h-5 flex-shrink-0" />} label="Schedule" />
                <SidebarItem href="/knowledge" icon={<BookOpenIcon className="w-5 h-5 flex-shrink-0" />} label="Knowledge" />
                <SidebarItem href="/items" icon={<ShoppingBagIcon className="w-5 h-5 flex-shrink-0" />} label="Item" />
            </div>
            <div className="p-2 mb-4">
                <ThemeToggle />
            </div>
        </nav>
    );
}

const SidebarItem = ({
    href,
    icon,
    label,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
}) => {
    return (
        <Link
            href={href}
            className="flex items-center gap-4 px-2 py-2 text-base font-medium transition-colors rounded-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 group-hover:px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
            <div className="flex items-center justify-center w-8 h-8 shrink-0">{icon}</div>
            <span className="opacity-0 transition-opacity duration-150 ease-in-out whitespace-nowrap group-hover:opacity-100">
                {label}
            </span>
        </Link>
    );
};
