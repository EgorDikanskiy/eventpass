import { ShieldCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, getErrorMessage, isApiError } from '@/api';
import { useAuth } from '@/app/AuthProvider';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Button, Checkbox, Field, Input, Notice, PasswordInput, PageLoader, useToast } from '@/shared/ui';
import styles from './AuthCard.module.css';

type Errors = Partial<Record<'fullName' | 'email' | 'password' | 'consent', string>>;

/** «Регистрация аккаунта»: имя, email, пароль — без выбора типа аккаунта. */
export function RegisterPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const prefill = (location.state as { email?: string; fullName?: string } | null) ?? {};

  const [form, setForm] = useState({ fullName: prefill.fullName ?? '', email: prefill.email ?? '', password: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const finishing = useRef(false);
  useDocumentTitle('Регистрация');

  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated' && !finishing.current) return <Navigate to="/tickets" replace />;

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: Errors = {};
    if (!form.fullName.trim()) next.fullName = 'Укажите имя и фамилию';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Проверьте почту';
    if (form.password.length < 8) next.password = 'Минимум 8 символов';
    if (!consent) next.consent = 'Нужно согласие';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const session = await api.auth.signUp({ ...form, email: form.email.trim() });
      finishing.current = true;
      signIn(session);
      toast('Аккаунт создан. Мы отправили письмо для подтверждения почты', 'success');
      navigate('/tickets', { replace: true });
    } catch (error) {
      if (isApiError(error) && error.fields) setErrors(error.fields as Errors);
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>Создать аккаунт</h1>
        <p>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <Field label="Имя и фамилия" error={errors.fullName}>
          {(id) => (
            <Input
              id={id}
              autoComplete="name"
              placeholder="Иван Петров"
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
              invalid={!!errors.fullName}
            />
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              placeholder="ivan@example.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              invalid={!!errors.email}
            />
          )}
        </Field>
        <Field label="Пароль" aside="Мин. 8 символов" error={errors.password}>
          {(id) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              placeholder="Минимум 8 символов"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              invalid={!!errors.password}
            />
          )}
        </Field>

        <Checkbox
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            setErrors((prev) => ({ ...prev, consent: undefined }));
          }}
          invalid={!!errors.consent}
        >
          Я согласен с <a href="#terms">условиями использования</a> и <a href="#privacy">политикой конфиденциальности</a>
        </Checkbox>

        {formError && <Notice tone="danger">{formError}</Notice>}

        <Button type="submit" fullWidth loading={submitting}>
          Создать аккаунт
        </Button>

        <div className={styles.footerRow}>
          <span>
            <ShieldCheck size={14} />
            Защищённое соединение
          </span>
          <span>v0.1.0</span>
        </div>
      </form>
    </div>
  );
}
