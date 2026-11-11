import { ArrowRight, Banknote, CircleCheck, Eye, MapPin } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage, isApiError, OPTION_QUESTION_TYPES, type EventDetails, type EventInput, type PriceType, type Question } from '@/api';
import { useEventById, useSaveEvent } from '@/features/events';
import { BackLink } from '@/layouts/Page';
import { fromDateTimeInputs, toDateInput, toTimeInput } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { Button, ErrorState, Field, Input, Notice, PageLoader, Textarea, useToast } from '@/shared/ui';
import { FormPreview } from './FormPreview';
import { QuestionsEditor } from './QuestionsEditor';
import styles from './EventFormPage.module.css';

interface FormState {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  capacity: string;
  priceType: PriceType;
  questions: Question[];
}

function initialState(event?: EventDetails): FormState {
  if (event) {
    return {
      title: event.title,
      description: event.description,
      date: toDateInput(event.startsAt),
      time: toTimeInput(event.startsAt),
      location: event.location,
      capacity: String(event.capacity),
      priceType: event.priceType,
      questions: event.questions,
    };
  }
  return {
    title: '',
    description: '',
    date: '',
    time: '10:00',
    location: '',
    capacity: '100',
    priceType: 'free',
    questions: [{ id: 'q_university', label: 'Вуз / факультет', type: 'text', required: false }],
  };
}

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) errors.title = 'Укажите название';
  if (!form.date) errors.date = 'Укажите дату';
  if (!form.location.trim()) errors.location = 'Укажите место';
  const capacity = Number(form.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) errors.capacity = 'Целое число больше нуля';
  for (const q of form.questions) {
    if (!q.label.trim()) errors[q.id] = 'Введите текст вопроса или удалите его';
    else if (OPTION_QUESTION_TYPES.includes(q.type) && (q.options ?? []).some((o) => !o.label.trim())) errors[q.id] = 'Заполните варианты ответа';
  }
  return errors;
}

function EventForm({ event }: { event?: EventDetails }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveEvent();
  const [form, setForm] = useState<FormState>(() => initialState(event));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'draft' | 'publish' | null>(null);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const isPublished = !!event && event.status !== 'draft';

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  async function submit(publish: boolean) {
    setFormError(null);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError('Проверьте выделенные поля');
      return;
    }
    const input: EventInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      startsAt: fromDateTimeInputs(form.date, form.time),
      location: form.location.trim(),
      capacity: Number(form.capacity),
      priceType: form.priceType,
      questions: form.questions.map((q) => ({ ...q, label: q.label.trim() })),
    };
    setPendingAction(publish ? 'publish' : 'draft');
    try {
      const saved = await save.mutateAsync({ id: event?.id, input, publish });
      if (isPublished) {
        toast('Изменения сохранены', 'success');
        navigate('/events');
      } else if (publish) {
        navigate(`/events/${saved.id}/published`);
      } else {
        toast('Черновик сохранён', 'success');
        navigate('/events?tab=drafts');
      }
    } catch (error) {
      if (isApiError(error, 'VALIDATION') && error.fields) setErrors(error.fields);
      setFormError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(true);
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>
                <span className={styles.dotAccent} />
                Основные данные
              </h2>
              <span>Шаг 1 из 2</span>
            </div>

            <Field label="Название мероприятия" error={errors.title}>
              {(id) => (
                <Input
                  id={id}
                  placeholder="DevFest Студенческий форум"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  invalid={!!errors.title}
                />
              )}
            </Field>
            <Field label="Описание" hint="Показывается на публичной странице под названием">
              {(id) => (
                <Textarea
                  id={id}
                  rows={3}
                  placeholder="О чём мероприятие и кому будет интересно"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              )}
            </Field>
            <div className={styles.row2}>
              <Field label="Дата начала" error={errors.date}>
                {(id) => (
                  <Input id={id} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} invalid={!!errors.date} />
                )}
              </Field>
              <Field label="Время">
                {(id) => <Input id={id} type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />}
              </Field>
            </div>
            <Field label="Место / аудитория" error={errors.location}>
              {(id) => (
                <Input
                  id={id}
                  placeholder="Инкубатор Технопарка, Большой лекторий"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  suffix={<MapPin size={16} />}
                  invalid={!!errors.location}
                />
              )}
            </Field>
            <Field label="Лимит участников" error={errors.capacity}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={form.capacity}
                  onChange={(e) => set('capacity', e.target.value)}
                  suffix="чел."
                  invalid={!!errors.capacity}
                />
              )}
            </Field>
            <Field label="Стоимость участия" hint={form.priceType === 'paid' ? 'Оплата подключается в следующих версиях — пока это только отметка на странице' : undefined}>
              {() => (
                <div className={styles.price} role="radiogroup" aria-label="Стоимость участия">
                  {(
                    [
                      { value: 'free', label: 'Бесплатно', icon: CircleCheck },
                      { value: 'paid', label: 'Платно', icon: Banknote },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={form.priceType === value}
                      className={form.priceType === value ? styles.priceActive : undefined}
                      onClick={() => set('priceType', value)}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>
                <span className={styles.dotLight} />
                Поля анкеты
              </h2>
              <Button variant="secondary" size="sm" icon={<Eye size={16} />} onClick={() => setPreviewOpen(true)}>
                Предпросмотр
              </Button>
            </div>
            <QuestionsEditor
              questions={form.questions}
              errors={errors}
              onChange={(questions) => {
                setForm((prev) => ({ ...prev, questions }));
                setErrors({});
              }}
            />
          </section>
        </div>

        {formError && (
          <Notice tone="danger" className={styles.formError}>
            {formError}
          </Notice>
        )}

        <div className={styles.footer}>
          <p>
            <Eye size={18} />
            {isPublished
              ? 'Изменения сразу появятся на странице мероприятия'
              : 'Событие станет доступным по прямой ссылке сразу после публикации'}
          </p>
          <div className={styles.footerActions}>
            {!isPublished && (
              <Button variant="ghost" loading={pendingAction === 'draft'} disabled={!!pendingAction} onClick={() => submit(false)}>
                Сохранить черновик
              </Button>
            )}
            <Button type="submit" loading={pendingAction === 'publish'} disabled={!!pendingAction} iconRight={<ArrowRight size={18} />}>
              {isPublished ? 'Сохранить изменения' : 'Опубликовать мероприятие'}
            </Button>
          </div>
        </div>
      </form>
      {isPreviewOpen && (
        <FormPreview title={form.title} questions={form.questions} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}

/** «Организатор / Создание мероприятия» — та же форма для редактирования. */
export function EventFormPage() {
  const { eventId } = useParams();
  const { data: event, error, isPending, refetch } = useEventById(eventId);
  useDocumentTitle(eventId ? 'Редактирование мероприятия' : 'Новое мероприятие');

  return (
    <div className={styles.page}>
      <BackLink to="/events">Мои мероприятия</BackLink>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Конструктор события</span>
        <h1>{eventId ? 'Редактирование' : 'Новое мероприятие'}</h1>
        <p>Заполните ключевые параметры и настройте персональную анкету для участников в одном окне.</p>
      </header>

      {eventId && isPending ? (
        <PageLoader />
      ) : eventId && error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <EventForm key={event?.id ?? 'new'} event={event} />
      )}
    </div>
  );
}
