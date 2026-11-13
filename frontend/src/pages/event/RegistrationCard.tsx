import { Info, QrCode, Ticket } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage, isApiError, type Answer, type Answers, type EventDetails, type EventViewerContext } from '@/api';
import { validateQuestionAnswers } from '@/api/questionAnswers';
import { useAuth } from '@/app/AuthProvider';
import type { LoginLocationState } from '@/features/pendingRegistration';
import { useRegisterForEvent } from '@/features/tickets';
import { Button, ButtonLink, Checkbox, Field, Input, Notice, useToast } from '@/shared/ui';
import { QuestionField } from './QuestionField';
import styles from './RegistrationCard.module.css';

interface Props {
  event: Pick<EventDetails, 'id' | 'slug' | 'status' | 'registeredCount' | 'capacity' | 'questions' | 'title'>;
  viewer?: EventViewerContext;
  preview?: 'guest' | 'participant';
}

type Errors = Record<string, string>;

export function RegistrationCard({ event, viewer, preview }: Props) {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const register = useRegisterForEvent();

  const [answers, setAnswers] = useState<Answers>({});
  const [guest, setGuest] = useState({ fullName: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const isGuest = preview ? preview === 'guest' : status !== 'authenticated';
  const full = event.registeredCount >= (event.capacity ?? 0);

  // --- Состояния без формы ---
  if (!preview && viewer?.ticketId) {
    return (
      <div className={styles.card}>
        <h2 className={styles.title}>Вы уже зарегистрированы</h2>
        <p className={styles.subtitle}>Билет с QR-кодом лежит в разделе «Мои билеты». Покажите его на входе.</p>
        <ButtonLink to={`/tickets?ticket=${viewer.ticketId}`} fullWidth icon={<Ticket size={18} />}>
          Открыть билет
        </ButtonLink>
      </div>
    );
  }

  if (!preview && (event.status === 'finished' || full)) {
    return (
      <div className={styles.card}>
        <h2 className={styles.title}>Регистрация закрыта</h2>
        <p className={styles.subtitle}>
          {event.status === 'finished' ? 'Мероприятие уже прошло.' : 'Все места заняты. Следите за новостями организатора.'}
        </p>
      </div>
    );
  }

  /** Ответы с подстановкой из профиля (вопрос про вуз/компанию). */
  function withProfileDefaults(source: Answers): Answers {
    const result = { ...source };
    if (!isGuest && user?.organization) {
      for (const question of event.questions) {
        if ((question.type === 'text' || question.type === 'textarea') &&
            result[question.id] === undefined && /вуз|компан|организац/i.test(question.label)) {
          result[question.id] = user.organization;
        }
      }
    }
    return result;
  }

  function setAnswer(id: string, value: Answer): void {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: '' }));
  }

  function validate(final: Answers): Errors {
    const next = validateQuestionAnswers(event.questions, final);
    if (isGuest) {
      if (!guest.fullName.trim()) next.fullName = 'Укажите имя и фамилию';
      if (!/^\S+@\S+\.\S+$/.test(guest.email.trim())) next.email = 'Проверьте почту';
    }
    if (!consent) next.consent = 'Нужно согласие с условиями';
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (preview) return;
    setFormError(null);
    const finalAnswers = withProfileDefaults(answers);
    const found = validate(finalAnswers);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    try {
      const result = await register.mutateAsync({
        eventId: event.id,
        body: { consentAccepted: consent, answers: finalAnswers, guest: isGuest ? guest : undefined },
      });
      if (isGuest) {
        const params = new URLSearchParams({ token: result.accessToken ?? result.ticket.qrToken });
        if (result.accountCreated) params.set('created', '1');
        navigate(`/e/${event.slug}/ticket/${result.ticket.id}?${params}`);
      } else {
        toast('Билет готов — он уже в «Мои билеты»', 'success');
        navigate(`/tickets?ticket=${result.ticket.id}`);
      }
    } catch (error) {
      if (isApiError(error, 'EMAIL_TAKEN')) {
        // Сценарий «почта уже зарегистрирована»: вход с сохранёнными ответами
        const state: LoginLocationState = {
          email: guest.email.trim(),
          pendingRegistration: {
            eventId: event.id,
            slug: event.slug,
            eventTitle: event.title,
            email: guest.email.trim(),
            answers: finalAnswers,
            consentAccepted: consent,
            phone: guest.phone,
            fullName: guest.fullName,
          },
        };
        navigate(`/login?returnUrl=${encodeURIComponent(`/e/${event.slug}`)}`, { state });
        return;
      }
      if (isApiError(error, 'VALIDATION') && error.fields) setErrors(error.fields);
      setFormError(getErrorMessage(error));
    }
  }

  const displayedAnswers = withProfileDefaults(answers);

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Регистрация</h2>
          <QrCode size={18} className={styles.qrIcon} aria-hidden />
        </div>
        <p className={styles.subtitle}>
          {isGuest
            ? 'Заполните форму для оформления именного электронного пропуска'
            : 'Имя, email и телефон берутся из профиля. Ответьте только на вопросы организатора'}
        </p>
      </div>

      <div className={styles.fields}>
        {isGuest ? (
          <>
            <Field label="Имя и фамилия" error={errors.fullName}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  autoComplete="name"
                  placeholder="Иван Петров"
                  value={guest.fullName}
                  onChange={(e) => setGuest({ ...guest, fullName: e.target.value })}
                  aria-describedby={describedBy}
                  invalid={!!errors.fullName}
                />
              )}
            </Field>
            <Field label="Email" aside="Для отправки билета" error={errors.email}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  placeholder="ivan@example.com"
                  value={guest.email}
                  onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                  aria-describedby={describedBy}
                  invalid={!!errors.email}
                />
              )}
            </Field>
            <Field label="Телефон">
              {(id) => (
                <Input
                  id={id}
                  type="tel"
                  autoComplete="tel"
                  placeholder="+7 (999) 000-00-00"
                  value={guest.phone}
                  onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                />
              )}
            </Field>
          </>
        ) : (
          user && (
            <div className={styles.profileBlock}>
              <span className={styles.profileLabel}>Вы регистрируетесь как</span>
              <span className={styles.profileValue}>
                {[user.fullName, user.email, user.phone].filter(Boolean).join(' · ')}
              </span>
              {!preview && <Link to="/profile" className={styles.profileLink}>Изменить в профиле</Link>}
            </div>
          )
        )}

        {event.questions.map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            value={displayedAnswers[q.id] ?? ''}
            error={errors[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
          />
        ))}

        <div>
          <Checkbox
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setErrors((prev) => ({ ...prev, consent: '' }));
            }}
            invalid={!!errors.consent}
          >
            Я согласен с <a href="#terms">условиями использования</a> и <a href="#privacy">политикой конфиденциальности</a>
          </Checkbox>
        </div>

        {formError && <Notice tone="danger">{formError}</Notice>}

        <Button type="submit" fullWidth disabled={!!preview} loading={register.isPending} icon={<Ticket size={18} />}>
          Получить QR-билет
        </Button>

        <Notice icon={<Info size={15} />} className={styles.delivery}>
          Билет с уникальным QR-кодом моментально появится в личном кабинете и придет на почту.
        </Notice>
      </div>
    </form>
  );
}
