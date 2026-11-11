import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiConfig, getErrorMessage, isApiError, type User } from '@/api';
import { useAuth } from '@/app/AuthProvider';
import { useDeleteAccount, useUpdateProfile } from '@/features/profile';
import { Page, PageHeader } from '@/layouts/Page';
import { copyText } from '@/shared/lib/files';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Button, Card, ConfirmDialog, Field, Input, Notice, Toggle, useToast } from '@/shared/ui';
import styles from './ProfilePage.module.css';

type Form = Pick<User, 'fullName' | 'email'> & { phone: string; organization: string };

function PersonalData({ user }: { user: User }) {
  const update = useUpdateProfile();
  const toast = useToast();
  const [form, setForm] = useState<Form>({
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? '',
    organization: user.organization ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty =
    form.fullName !== user.fullName ||
    form.email !== user.email ||
    form.phone !== (user.phone ?? '') ||
    form.organization !== (user.organization ?? '');

  function set(field: keyof Form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = 'Укажите имя и фамилию';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Проверьте почту';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await update.mutateAsync({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        organization: form.organization.trim() || null,
      });
      toast('Изменения сохранены', 'success');
    } catch (error) {
      if (isApiError(error) && error.fields) setErrors(error.fields);
      else toast(getErrorMessage(error), 'danger');
    }
  }

  return (
    <Card className={styles.card}>
      <form onSubmit={handleSubmit} noValidate className={styles.form}>
        <h2 className={styles.cardTitle}>Личные данные</h2>
        <div className={styles.grid}>
          <Field label="Имя и фамилия" error={errors.fullName}>
            {(id) => (
              <Input id={id} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} invalid={!!errors.fullName} />
            )}
          </Field>
          <Field label="Email" error={errors.email}>
            {(id) => (
              <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />
            )}
          </Field>
          <Field label="Телефон">
            {(id) => (
              <Input id={id} type="tel" placeholder="+7 (999) 000-00-00" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            )}
          </Field>
          <Field label="Вуз / Компания">
            {(id) => (
              <Input id={id} placeholder="МГУ, ВМК, 3 курс" value={form.organization} onChange={(e) => set('organization', e.target.value)} />
            )}
          </Field>
        </div>
        <div>
          <Button type="submit" loading={update.isPending} disabled={!dirty}>
            Сохранить изменения
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AccountSettings({ user }: { user: User }) {
  const update = useUpdateProfile();
  const toast = useToast();
  const [resending, setResending] = useState(false);

  async function resendVerification(): Promise<void> {
    setResending(true);
    try {
      await api.auth.resendVerification(user.email);
      toast('Проверьте почту', 'success');
    } catch (error) {
      toast(getErrorMessage(error), 'danger');
    } finally {
      setResending(false);
    }
  }

  return (
    <Card className={styles.card}>
      <h2 className={styles.cardTitle}>Аккаунт</h2>
      {!user.emailVerified && (
        <Notice tone="warning" title="Почта не подтверждена">
          Перейдите по ссылке из письма.
          {apiConfig.mode === 'http' && (
            <Button variant="link" loading={resending} onClick={resendVerification}>Отправить письмо ещё раз</Button>
          )}
        </Notice>
      )}
      <div className={styles.settingRow}>
        <span>Ваш ID</span>
        <button
          type="button"
          className={styles.idChip}
          onClick={async () => {
            const ok = await copyText(user.publicId);
            toast(ok ? 'ID скопирован' : `Ваш ID: ${user.publicId}`);
          }}
        >
          #{user.publicId} · Копировать
        </button>
      </div>
      <div className={styles.settingRow}>
        <div>
          <span>Уведомления на email</span>
          <p className={styles.settingHint}>Билеты, напоминания и изменения мероприятий</p>
        </div>
        <Toggle
          label="Уведомления на email"
          checked={user.notificationsEnabled}
          disabled={update.isPending}
          onChange={(checked) =>
            update.mutate(
              { notificationsEnabled: checked },
              { onError: (error) => toast(getErrorMessage(error), 'danger') },
            )
          }
        />
      </div>
    </Card>
  );
}

function SessionAndDeletion() {
  const { signOut } = useAuth();
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  async function handleDelete() {
    try {
      await deleteAccount.mutateAsync();
      await signOut();
      toast('Аккаунт удалён');
      navigate('/login', { replace: true });
    } catch (error) {
      toast(getErrorMessage(error), 'danger');
    }
  }

  return (
    <Card className={styles.card}>
      <h2 className={styles.cardTitle}>Сессия и удаление</h2>
      <div className={styles.buttons}>
        <Button
          variant="secondary"
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
        >
          Выйти из аккаунта
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Удалить аккаунт
        </Button>
      </div>
      <p className={styles.settingHint}>
        Удаление необратимо: профиль, регистрации и билеты будут удалены. Требуется подтверждение в диалоге.
      </p>
      <ConfirmDialog
        open={confirm}
        title="Удалить аккаунт?"
        confirmLabel="Удалить навсегда"
        danger
        loading={deleteAccount.isPending}
        onConfirm={handleDelete}
        onClose={() => setConfirm(false)}
      >
        Профиль, билеты и созданные вами мероприятия будут удалены без возможности восстановления. Права волонтёра на мероприятиях
        тоже пропадут.
      </ConfirmDialog>
    </Card>
  );
}

/** «Участник / Профиль»: данные для регистраций, ID, уведомления, выход и удаление. */
export function ProfilePage() {
  const { user } = useAuth();
  useDocumentTitle('Профиль');
  if (!user) return null;

  return (
    <Page>
      <PageHeader title="Профиль" subtitle="Эти данные автоматически подставляются в формы регистрации на мероприятия" />
      <div className={styles.stack}>
        <PersonalData key={user.id + user.email} user={user} />
        <AccountSettings user={user} />
        <SessionAndDeletion />
      </div>
    </Page>
  );
}
