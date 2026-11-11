import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '@/api';
import { useAuth } from '@/app/AuthProvider';
import { queryKeys } from '@/features/queryKeys';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Button, Field, Input, Notice, PasswordInput, useToast } from '@/shared/ui';
import styles from './AuthCard.module.css';

export function ForgotPasswordPage() {
  const location = useLocation();
  const prefill = location.state as { email?: string } | null;
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useDocumentTitle('Восстановление пароля');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.auth.requestPasswordReset(email.trim());
      setSent(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}><h1>Восстановление пароля</h1></div>
      <form className={styles.card} onSubmit={submit}>
        {sent ? (
          <Notice tone="success">Если аккаунт существует, на эту почту придёт ссылка.</Notice>
        ) : (
          <>
            <Field label="Email">
              {(id) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" loading={submitting}>Отправить ссылку</Button>
          </>
        )}
        <Link to="/login">Вернуться ко входу</Link>
      </form>
    </div>
  );
}

export function AccountLinkPage() {
  const { hash } = useLocation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('token');
  const action = params.get('action');
  const needsPassword = action === 'setup' || action === 'reset';
  const title = needsPassword ? 'Задать пароль' : 'Подтверждение почты';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useDocumentTitle(title);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      await api.auth.useEmailLink(token, needsPassword ? password : undefined);
      if (needsPassword && user) await signOut();
      if (!needsPassword) await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast(needsPassword ? 'Пароль сохранён' : 'Почта подтверждена', 'success');
      navigate(!needsPassword && user ? '/profile' : '/login', { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}><h1>{title}</h1></div>
      <form className={styles.card} onSubmit={submit}>
        {!token || (!needsPassword && action !== 'verify') ? (
          <Notice tone="danger">Ссылка недействительна.</Notice>
        ) : (
          <>
            {needsPassword && (
              <Field label="Новый пароль" aside="Мин. 8 символов">
                {(id) => <PasswordInput id={id} autoComplete="new-password" minLength={8} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} />}
              </Field>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" loading={submitting}>{needsPassword ? 'Сохранить пароль' : 'Подтвердить почту'}</Button>
          </>
        )}
        <Link to="/login">Вернуться ко входу</Link>
      </form>
    </div>
  );
}
