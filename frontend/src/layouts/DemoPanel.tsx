import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Session } from '@/api';
import { resetMockDb } from '@/api/mock/db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/api/mock/demoAccounts';
import { useAuth } from '@/app/AuthProvider';
import styles from './DemoPanel.module.css';


/**
 * Панель для демонстрации на моках: быстрый вход под тестовыми аккаунтами,
 * ссылки на публичные страницы и сброс данных. В режиме http не показывается.
 */
export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const { signIn, signOut, user } = useAuth();
  const queryClient = useQueryClient();

  async function loginAs(email: string) {
    const session: Session = await api.auth.login({ email, password: DEMO_PASSWORD });
    signIn(session);
    setOpen(false);
  }

  return (
    <div className={styles.root}>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Демо-режим">
          <div className={styles.head}>
            <strong>Демо-режим (моки)</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть">
              <X size={16} />
            </button>
          </div>
          <p className={styles.caption}>Войти как (пароль у всех — {DEMO_PASSWORD}):</p>
          {DEMO_ACCOUNTS.map((account) => (
            <button key={account.email} type="button" className={styles.row} onClick={() => loginAs(account.email)}>
              <span>{account.email}</span>
              <small>{account.note}</small>
            </button>
          ))}
          {user && (
            <button type="button" className={styles.row} onClick={() => signOut()}>
              <span>Выйти и открыть как гость</span>
            </button>
          )}
          <p className={styles.caption}>Публичные страницы мероприятий:</p>
          <Link className={styles.link} to="/e/it-ds-2025" onClick={() => setOpen(false)}>
            /e/it-ds-2025 — IT & Data Science 2025
          </Link>
          <Link className={styles.link} to="/e/devfest-2026" onClick={() => setOpen(false)}>
            /e/devfest-2026 — DevFest
          </Link>
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              resetMockDb();
              queryClient.invalidateQueries();
              setOpen(false);
            }}
          >
            Сбросить демо-данные
          </button>
        </div>
      )}
      <button type="button" className={styles.fab} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <FlaskConical size={16} />
        Демо
      </button>
    </div>
  );
}
