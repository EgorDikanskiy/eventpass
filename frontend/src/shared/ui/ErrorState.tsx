import { getErrorMessage } from '@/api';
import { Button } from './Button';
import { EmptyState } from './Display';

/** Ошибка загрузки данных с кнопкой «Повторить». */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      title="Не удалось загрузить данные"
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        )
      }
    >
      {getErrorMessage(error)}
    </EmptyState>
  );
}
