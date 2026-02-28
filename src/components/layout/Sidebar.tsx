import Link from "next/link";
import {
    HomeIcon,
    FolderIcon,
    CheckCircleIcon,
    BookOpenIcon,
    ShoppingBagIcon,
    BanknotesIcon,
} from "@heroicons/react/24/outline";
import { ThemeToggle } from "./ThemeToggle";

export const Sidebar = () => {
    return (
        <nav className="fixed inset-y-0 left-0 z-50 flex flex-col w-12 transition-all duration-150 ease-in-out bg-transparent border-r border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 group hover:w-64 hover:bg-neutral-50 dark:hover:bg-neutral-900 overflow-hidden">
            <div className="flex flex-col flex-1 gap-2 p-2 mt-4">
                <SidebarItem href="/" icon={<HomeIcon className="w-5 h-5 flex-shrink-0" />} label="Inbox" />
                <SidebarItem href="/projects" icon={<FolderIcon className="w-5 h-5 flex-shrink-0" />} label="Project" />
                <SidebarItem href="/tasks" icon={<CheckCircleIcon className="w-5 h-5 flex-shrink-0" />} label="Task & Schedule" />
                <SidebarItem href="/knowledge" icon={<BookOpenIcon className="w-5 h-5 flex-shrink-0" />} label="Knowledge" />
                <SidebarItem href="/items" icon={<ShoppingBagIcon className="w-5 h-5 flex-shrink-0" />} label="Item" />
                <SidebarItem href="/finance" icon={<BanknotesIcon className="w-5 h-5 flex-shrink-0" />} label="Finance" />
            </div>
            <div className="p-2 mb-4">
                <ThemeToggle />
            </div>
        </nav>
    );
};

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
            className="flex items-center gap-4 px-2 py-2 text-sm font-medium transition-colors rounded-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-50 group-hover:px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
        >
            <div className="flex items-center justify-center w-8 h-8 shrink-0">{icon}</div>
            <span className="opacity-0 transition-opacity duration-150 ease-in-out whitespace-nowrap group-hover:opacity-100">
                {label}
            </span>
        </Link>
    );
};
