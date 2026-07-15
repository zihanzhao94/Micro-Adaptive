'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GraduationCap, LayoutDashboard, BookOpen, Lightbulb, Users,
  Settings, LogOut, ChevronRight
} from 'lucide-react';
import styles from './Sidebar.module.css';

// ⚠️ Mock data — replace with context/auth state when backend is ready
const MOCK_COURSE = {
  name: 'Introduction to ML',
  code: 'CS5228',
  year: 'AY2025/26',
};

const NAV = [
  { href: '/dashboard',            label: 'Overview',          icon: LayoutDashboard },
  { href: '/dashboard/materials',  label: 'Course Materials',  icon: BookOpen },
  { href: '/dashboard/intention',  label: 'Teaching Intention',icon: Lightbulb },
  { href: '/dashboard/students',   label: 'Students',          icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <GraduationCap size={20} />
        </div>
        <div>
          <div className={styles.brandName}>Micro-Adaptive</div>
          <div className={styles.brandRole}>Educator Portal</div>
        </div>
      </div>

      {/* Course Badge — shows active course (mock until auth context added) */}
      <div className={styles.courseBadge}>
        <div className={styles.courseDot} />
        <div>
          <div className={styles.courseName}>{MOCK_COURSE.name}</div>
          <div className={styles.courseCode}>{MOCK_COURSE.code} · {MOCK_COURSE.year}</div>
        </div>
        <ChevronRight size={14} className={styles.courseChevron} />
      </div>

      {/* Nav — matches wireframe: Overview / Course Materials / Teaching Intention / Students */}
      <nav className={styles.nav}>
        <div className={styles.navLabel}>Menu</div>
        {NAV.map(({ href, label, icon: Icon }) => {
          // treat /dashboard/students/* as active for Students link
          const active =
            href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              id={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
            >
              <Icon size={18} className={styles.navIcon} />
              <span>{label}</span>
              {active && <div className={styles.navActiveIndicator} />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — user info (mock until auth ready) */}
      <div className={styles.sidebarBottom}>
        <div className={styles.userRow}>
          <div className={styles.avatar}>DR</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>Dr. ABC</div>
            <div className={styles.userEmail}>abc@nus.edu.sg</div>
          </div>
        </div>
        <div className={styles.bottomActions}>
          <Link href="/settings" id="nav-settings" className={styles.bottomBtn}>
            <Settings size={15} />
          </Link>
          <Link href="/login" id="nav-logout" className={styles.bottomBtn}>
            <LogOut size={15} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
