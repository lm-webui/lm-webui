import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Logout failed');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getInitials = (email: string | undefined) => {
    if (!email) return 'U';
    const username = email.split('@')[0]; // Get the part before @
    if (!username) return 'U';
    return username
      .split(/[.\-_]/) // Split by common separators
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#171717]/5 border border-white/10 backdrop-blur-sm rounded-3xl ">
        <DialogHeader>
          <DialogTitle className="text-white text-center">Profile</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* User Avatar and Info */}
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-semibold">
              {user ? getInitials(user.email) : 'U'}
            </div>
            <div className="flex-1">
              <h3 className="text-white text-lg font-semibold">
                {user?.email || 'User'}
              </h3>
              <p className="text-white/70 text-sm">
                Member since Unknown
              </p>
            </div>
          </div>

          {/* User Details */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/70 text-sm">Email:</span>
              <span className="text-white text-sm font-medium">{user?.email}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/70 text-sm">User ID:</span>
              <span className="text-white text-sm font-medium">
                {user?.id || 'Unknown'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-transparent border-white/20 text-white hover:bg-white/10"
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              Logout
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal;
