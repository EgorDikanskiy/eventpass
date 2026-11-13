import { Page } from '@/layouts/Page';
import { ButtonLink, EmptyState } from '@/shared/ui';

export function NotFoundPage() {
  return (
    <Page>
      <EmptyState
        title="Страница не найдена"
        action={
          <ButtonLink to="/" size="sm" variant="secondary">
            На главную
          </ButtonLink>
        }
      >
        Возможно, ссылка устарела или в ней опечатка.
      </EmptyState>
    </Page>
  );
}
