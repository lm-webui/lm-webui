import React, { useState } from "react";
import { LogOut, Users, BarChart3, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { useAuth } from "@/contexts/AuthContext";
import { UserManagementModal } from "@/components/auth/UserManagementModal";
import { UsageAnalyticsModal } from "@/components/auth/UsageAnalyticsModal";
import { PreferencesModal } from "./PreferencesModal";

export function ProfilePopover() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setOpen(false);
  };

  const menuItemClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="w-full flex items-center gap-2.5 rounded-3xl shadow-inner hover:shadow-inner bg-neutral-200 p-1.5 hover:bg-zinc-100 focus-visible:outline-none dark:bg-zinc-800/60 dark:hover:bg-zinc-700/60 transition-colors">
          <div className="grid h-8 w-8 ml-1.5 mr-0.5 place-items-center rounded-full bg-zinc-900/50 shadow-inner text-xs font-bold text-white dark:bg-white/90 dark:text-zinc-900">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium text-neutral-600 dark:text-neutral-300">
              {user?.email?.split("@")[0] || "User"}
            </div>
            <div className="truncate text-xs capitalize text-zinc-500 dark:text-zinc-400">
              {user?.role || "user"} workspace
            </div>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start" side="top">
        <div className="p-2">
          <button onClick={() => { setPreferencesOpen(true); setOpen(false); }} className={menuItemClass}>
            <Settings2 className="h-4 w-4" /><span>Preference</span>
          </button>
          {user?.role === "admin" && <button onClick={() => { setUserManagementOpen(true); setOpen(false); }} className={menuItemClass}><Users className="h-4 w-4" /><span>User management</span></button>}
          {user?.role === "admin" && <button onClick={() => { setUsageOpen(true); setOpen(false); }} className={menuItemClass}><BarChart3 className="h-4 w-4" /><span>Usage analytics</span></button>}
          <button
            onClick={handleLogout}
            className={`${menuItemClass} text-red-600 dark:text-red-400`}
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>
        </div>
      </PopoverContent>
      <PreferencesModal open={preferencesOpen} onOpenChange={setPreferencesOpen} />
      <UserManagementModal open={userManagementOpen} onOpenChange={setUserManagementOpen} />
      <UsageAnalyticsModal open={usageOpen} onOpenChange={setUsageOpen} />
    </Popover>
  );
}
