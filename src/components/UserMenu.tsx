import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronDown,
  LogOut,
  Settings,
  Shield,
  ShieldCheck,
  Crown,
  LayoutDashboard,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/auth';

const roleLabels: Record<UserRole, string> = {
  Admin: 'Administrator',
  CEO: 'Executive (CEO)',
  Team: 'Marketing Team',
};

const managerRoles: UserRole[] = ['Admin', 'CEO'];

interface MenuItemProps {
  to?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}

function MenuItem({ to, icon: Icon, label, onClick }: MenuItemProps) {
  const className =
    'flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors';

  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}

function getInitials(email?: string | null) {
  if (!email) {
    return 'SO';
  }
  const [localPart] = email.split('@');
  if (!localPart) {
    return 'SO';
  }
  const [first, second] = localPart;
  if (!second) {
    return localPart.slice(0, 2).toUpperCase();
  }
  return `${first}${second}`.toUpperCase();
}

export default function UserMenu() {
  const { profile, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const initials = useMemo(() => getInitials(profile?.email ?? user?.email ?? null), [profile?.email, user?.email]);
  const isManager = profile ? managerRoles.includes(profile.role) : false;

  const handleSignOut = () => {
    setOpen(false);
    void signOut();
  };

  const RoleBadgeIcon = profile?.role === 'Admin' ? ShieldCheck : profile?.role === 'CEO' ? Crown : BadgeCheck;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-3 rounded-full border border-gray-200 bg-white pl-1 pr-3 py-1 shadow-sm hover:border-red-200 hover:bg-red-50 transition-all"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="w-9 h-9 rounded-full bg-red-500 text-white font-semibold flex items-center justify-center">
          {initials}
        </div>
        <div className="hidden lg:flex flex-col items-start text-left">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">Account</span>
          <span className="text-sm font-semibold text-gray-800">{roleLabels[profile?.role ?? 'Team']}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-100 bg-white shadow-lg shadow-red-100/40 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-800 truncate">{profile?.email ?? user?.email}</p>
            <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
              <RoleBadgeIcon className="w-3.5 h-3.5" />
              <span>{roleLabels[profile?.role ?? 'Team']}</span>
              {profile?.immutableRole && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                  <Shield className="w-3 h-3" /> Locked role
                </span>
              )}
            </p>
          </div>

          <nav className="py-1">
            <MenuItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" onClick={() => setOpen(false)} />
            <MenuItem to="/permissions" icon={Shield} label="Permissions" onClick={() => setOpen(false)} />
            <MenuItem to="/settings" icon={Settings} label="Workspace settings" onClick={() => setOpen(false)} />
            {isManager && (
              <MenuItem to="/user-management" icon={UserCog} label="User management" onClick={() => setOpen(false)} />
            )}
          </nav>

          <div className="border-t border-gray-100">
            <MenuItem icon={LogOut} label="Log out" onClick={handleSignOut} />
          </div>
        </div>
      )}
    </div>
  );
}
