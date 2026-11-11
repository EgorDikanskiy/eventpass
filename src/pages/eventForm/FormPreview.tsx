import { useState, type ReactNode } from 'react';
import type { Question } from '@/api';
import { RegistrationCard } from '@/pages/event/RegistrationCard';
import { Dialog, Segmented } from '@/shared/ui';
import styles from './EventFormPage.module.css';

type PreviewMode = 'guest' | 'participant';

interface Props {
  title: string;
  questions: Question[];
  onClose: () => void;
}

export function FormPreview({ title, questions, onClose }: Props): ReactNode {
  const [mode, setMode] = useState<PreviewMode>('guest');

  return (
    <Dialog open onClose={onClose} title="Предпросмотр анкеты">
      <div className={styles.preview}>
        <Segmented ariaLabel="Кто заполняет анкету" value={mode} onChange={setMode}
          items={[{ value: 'guest', label: 'Гость' }, { value: 'participant', label: 'Участник' }]} />
        <p>Проверьте поля и порядок вопросов. Введённые ответы не сохраняются.</p>
        {title.trim() && <p className={styles.previewTitle}>{title}</p>}
        <RegistrationCard key={mode} preview={mode}
          event={{ id: '', slug: '', title, status: 'draft', registeredCount: 0, capacity: 1,
            questions: questions.map((question, index) => ({
              ...question,
              label: question.label.trim() || `Вопрос ${index + 1}`,
            })),
          }} />
      </div>
    </Dialog>
  );
}
