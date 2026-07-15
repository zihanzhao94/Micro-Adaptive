import Sidebar from './Sidebar';
import styles from './dashboard.module.css';

export const metadata = {
  title: 'Dashboard | Micro-Adaptive',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.dashboardShell}>
      <Sidebar />
      <main className={styles.dashboardMain}>
        {children}
      </main>
    </div>
  );
}
