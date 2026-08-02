import React from "react";
import { Sun, Moon, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { useTheme } from "./theme-provider";

interface PreferencesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreferencesModal({ open, onOpenChange }: PreferencesModalProps) {
  const { theme, setTheme } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Moon className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted-foreground">
                  {theme === "dark" ? "Dark mode" : "Light mode"}
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                theme === "dark" ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-600"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                theme === "dark" ? "translate-x-[18px]" : "translate-x-[3px]"
              }`} />
            </button>
          </div>

          {/* Language (future) */}
          <div className="flex items-center justify-between opacity-50">
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Language</div>
                <div className="text-xs text-muted-foreground">Coming soon</div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">English</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
