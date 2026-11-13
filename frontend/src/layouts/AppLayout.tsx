import clsx from 'clsx';
import { Ticket } from 'lucide-react';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router-dom';
import { apiConfig } from '@/api';
import { useAuth } from '@/app/AuthProvider';
import { useMyEvents } from '@/features/events';
import { Avatar } from '@/shared/ui';
import { DemoPanel } from './DemoPanel';
import { DevRoleBadge } from './DevRoleBadge';
import styles from './AppLayout.module.css';

export function Logo() {
  return (
    <Link to="/" className={styles.logo} aria-label="EventPass — на главную">
      <span className={styles.logoMark}>
        <Ticket size={18} />
      </span>
      EventPass
    </Link>
  );
}

function Header() {
  const { status, user } = useAuth();
  const { data } = useMyEvents('organizing', status === 'authenticated');
  const roles = data?.roles ?? [];
  const navigation = [
    { to: '/tickets', label: 'Мои билеты' },
    roles.includes('organizer') || roles.includes('volunteer')
      ? { to: '/events', label: 'Мои мероприятия' }
      : { to: '/events/new', label: 'Создать событие' },
    { to: '/profile', label: 'Профиль' },
  ];
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Logo />
        {status === 'authenticated' && user && (
          <>
            <nav className={styles.nav} aria-label="Основная навигация">
              {navigation.map((item) => (
                <NavLink
                  end={item.to === '/events'}
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => clsx(styles.navLink, isActive && styles.navLinkActive)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className={styles.userArea}>
              <DevRoleBadge />
              <Link to="/profile" className={styles.avatarLink} title={`${user.fullName} · ${user.email}`}>
                <Avatar name={user.fullName} size={32} accent />
              </Link>
            </div>
          </>
        )}
        {status === 'guest' && (
          <div className={styles.guestActions}>
            <DevRoleBadge />
            <Link to="/login" className={styles.loginLink}>
              Войти
            </Link>
            <Link to="/register" className={styles.registerLink}>
              Регистрация
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p>© {new Date().getFullYear()} EventPass. Платформа регистрации и аккредитации мероприятий.</p>
        <nav className={styles.footerLinks} aria-label="Информация">
          <a href="#privacy">Конфиденциальность</a>
          <a href="#terms">Условия использования</a>
          <a href="mailto:support@eventpass.ru">Поддержка</a>
        </nav>
      </div>
    </footer>
  );
}

/** Общий каркас desktop-экранов: шапка, контент, подвал. */
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
      {apiConfig.mode === 'mock' && <DemoPanel />}
      <ScrollRestoration />
    </div>
  );
}
