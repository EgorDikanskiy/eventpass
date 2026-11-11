import { ArrowLeft } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiConfig, getErrorMessage, isApiError } from '@/api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/api/mock/demoAccounts';
import { useAuth } from '@/app/AuthProvider';
import type { LoginLocationState } from '@/features/pendingRegistration';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Button, Field, Input, Notice, PasswordInput, PageLoader, useToast } from '@/shared/ui';
import styles from './AuthCard.module.css';

/** Разрешаем возврат только на свои страницы, чтобы ?returnUrl нельзя было подменить внешней ссылкой. */
function safeReturnUrl(value: string | null): string | null {
  if (!value?.startsWith('/') || /^\/[\\/]/.test(value)) return null;
  return new URL(value, window.location.origin).origin === window.location.origin ? value : null;
}

/**
 * «Вход» и «Вход: почта уже зарегистрирована».
 * Во втором случае после входа регистрация на мероприятие завершается автоматически.
 */
export function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();
  const state = (location.state as LoginLocationState | null) ?? {};
  const pending = state.pendingRegistration;
  const returnUrl = safeReturnUrl(params.get('returnUrl'));

  const [email, setEmail] = useState(state.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const finishing = useRef(false);
  useDocumentTitle('Вход');

  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated' && !finishing.current) return <Navigate to={returnUrl ?? '/tickets'} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Введите почту и пароль');
      return;
    }
    setSubmitting(true);
    try {
      const session = await api.auth.login({ email: email.trim(), password });
      let target = returnUrl ?? '/tickets';

      if (pending) {
        try {
          const { ticket } = await api.registrations.register(pending.eventId, { answers: pending.answers });
          toast(`Регистрация на «${pending.eventTitle}» завершена`, 'success');
          target = `/tickets?ticket=${ticket.id}`;
        } catch (registrationError) {
          // Уже зарегистрирован раньше — просто открываем билеты
          if (!isApiError(registrationError, 'ALREADY_REGISTERED')) {
            toast(getErrorMessage(registrationError), 'danger');
            target = `/e/${pending.slug}`;
          } else {
            target = '/tickets';
          }
        }
      }

      finishing.current = true;
      signIn(session);
      navigate(target, { replace: true });
    } catch (loginError) {
      setError(
        isApiError(loginError, 'INVALID_CREDENTIALS') ? 'Неверная почта или пароль' : getErrorMessage(loginError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>Вход в EventPass</h1>
        {!pending && (
          <p>
            Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          </p>
        )}
      </div>

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        {pending && (
          <Notice tone="warning" title="У вас уже есть аккаунт">
            На {pending.email} уже зарегистрирован аккаунт. Войдите — и регистрация на «{pending.eventTitle}» завершится
            автоматически, ответы формы сохранены.
          </Notice>
        )}

        <Field label="Email">
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              placeholder="ivan@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!pending}
            />
          )}
        </Field>
        <Field label="Пароль">
          {(id) => (
            <PasswordInput
              id={id}
              autoComplete="current-password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={!!pending}
            />
          )}
        </Field>

        {apiConfig.mode === 'http' && (
          <Link to="/forgot-password" state={{ email }} className={styles.forgot}>
            Забыли пароль?
          </Link>
        )}

        {error && <Notice tone="danger">{error}</Notice>}

        {apiConfig.mode === 'mock' && !pending && (
          <Notice title="Демо-режим: тестовые аккаунты">
            Пароль у всех — <strong>{DEMO_PASSWORD}</strong>. Нажмите на почту, чтобы подставить:
            <span className={styles.demoList}>
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className={styles.demoAccount}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                >
                  <strong>{account.email}</strong> — {account.note}
                </button>
              ))}
            </span>
          </Notice>
        )}

        <Button type="submit" fullWidth loading={submitting}>
          {pending ? 'Войти и завершить регистрацию' : 'Войти'}
        </Button>

        {pending ? (
          <Link to={`/e/${pending.slug}`} className={styles.back}>
            <ArrowLeft size={14} />
            Вернуться к форме мероприятия
          </Link>
        ) : (
          <p className={styles.note}>
            После входа открывается «Мои билеты». Если вход открыт со страницы мероприятия — возвращаем на неё,
            регистрация завершается автоматически.
          </p>
        )}
      </form>
    </div>
  );
}
