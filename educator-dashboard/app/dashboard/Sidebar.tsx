'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  GraduationCap, LayoutDashboard, BookOpen, Lightbulb, Network, Users,
  CalendarClock, MessageSquareQuote, Settings, LogOut, ChevronRight
} from 'lucide-react';
import styles from './Sidebar.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

type CourseProfile = {
  name: string;
  code: string;
  year: string;
  educatorName: string;
  educatorEmail: string;
};

const NAV = [
  { href: '/dashboard',            label: 'Overview',          icon: LayoutDashboard },
  { href: '/dashboard/materials',  label: 'Course Materials',  icon: BookOpen },
  { href: '/dashboard/schedule',   label: 'Weekly Push',       icon: CalendarClock },
  { href: '/dashboard/reflections',label: 'Reflections',       icon: MessageSquareQuote },
  { href: '/dashboard/concepts',   label: 'Course Concepts',   icon: Network },
  { href: '/dashboard/intention',  label: 'Teaching Intention',icon: Lightbulb },
  { href: '/dashboard/students',   label: 'Students',          icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [course, setCourse] = useState<CourseProfile>({
    name: 'Course Workspace',
    code: 'Course',
    year: 'Current',
    educatorName: 'Educator',
    educatorEmail: '',
  });

  useEffect(() => {
    const loadCourse = async () => {
      const response = await fetch(`${API_BASE}/course`);
      if (!response.ok) return;
      const body: { course: CourseProfile } = await response.json();
      setCourse(body.course);
    };

    loadCourse().catch(() => undefined);
  }, []);

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

      <div className={styles.courseBadge}>
        <div className={styles.courseDot} />
        <div>
          <div className={styles.courseName}>{course.name}</div>
          <div className={styles.courseCode}>{course.code} · {course.year}</div>
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

      <div className={styles.sidebarBottom}>
        <div className={styles.userRow}>
          <div className={styles.avatar}>{course.educatorName.slice(0, 2).toUpperCase()}</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{course.educatorName}</div>
            <div className={styles.userEmail}>{course.educatorEmail || 'No email'}</div>
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
