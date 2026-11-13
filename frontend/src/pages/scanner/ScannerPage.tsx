import { Camera, ScanLine } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiConfig, getErrorMessage, isApiError, type ScanLogItem, type ScanResult } from '@/api';
import { getDemoCodes } from '@/api/mock/demo';
import { useScan, useScannerInfo } from '@/features/scanner';
import { BackLink } from '@/layouts/Page';
import { ForbiddenRedirect } from '@/pages/organizer/ForbiddenRedirect';
import { formatDate, formatTimeWithSeconds } from '@/shared/lib/format';
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  Input,
  KeyValue,
  Notice,
  PageLoader,
  ResultMark,
  StatusDot,
} from '@/shared/ui';
import { useQrCamera, type CameraState } from './useQrCamera';
import styles from './ScannerPage.module.css';

const RESULT_VIEW = {
  allowed: { tone: 'success', title: 'Проход разрешён' },
  already_used: { tone: 'warning', title: 'Билет уже использован' },
  invalid: { tone: 'danger', title: 'Билет недействителен' },
} as const;

const LOG_VIEW = {
  allowed: { tone: 'success', label: 'Пропущен' },
  already_used: { tone: 'warning', label: 'Повтор' },
  invalid: { tone: 'danger', label: 'Отклонён' },
} as const;

const CAMERA_TEXT: Record<CameraState, string> = {
  idle: 'Камера выключена',
  starting: 'Включаем камеру…',
  active: 'Камера активна',
  denied: 'Нет доступа к камере',
  unsupported: 'Распознавание QR недоступно',
  error: 'Камера недоступна',
};

function ResultPanel({ result, onNext }: { result: ScanResult | null; onNext: () => void }) {
  if (!result) {
    return (
      <Card className={styles.result}>
        <span className={styles.waiting}>
          <ScanLine size={32} />
        </span>
        <h2 className={styles.resultTitle}>Ожидание сканирования</h2>
        <p className={styles.resultHint}>Наведите камеру на QR-код или введите номер билета вручную.</p>
      </Card>
    );
  }

  const view = RESULT_VIEW[result.result];
  return (
    <Card className={styles.result} aria-live="polite">
      <ResultMark tone={view.tone} size={72} />
      <h2 className={styles.resultTitle} data-tone={view.tone}>
        {view.title}
      </h2>
      <div className={styles.details}>
        {result.reason && <KeyValue label="Причина">{result.reason}</KeyValue>}
        {result.holderName && <KeyValue label="Участник">{result.holderName}</KeyValue>}
        {result.category && <KeyValue label="Категория">{result.category}</KeyValue>}
        {result.ticketCode && <KeyValue label="Билет">#{result.ticketCode}</KeyValue>}
        {result.checkedInAt && (
          <KeyValue label={result.result === 'already_used' ? 'Первый проход' : 'Время чекина'}>
            {formatTimeWithSeconds(result.checkedInAt)}
          </KeyValue>
        )}
        {result.checkedInBy && <KeyValue label="Отметил">{result.checkedInBy}</KeyValue>}
      </div>
      <Button fullWidth onClick={onNext}>
        Сканировать следующий
      </Button>
    </Card>
  );
}

function RecentScans({ items }: { items: ScanLogItem[] }) {
  if (!items.length) return null;
  return (
    <Card className={styles.recent}>
      <h3>Последние сканирования</h3>
      <ul>
        {items.map((item) => {
          const view = LOG_VIEW[item.result];
          const name = item.holderName ?? 'Неизвестный код';
          return (
            <li key={item.id}>
              <Avatar name={name} size={32} />
              <div>
                <strong>{name}</strong>
                <span>
                  {formatTimeWithSeconds(item.scannedAt)} · {item.note || (item.ticketCode ? `#${item.ticketCode}` : '')}
                </span>
              </div>
              <StatusDot tone={view.tone}>{view.label}</StatusDot>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * «Волонтёр / Сканер мероприятия». Доступен организатору и волонтёрам.
 * Проверка билета выполняется на сервере (POST /events/{id}/scan).
 */
export function ScannerPage() {
  const { eventId = '' } = useParams();
  const info = useScannerInfo(eventId);
  const scan = useScan(eventId);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<unknown>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useQrCamera(videoRef, (value) => void check(value));
  useDocumentTitle(info.data ? `Сканер · ${info.data.event.title}` : 'Сканер');

  async function check(code: string) {
    if (!code.trim() || scan.isPending) return;
    setScanError(null);
    try {
      setResult(await scan.mutateAsync(code));
    } catch (error) {
      setScanError(error);
    }
  }

  function next() {
    setResult(null);
    setManualCode('');
    camera.resume();
  }

  function handleManual(e: FormEvent) {
    e.preventDefault();
    void check(manualCode);
  }

  if (info.isPending) return <PageLoader />;
  if (isApiError(info.error, 'FORBIDDEN') || isApiError(scanError, 'FORBIDDEN')) {
    return <ForbiddenRedirect message="Права на сканирование отозваны или не выдавались" to="/events?tab=volunteering" />;
  }
  if (isApiError(info.error, 'NOT_FOUND')) return <ForbiddenRedirect message="Мероприятие не найдено" />;
  if (info.error || !info.data) return <ErrorState error={info.error} onRetry={() => info.refetch()} />;

  const { event, viewerRole, checkedByMe, recent } = info.data;
  const demoCodes = apiConfig.mode === 'mock' ? getDemoCodes(eventId) : [];

  return (
    <div className={styles.page}>
      {viewerRole === 'organizer' ? (
        <BackLink to={`/events/${eventId}/dashboard`}>Дашборд</BackLink>
      ) : (
        <BackLink to="/events?tab=volunteering">Мои мероприятия</BackLink>
      )}
      <header className={styles.header}>
        <div>
          <h1>{event.title}</h1>
          <p>
            {formatDate(event.startsAt)}
            {event.checkpoint && ` · ${event.checkpoint}`} · Проверено вами: {checkedByMe}
          </p>
        </div>
        <StatusDot tone={camera.state === 'active' ? 'success' : 'muted'}>{CAMERA_TEXT[camera.state]}</StatusDot>
      </header>

      <div className={styles.grid}>
        <div className={styles.left}>
          <div className={styles.viewport}>
            <video ref={videoRef} className={styles.video} muted playsInline hidden={camera.state !== 'active'} />
            <div className={styles.frame} aria-hidden />
            <div className={styles.viewportText}>
              {camera.state === 'active' ? (
                'Наведите камеру на QR-код билета'
              ) : camera.state === 'unsupported' ? (
                'Этот браузер не распознаёт QR с камеры — введите номер билета вручную или откройте сканер в Chrome на телефоне'
              ) : camera.state === 'denied' ? (
                'Разрешите доступ к камере в настройках браузера'
              ) : (
                <Button variant="secondary" icon={<Camera size={16} />} loading={camera.state === 'starting'} onClick={camera.start}>
                  Включить камеру
                </Button>
              )}
            </div>
          </div>

          <form className={styles.manual} onSubmit={handleManual}>
            <Input
              placeholder="Ввести код билета вручную, напр. EVT-849102"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              aria-label="Код билета"
            />
            <Button type="submit" variant="secondary" loading={scan.isPending}>
              Проверить
            </Button>
          </form>

          {scanError !== null && <Notice tone="danger">{getErrorMessage(scanError)}</Notice>}

          {demoCodes.length > 0 && (
            <div className={styles.demo}>
              <span>Демо-коды:</span>
              {demoCodes.map((item) => (
                <button key={item.code} type="button" onClick={() => void check(item.code)} disabled={scan.isPending}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.right}>
          <ResultPanel result={result} onNext={next} />
          <RecentScans items={recent} />
        </div>
      </div>
    </div>
  );
}
